import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProBillingInterval, ProPurchaseType } from "@/lib/plans";
import type { Database } from "@/lib/supabase/types";
import { customerDisplayName } from "@/lib/streampay.server";
import { publicSiteUrl } from "@/lib/siteUrl.server";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

function optionalEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid_gift_email");
  return email;
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

export const startStreamPayCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    interval?: string;
    purchaseType?: string;
    locale?: string;
    giftRecipientEmail?: string | null;
    giftMessage?: string | null;
  }) => {
    const interval = input.interval;
    if (interval !== "monthly" && interval !== "six_months" && interval !== "yearly") {
      throw new Error("invalid_interval");
    }
    const purchaseType: ProPurchaseType = input.purchaseType === "gift" ? "gift" : "direct";
    const locale = input.locale === "en" ? "en" : "ar";
    return {
      interval: interval as ProBillingInterval,
      purchaseType,
      locale: locale as "ar" | "en",
      giftRecipientEmail: purchaseType === "gift" ? optionalEmail(input.giftRecipientEmail) : null,
      giftMessage: purchaseType === "gift" ? optionalText(input.giftMessage, 500) : null,
    };
  })
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client.server");
      const { createStreamPayCheckout } = await import("@/lib/streampay.server");
      const { userId } = context;
      const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (error || !userData.user?.email) {
        console.error("[streampay] checkout missing account email", { userId, message: error?.message ?? null });
        return { ok: false as const, error: "email_required", message: "Account email is missing" };
      }

      const { data: profile } = await supabaseAdmin
        .from("link_in_bio_profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();

      const metadata =
        userData.user.user_metadata && typeof userData.user.user_metadata === "object"
          ? (userData.user.user_metadata as Record<string, unknown>)
          : null;
      const name = customerDisplayName({
        email: userData.user.email,
        metadata,
        profileName: profile?.display_name?.trim() || null,
      });
      const request = getRequest();
      return await createStreamPayCheckout({
        userId,
        email: userData.user.email,
        name,
        interval: data.interval,
        purchaseType: data.purchaseType,
        locale: data.locale,
        origin: publicSiteUrl(request),
        giftRecipientEmail: data.giftRecipientEmail,
        giftMessage: data.giftMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "streampay_checkout_failed";
      console.error("[streampay] checkout handler threw", { message });
      return { ok: false as const, error: "streampay_checkout_failed", message };
    }
  });

function referenceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(text)) return null;
  return text;
}

/**
 * Browser return from StreamPay. Confirms the invoice/payment with StreamPay
 * (or an already stored purchase) before granting Pro. The redirect status
 * query is not accepted as proof.
 */
export const confirmStreamPayReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paymentId?: string | null; invoiceId?: string | null; paymentLinkId?: string | null }) => {
    const paymentId = referenceId(input?.paymentId);
    const invoiceId = referenceId(input?.invoiceId);
    const paymentLinkId = referenceId(input?.paymentLinkId);
    if (!paymentId && !invoiceId && !paymentLinkId) throw new Error("missing_reference");
    return { paymentId, invoiceId, paymentLinkId };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { fulfillProPurchase } = await import("@/lib/proPurchase.server");
    const { resolveConfirmedStreamPayCheckout } = await import("@/lib/streampay.server");
    const { publicSiteUrl } = await import("@/lib/siteUrl.server");
    const request = getRequest();
    const { userId } = context;

    const stored = await findStoredStreamPayPurchase(supabaseAdmin, data);
    if (stored && stored.user_id && stored.user_id !== userId) {
      return { ok: false as const, error: "not_owner" as const };
    }

    const confirmed = await resolveConfirmedStreamPayCheckout({
      paymentId: data.paymentId,
      invoiceId: data.invoiceId,
      paymentLinkId: data.paymentLinkId,
    });

    if (!confirmed.ok) {
      if (stored?.user_id === userId) {
        return fulfillStoredPurchase(supabaseAdmin, stored, publicSiteUrl(request));
      }
      return { ok: false as const, error: confirmed.error };
    }

    if (confirmed.checkout.userId && confirmed.checkout.userId !== userId) {
      return { ok: false as const, error: "not_owner" as const };
    }

    const checkout = confirmed.checkout;
    const result = await fulfillProPurchase(supabaseAdmin, {
      email: checkout.email,
      userId: checkout.userId ?? userId,
      interval: checkout.interval,
      amountCents: checkout.amountSar != null ? Math.round(checkout.amountSar * 100) : null,
      currency: checkout.currency,
      provider: "streampay",
      providerPaymentId: checkout.paymentId,
      siteUrl: publicSiteUrl(request),
      locale: checkout.locale,
      purchaseType: checkout.purchaseType,
      buyerName: checkout.buyerName,
      ...(checkout.giftRecipientEmail ? { giftRecipientEmail: checkout.giftRecipientEmail } : {}),
      ...(checkout.giftMessage ? { giftMessage: checkout.giftMessage } : {}),
      metadata: {
        streampay_invoice_id: checkout.invoiceId,
        streampay_payment_id: checkout.paymentId,
        source: "return",
      },
    });
    return presentFulfillment(result);
  });

type StoredPurchase = {
  id: string;
  user_id: string | null;
  email: string;
  billing_interval: string;
  duration_days: number;
  provider_payment_id: string;
  purchase_type: string;
  gift_recipient_email: string | null;
  gift_message: string | null;
  amount_cents: number | null;
  currency: string;
};

async function findStoredStreamPayPurchase(
  admin: SupabaseClient<Database>,
  ids: { paymentId: string | null; invoiceId: string | null },
): Promise<StoredPurchase | null> {
  const columns =
    "id, user_id, email, billing_interval, duration_days, provider_payment_id, purchase_type, gift_recipient_email, gift_message, amount_cents, currency";
  if (ids.paymentId) {
    const { data } = await admin
      .from("pro_purchases")
      .select(columns)
      .eq("provider", "streampay")
      .eq("provider_payment_id", ids.paymentId)
      .maybeSingle();
    if (data) return data;
  }
  if (ids.invoiceId) {
    const { data } = await admin
      .from("pro_purchases")
      .select(columns)
      .eq("provider", "streampay")
      .filter("metadata->>streampay_invoice_id", "eq", ids.invoiceId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

async function fulfillStoredPurchase(
  admin: SupabaseClient<Database>,
  stored: StoredPurchase,
  siteUrl: string,
) {
  const { fulfillProPurchase } = await import("@/lib/proPurchase.server");
  const interval = stored.billing_interval;
  if (interval !== "monthly" && interval !== "six_months" && interval !== "yearly" && interval !== "lifetime" && interval !== "custom") {
    return { ok: false as const, error: "missing_metadata" as const };
  }
  const result = await fulfillProPurchase(admin, {
    email: stored.email,
    userId: stored.user_id,
    interval,
    durationDays: stored.duration_days,
    amountCents: stored.amount_cents,
    currency: stored.currency,
    provider: "streampay",
    providerPaymentId: stored.provider_payment_id,
    siteUrl,
    purchaseType: stored.purchase_type === "gift" ? "gift" : "direct",
    ...(stored.gift_recipient_email ? { giftRecipientEmail: stored.gift_recipient_email } : {}),
    ...(stored.gift_message ? { giftMessage: stored.gift_message } : {}),
  });
  return presentFulfillment(result);
}

function presentFulfillment(
  result: Awaited<ReturnType<typeof import("@/lib/proPurchase.server").fulfillProPurchase>>,
) {
  if (!result.ok) return { ok: false as const, error: result.error };
  return {
    ok: true as const,
    purchaseType: result.purchaseType,
    activation: result.activation,
    emailedTo: result.emailedTo,
    emailDelivered: result.email.delivered,
    expiresAt: result.expiresAt ?? null,
    idempotent: result.idempotent,
  };
}
