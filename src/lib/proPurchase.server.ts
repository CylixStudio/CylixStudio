import type { SupabaseClient } from "@supabase/supabase-js";

import { sendSms, sendTemplateEmail } from "@/lib/email.server";
import type { ProBillingInterval, ProPurchaseType } from "@/lib/plans";
import {
  durationDaysForInterval,
  formatActivationCode,
  intervalLabel,
} from "@/lib/proPurchase";
import type { Database, Json } from "@/lib/supabase/types";

type AdminClient = SupabaseClient<Database>;

export type FulfillProPurchaseInput = {
  email: string;
  userId?: string | null;
  interval: ProBillingInterval | "lifetime" | "custom";
  durationDays?: number;
  amountCents?: number | null;
  currency?: string;
  provider: string;
  providerPaymentId: string;
  phone?: string | null;
  siteUrl: string;
  locale?: "ar" | "en";
  metadata?: Record<string, unknown>;
  /** Default gift for backwards compatibility with older webhooks. */
  purchaseType?: ProPurchaseType;
  giftRecipientEmail?: string | null;
  giftMessage?: string | null;
  buyerName?: string | null;
  /**
   * Paid checkout that must not turn Pro on. A unique code is stored on the
   * purchase and emailed to the buyer account address for later redemption.
   */
  emailActivationCode?: boolean;
};

export type FulfillProPurchaseResult =
  | {
      ok: true;
      purchaseId: string;
      purchaseType: ProPurchaseType;
      code: string | null;
      durationDays: number;
      email: { delivered: boolean; error?: string };
      sms: { delivered: boolean; error?: string };
      idempotent: boolean;
      activation: "direct" | "pending_manual_redeem";
      expiresAt?: string | null;
    }
  | { ok: false; error: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

async function insertUniqueCode(
  admin: AdminClient,
  args: {
    durationDays: number;
    purchaserUserId: string | null;
    notes: string;
    codeExpiresAt: string | null;
  },
): Promise<{ id: string; code: string } | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const { data, error } = await admin
      .from("activation_codes")
      .insert({
        code,
        duration_days: args.durationDays,
        is_used: false,
        is_active: true,
        is_revoked: false,
        notes: args.notes,
        source: "purchase",
        purchaser_user_id: args.purchaserUserId,
        code_expires_at: args.codeExpiresAt,
      })
      .select("id, code")
      .single();

    if (!error && data) return data;
    if (error && /duplicate|unique/i.test(error.message)) continue;
    console.error("[pro-purchase] insert code failed", {
      message: error?.message,
      code: error?.code,
      attempt,
    });
    return null;
  }
  return null;
}

/** Apply Pro to user_subscriptions (extends active expiry when present). */
async function activateProDirectly(
  admin: AdminClient,
  args: { userId: string; durationDays: number; paymentRef: string },
): Promise<{ ok: true; expiresAt: string; isLifetime: boolean } | { ok: false; error: string }> {
  const isLifetime = args.durationDays >= 36500;
  const { data: current, error: currentError } = await admin
    .from("user_subscriptions")
    .select("expires_at, is_lifetime")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (currentError) {
    console.error("[pro-purchase] subscription lookup failed", currentError);
    return { ok: false, error: "subscription_lookup_failed" };
  }

  const now = Date.now();
  const currentExpiry = current?.expires_at ? Date.parse(current.expires_at) : NaN;
  const baseMs =
    Number.isFinite(currentExpiry) && currentExpiry > now ? currentExpiry : now;

  const lifetime = isLifetime || Boolean(current?.is_lifetime);
  const expiresAt = lifetime
    ? new Date(now + 100 * 365.25 * 86_400_000).toISOString()
    : new Date(baseMs + args.durationDays * 86_400_000).toISOString();

  const { error: upsertError } = await admin.from("user_subscriptions").upsert(
    {
      user_id: args.userId,
      subscription_status: "active",
      expires_at: expiresAt,
      is_lifetime: lifetime,
      active_code: `direct:${args.paymentRef}`.slice(0, 64),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    console.error("[pro-purchase] direct activate failed", upsertError);
    return { ok: false, error: "direct_activation_failed" };
  }

  return { ok: true, expiresAt, isLifetime: lifetime };
}

async function deliverSelfActivationEmail(args: {
  toEmail: string;
  code: string;
  interval: FulfillProPurchaseInput["interval"];
  durationDays: number;
  siteUrl: string;
  locale: "ar" | "en";
  purchaseId: string;
}): Promise<{ delivered: boolean; error?: string }> {
  const result = await sendTemplateEmail(
    args.toEmail,
    {
      template: "pro_activation",
      data: {
        siteUrl: args.siteUrl,
        code: args.code,
        interval: args.interval,
        durationDays: args.durationDays,
        locale: args.locale,
      },
    },
    {
      tags: [
        { name: "template", value: "pro_activation" },
        { name: "purchase_id", value: args.purchaseId.slice(0, 48) },
      ],
    },
  );

  if (result.ok) return { delivered: true };
  console.error("[pro-purchase] activation code email failed", {
    purchaseId: args.purchaseId,
    email: args.toEmail,
    error: result.error,
    skipped: result.skipped,
  });
  return { delivered: false, error: result.error };
}

async function deliverGiftEmail(args: {
  toEmail: string;
  code: string;
  interval: FulfillProPurchaseInput["interval"];
  durationDays: number;
  siteUrl: string;
  locale: "ar" | "en";
  purchaseId: string;
  giftMessage?: string | null;
  fromName?: string | null;
}): Promise<{ delivered: boolean; error?: string }> {
  const result = await sendTemplateEmail(
    args.toEmail,
    {
      template: "gift_activation",
      data: {
        siteUrl: args.siteUrl,
        code: args.code,
        interval: args.interval,
        durationDays: args.durationDays,
        locale: args.locale,
        ...(args.giftMessage ? { giftMessage: args.giftMessage } : {}),
        ...(args.fromName ? { fromName: args.fromName } : {}),
      },
    },
    {
      tags: [
        { name: "template", value: "gift_activation" },
        { name: "purchase_id", value: args.purchaseId.slice(0, 48) },
      ],
    },
  );

  if (result.ok) return { delivered: true };
  console.error("[pro-purchase] gift email failed", {
    purchaseId: args.purchaseId,
    email: args.toEmail,
    error: result.error,
    skipped: result.skipped,
  });
  return { delivered: false, error: result.error };
}

async function deliverDirectConfirmation(args: {
  toEmail: string;
  interval: FulfillProPurchaseInput["interval"];
  durationDays: number;
  siteUrl: string;
  locale: "ar" | "en";
  purchaseId: string;
  expiresAt: string | null;
}): Promise<{ delivered: boolean; error?: string }> {
  const result = await sendTemplateEmail(
    args.toEmail,
    {
      template: "direct_activated",
      data: {
        siteUrl: args.siteUrl,
        interval: args.interval,
        durationDays: args.durationDays,
        expiresAt: args.expiresAt,
        locale: args.locale,
      },
    },
    {
      tags: [
        { name: "template", value: "direct_activated" },
        { name: "purchase_id", value: args.purchaseId.slice(0, 48) },
      ],
    },
  );

  if (result.ok) return { delivered: true };
  console.error("[pro-purchase] direct confirmation email failed", {
    purchaseId: args.purchaseId,
    email: args.toEmail,
    error: result.error,
    skipped: result.skipped,
  });
  return { delivered: false, error: result.error };
}

async function resolveBuyerUserId(
  admin: AdminClient,
  input: FulfillProPurchaseInput,
  email: string,
): Promise<string | null> {
  let userId = input.userId?.trim() || null;
  if (userId) return userId;

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profileError) {
    console.warn("[pro-purchase] user email lookup failed", profileError.message);
  }
  return profile?.id ?? null;
}

/**
 * After a successful Pro payment:
 * - emailActivationCode → unique code emailed to the buyer; Pro stays off until redeem
 * - purchaseType=direct → activate Pro on the buyer account (no activation code email)
 * - purchaseType=gift → generate a code and email it (recipient email or buyer)
 */
export async function fulfillProPurchase(
  admin: AdminClient,
  input: FulfillProPurchaseInput,
): Promise<FulfillProPurchaseResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };

  const provider = (input.provider || "checkout").trim().slice(0, 64);
  const providerPaymentId = input.providerPaymentId.trim().slice(0, 191);
  if (!providerPaymentId) return { ok: false, error: "missing_payment_id" };

  const purchaseType: ProPurchaseType = input.purchaseType === "direct" ? "direct" : "gift";
  const emailActivationCode = input.emailActivationCode === true;
  const giftRecipientEmail = normalizeEmail(input.giftRecipientEmail);
  const giftMessage = input.giftMessage?.trim().slice(0, 500) || null;
  const durationDays = durationDaysForInterval(input.interval, input.durationDays);
  const currency = (input.currency || "USD").toUpperCase().slice(0, 8);
  const locale = input.locale ?? "ar";

  const { data: existing, error: existingError } = await admin
    .from("pro_purchases")
    .select(
      "id, activation_code_id, code_delivered_at, purchase_type, activated_at, gift_recipient_email, gift_message, user_id",
    )
    .eq("provider", provider)
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();

  if (existingError) {
    console.error("[pro-purchase] lookup failed", existingError);
    return { ok: false, error: "purchase_lookup_failed" };
  }

  if (existing) {
    const existingType: ProPurchaseType =
      existing.purchase_type === "direct" ? "direct" : "gift";

    if (existing.activation_code_id && existingType === "direct" && !existing.activated_at) {
      const { data: codeRow, error: codeError } = await admin
        .from("activation_codes")
        .select("code, duration_days")
        .eq("id", existing.activation_code_id)
        .maybeSingle();

      if (codeError) {
        console.error("[pro-purchase] code lookup failed", codeError);
        return { ok: false, error: "code_lookup_failed" };
      }

      if (codeRow?.code) {
        let emailStatus: { delivered: boolean; error?: string } = {
          delivered: Boolean(existing.code_delivered_at),
        };
        if (!existing.code_delivered_at) {
          emailStatus = await deliverSelfActivationEmail({
            toEmail: email,
            code: codeRow.code,
            interval: input.interval,
            durationDays: codeRow.duration_days,
            siteUrl: input.siteUrl,
            locale,
            purchaseId: existing.id,
          });
          if (emailStatus.delivered) {
            await admin
              .from("pro_purchases")
              .update({ code_delivered_at: new Date().toISOString() })
              .eq("id", existing.id);
          }
        }
        return {
          ok: true,
          purchaseId: existing.id,
          purchaseType: "direct",
          code: codeRow.code,
          durationDays: codeRow.duration_days,
          email: emailStatus,
          sms: { delivered: false, error: "skipped_idempotent" },
          idempotent: true,
          activation: "pending_manual_redeem",
        };
      }
    }

    if (existingType === "direct") {
      let emailStatus: { delivered: boolean; error?: string } = {
        delivered: Boolean(existing.code_delivered_at),
      };
      if (!existing.code_delivered_at) {
        emailStatus = await deliverDirectConfirmation({
          toEmail: email,
          interval: input.interval,
          durationDays,
          siteUrl: input.siteUrl,
          locale,
          purchaseId: existing.id,
          expiresAt: null,
        });
        if (emailStatus.delivered) {
          await admin
            .from("pro_purchases")
            .update({ code_delivered_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
      }
      return {
        ok: true,
        purchaseId: existing.id,
        purchaseType: "direct",
        code: null,
        durationDays,
        email: emailStatus,
        sms: { delivered: false, error: "skipped_idempotent" },
        idempotent: true,
        activation: "direct",
      };
    }

    if (existing.activation_code_id) {
      const { data: codeRow, error: codeError } = await admin
        .from("activation_codes")
        .select("code, duration_days")
        .eq("id", existing.activation_code_id)
        .maybeSingle();

      if (codeError) {
        console.error("[pro-purchase] code lookup failed", codeError);
        return { ok: false, error: "code_lookup_failed" };
      }

      if (codeRow?.code) {
        let emailStatus: { delivered: boolean; error?: string } = {
          delivered: Boolean(existing.code_delivered_at),
        };
        const deliverTo =
          normalizeEmail(existing.gift_recipient_email) ?? email;

        if (!existing.code_delivered_at) {
          const selfAddressed = !normalizeEmail(existing.gift_recipient_email);
          emailStatus = selfAddressed
            ? await deliverSelfActivationEmail({
                toEmail: email,
                code: codeRow.code,
                interval: input.interval,
                durationDays: codeRow.duration_days,
                siteUrl: input.siteUrl,
                locale,
                purchaseId: existing.id,
              })
            : await deliverGiftEmail({
                toEmail: deliverTo,
                code: codeRow.code,
                interval: input.interval,
                durationDays: codeRow.duration_days,
                siteUrl: input.siteUrl,
                locale,
                purchaseId: existing.id,
                ...(existing.gift_message ? { giftMessage: existing.gift_message } : {}),
                ...(input.buyerName ? { fromName: input.buyerName } : {}),
              });
          if (emailStatus.delivered) {
            const { error: markError } = await admin
              .from("pro_purchases")
              .update({ code_delivered_at: new Date().toISOString() })
              .eq("id", existing.id);
            if (markError) {
              console.error("[pro-purchase] mark delivered failed", markError);
            }
          }
        }

        return {
          ok: true,
          purchaseId: existing.id,
          purchaseType: "gift",
          code: codeRow.code,
          durationDays: codeRow.duration_days,
          email: emailStatus,
          sms: { delivered: false, error: "skipped_idempotent" },
          idempotent: true,
          activation: "pending_manual_redeem",
        };
      }
    }
  }

  const userId = await resolveBuyerUserId(admin, input, email);

  if (emailActivationCode) {
    const codeExpiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const notes = `purchase:email-code:${provider}:${providerPaymentId}`;
    const inserted = await insertUniqueCode(admin, {
      durationDays,
      purchaserUserId: userId,
      notes,
      codeExpiresAt,
    });
    if (!inserted) return { ok: false, error: "code_generation_failed" };

    const { data: purchase, error: purchaseError } = await admin
      .from("pro_purchases")
      .insert({
        user_id: userId,
        email,
        billing_interval: input.interval === "custom" ? "custom" : input.interval,
        duration_days: durationDays,
        amount_cents: input.amountCents ?? null,
        currency,
        provider,
        provider_payment_id: providerPaymentId,
        status: "paid",
        purchase_type: "direct",
        activated_at: null,
        gift_recipient_email: null,
        gift_message: null,
        activation_code_id: inserted.id,
        metadata: (input.metadata ?? {}) as Json,
      })
      .select("id")
      .single();

    if (purchaseError || !purchase) {
      console.error("[pro-purchase] insert activation-code purchase failed", purchaseError);
      return { ok: false, error: purchaseError?.message ?? "purchase_insert_failed" };
    }

    const { error: linkError } = await admin
      .from("activation_codes")
      .update({ purchase_id: purchase.id })
      .eq("id", inserted.id);
    if (linkError) {
      console.error("[pro-purchase] link code→purchase failed", linkError);
    }

    const emailStatus = await deliverSelfActivationEmail({
      toEmail: email,
      code: inserted.code,
      interval: input.interval,
      durationDays,
      siteUrl: input.siteUrl,
      locale,
      purchaseId: purchase.id,
    });

    if (emailStatus.delivered) {
      const { error: markError } = await admin
        .from("pro_purchases")
        .update({ code_delivered_at: new Date().toISOString() })
        .eq("id", purchase.id);
      if (markError) {
        console.error("[pro-purchase] mark delivered failed", markError);
      }
    }

    console.info("[pro-purchase] fulfilled (activation code emailed)", {
      purchaseId: purchase.id,
      email,
      durationDays,
      emailDelivered: emailStatus.delivered,
    });

    return {
      ok: true,
      purchaseId: purchase.id,
      purchaseType: "direct",
      code: inserted.code,
      durationDays,
      email: emailStatus,
      sms: { delivered: false },
      idempotent: false,
      activation: "pending_manual_redeem",
    };
  }

  if (purchaseType === "direct") {
    if (!userId) return { ok: false, error: "direct_requires_user" };

    const activated = await activateProDirectly(admin, {
      userId,
      durationDays,
      paymentRef: `${provider}:${providerPaymentId}`,
    });
    if (!activated.ok) return activated;

    const { data: purchase, error: purchaseError } = await admin
      .from("pro_purchases")
      .insert({
        user_id: userId,
        email,
        billing_interval: input.interval === "custom" ? "custom" : input.interval,
        duration_days: durationDays,
        amount_cents: input.amountCents ?? null,
        currency,
        provider,
        provider_payment_id: providerPaymentId,
        status: "paid",
        purchase_type: "direct",
        activated_at: new Date().toISOString(),
        gift_recipient_email: null,
        gift_message: null,
        activation_code_id: null,
        metadata: (input.metadata ?? {}) as Json,
      })
      .select("id")
      .single();

    if (purchaseError || !purchase) {
      console.error("[pro-purchase] insert direct purchase failed", purchaseError);
      return { ok: false, error: purchaseError?.message ?? "purchase_insert_failed" };
    }

    const emailStatus = await deliverDirectConfirmation({
      toEmail: email,
      interval: input.interval,
      durationDays,
      siteUrl: input.siteUrl,
      locale,
      purchaseId: purchase.id,
      expiresAt: activated.expiresAt,
    });

    if (emailStatus.delivered) {
      await admin
        .from("pro_purchases")
        .update({ code_delivered_at: new Date().toISOString() })
        .eq("id", purchase.id);
    }

    console.info("[pro-purchase] fulfilled (direct activation)", {
      purchaseId: purchase.id,
      userId,
      email,
      durationDays,
      emailDelivered: emailStatus.delivered,
    });

    return {
      ok: true,
      purchaseId: purchase.id,
      purchaseType: "direct",
      code: null,
      durationDays,
      email: emailStatus,
      sms: { delivered: false },
      idempotent: false,
      activation: "direct",
      expiresAt: activated.expiresAt,
    };
  }

  // ── Gift / code path ─────────────────────────────────────────────────────
  const codeExpiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const notes = `purchase:gift:${provider}:${providerPaymentId}`;

  const inserted = await insertUniqueCode(admin, {
    durationDays,
    purchaserUserId: userId,
    notes,
    codeExpiresAt,
  });
  if (!inserted) return { ok: false, error: "code_generation_failed" };

  const deliverTo = giftRecipientEmail ?? email;

  const { data: purchase, error: purchaseError } = await admin
    .from("pro_purchases")
    .insert({
      user_id: userId,
      email,
      billing_interval: input.interval === "custom" ? "custom" : input.interval,
      duration_days: durationDays,
      amount_cents: input.amountCents ?? null,
      currency,
      provider,
      provider_payment_id: providerPaymentId,
      status: "paid",
      purchase_type: "gift",
      gift_recipient_email: giftRecipientEmail,
      gift_message: giftMessage,
      activation_code_id: inserted.id,
      metadata: (input.metadata ?? {}) as Json,
    })
    .select("id")
    .single();

  if (purchaseError || !purchase) {
    console.error("[pro-purchase] insert gift purchase failed", purchaseError);
    return { ok: false, error: purchaseError?.message ?? "purchase_insert_failed" };
  }

  const { error: linkError } = await admin
    .from("activation_codes")
    .update({ purchase_id: purchase.id })
    .eq("id", inserted.id);
  if (linkError) {
    console.error("[pro-purchase] link code→purchase failed", linkError);
  }

  const emailStatus = giftRecipientEmail
    ? await deliverGiftEmail({
        toEmail: deliverTo,
        code: inserted.code,
        interval: input.interval,
        durationDays,
        siteUrl: input.siteUrl,
        locale,
        purchaseId: purchase.id,
        ...(giftMessage ? { giftMessage } : {}),
        ...(input.buyerName || email ? { fromName: input.buyerName ?? email } : {}),
      })
    : await deliverSelfActivationEmail({
        toEmail: email,
        code: inserted.code,
        interval: input.interval,
        durationDays,
        siteUrl: input.siteUrl,
        locale,
        purchaseId: purchase.id,
      });

  if (emailStatus.delivered) {
    const { error: markError } = await admin
      .from("pro_purchases")
      .update({ code_delivered_at: new Date().toISOString() })
      .eq("id", purchase.id);
    if (markError) {
      console.error("[pro-purchase] mark delivered failed", markError);
    }
  }

  let smsResult: { delivered: boolean; error?: string } = { delivered: false };
  const phone = input.phone?.trim();
  if (phone) {
    const duration = intervalLabel(input.interval, durationDays);
    const sms = await sendSms(
      phone,
      `CylixStudio Pro (${duration}) — الرمز: ${formatActivationCode(inserted.code)}. فعّله من الإعدادات. لا تشاركه.`,
    );
    smsResult = sms.ok ? { delivered: true } : { delivered: false, error: sms.error };
  }

  console.info("[pro-purchase] fulfilled (gift / pending redeem)", {
    purchaseId: purchase.id,
    email,
    deliverTo,
    durationDays,
    emailDelivered: emailStatus.delivered,
    smsDelivered: smsResult.delivered,
  });

  return {
    ok: true,
    purchaseId: purchase.id,
    purchaseType: "gift",
    code: inserted.code,
    durationDays,
    email: emailStatus,
    sms: smsResult,
    idempotent: false,
    activation: "pending_manual_redeem",
  };
}
