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
      emailedTo: string | null;
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

function paymentRef(provider: string, providerPaymentId: string): string {
  return `direct:${provider}:${providerPaymentId}`.slice(0, 64);
}

function metadataRecord(value: Json | null | undefined): Record<string, Json> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, Json>) };
  }
  return {};
}

/** Legacy rows set activated_at only after a successful grant. In-flight claims set the flag false. */
function entitlementAlreadyApplied(
  metadata: Record<string, Json>,
  activatedAt: string | null,
): boolean {
  if (metadata["entitlement_applied"] === true) return true;
  if (metadata["entitlement_applied"] === false) return false;
  return Boolean(activatedAt);
}

async function readSubscription(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("subscription_status, expires_at, active_code, is_lifetime")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[pro-purchase] subscription lookup failed", error);
    return { error: "subscription_lookup_failed" as const, row: null };
  }
  return { error: null, row: data };
}

function subscriptionIsLive(row: {
  subscription_status: string;
  expires_at: string | null;
  is_lifetime: boolean;
} | null): boolean {
  if (!row || row.subscription_status !== "active") return false;
  if (row.is_lifetime) return true;
  return Boolean(row.expires_at && Date.parse(row.expires_at) > Date.now());
}

async function claimEntitlement(
  admin: AdminClient,
  purchaseId: string,
  metadata: Record<string, Json>,
): Promise<boolean> {
  const now = new Date().toISOString();
  const next: Record<string, Json> = {
    ...metadata,
    entitlement_applied: false,
    entitlement_claimed_at: now,
  };
  const { data, error } = await admin
    .from("pro_purchases")
    .update({ activated_at: now, metadata: next as Json, updated_at: now })
    .eq("id", purchaseId)
    .is("activated_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[pro-purchase] claim entitlement failed", { message: error.message });
    return false;
  }
  return Boolean(data);
}

async function markEntitlementApplied(
  admin: AdminClient,
  purchaseId: string,
  metadata: Record<string, Json>,
): Promise<void> {
  const next: Record<string, Json> = { ...metadata, entitlement_applied: true };
  const { error } = await admin
    .from("pro_purchases")
    .update({ metadata: next as Json, updated_at: new Date().toISOString() })
    .eq("id", purchaseId);
  if (error) console.error("[pro-purchase] mark entitlement failed", { message: error.message });
}

async function releaseEntitlementClaim(
  admin: AdminClient,
  purchaseId: string,
  metadata: Record<string, Json>,
): Promise<void> {
  const next = { ...metadata };
  delete next["entitlement_applied"];
  delete next["entitlement_claimed_at"];
  await admin
    .from("pro_purchases")
    .update({ activated_at: null, metadata: next as Json, updated_at: new Date().toISOString() })
    .eq("id", purchaseId);
}

async function pause(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserve pro_purchases.code_delivered_at before sending.
 * A second webhook for the same payment loses the update and does not send again.
 * The stamp is cleared only when the provider call fails, so a later fulfillment can retry.
 */
async function claimActivationEmail(
  admin: AdminClient,
  purchaseId: string,
): Promise<"claimed" | "already_sent" | "error"> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("pro_purchases")
    .update({ code_delivered_at: now, updated_at: now })
    .eq("id", purchaseId)
    .is("code_delivered_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[pro-purchase] claim activation email failed", { message: error.message });
    return "error";
  }
  return data ? "claimed" : "already_sent";
}

async function releaseActivationEmailClaim(admin: AdminClient, purchaseId: string): Promise<void> {
  const { error } = await admin
    .from("pro_purchases")
    .update({ code_delivered_at: null, updated_at: new Date().toISOString() })
    .eq("id", purchaseId);
  if (error) {
    console.error("[pro-purchase] release activation email claim failed", { message: error.message });
  }
}

async function deliverPurchaseEmailOnce(
  admin: AdminClient,
  args: {
    purchaseId: string;
    alreadyDelivered: boolean;
    toEmail: string;
    template: string;
    send: () => ReturnType<typeof sendTemplateEmail>;
  },
): Promise<{ delivered: boolean; error?: string }> {
  if (args.alreadyDelivered) return { delivered: true };

  const claim = await claimActivationEmail(admin, args.purchaseId);
  if (claim === "already_sent") return { delivered: true };
  if (claim === "error") return { delivered: false, error: "email_claim_failed" };

  const status = await deliverActivationEmail(args.send, {
    purchaseId: args.purchaseId,
    toEmail: args.toEmail,
    template: args.template,
  });
  if (!status.delivered) await releaseActivationEmailClaim(admin, args.purchaseId);
  return status;
}

/** Sends an activation-code email, retrying transient provider failures. */
async function deliverActivationEmail(
  send: () => ReturnType<typeof sendTemplateEmail>,
  context: { purchaseId: string; toEmail: string; template: string },
): Promise<{ delivered: boolean; error?: string }> {
  const maxAttempts = 3;
  let lastError = "email_failed";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await send();
    if (result.ok) {
      console.info("[pro-purchase] activation email sent", {
        purchaseId: context.purchaseId,
        toEmail: context.toEmail,
        template: context.template,
        attempt,
        id: result.id,
      });
      return { delivered: true };
    }
    lastError = result.error;
    console.error("[pro-purchase] activation email attempt failed", {
      purchaseId: context.purchaseId,
      toEmail: context.toEmail,
      template: context.template,
      attempt,
      maxAttempts,
      error: result.error,
      skipped: result.skipped ?? false,
    });
    if (result.skipped || attempt === maxAttempts) break;
    await pause(400 * attempt);
  }
  return { delivered: false, error: lastError };
}

async function deliverSelfActivationEmail(
  admin: AdminClient,
  args: {
    toEmail: string;
    code: string;
    interval: FulfillProPurchaseInput["interval"];
    durationDays: number;
    siteUrl: string;
    locale: "ar" | "en";
    purchaseId: string;
    alreadyDelivered: boolean;
  },
): Promise<{ delivered: boolean; error?: string }> {
  return deliverPurchaseEmailOnce(admin, {
    purchaseId: args.purchaseId,
    alreadyDelivered: args.alreadyDelivered,
    toEmail: args.toEmail,
    template: "pro_activation",
    send: () =>
      sendTemplateEmail(
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
      ),
  });
}

async function deliverGiftEmail(
  admin: AdminClient,
  args: {
    toEmail: string;
    code: string;
    interval: FulfillProPurchaseInput["interval"];
    durationDays: number;
    siteUrl: string;
    locale: "ar" | "en";
    purchaseId: string;
    alreadyDelivered: boolean;
    giftMessage?: string | null;
    fromName?: string | null;
  },
): Promise<{ delivered: boolean; error?: string }> {
  return deliverPurchaseEmailOnce(admin, {
    purchaseId: args.purchaseId,
    alreadyDelivered: args.alreadyDelivered,
    toEmail: args.toEmail,
    template: "gift_activation",
    send: () =>
      sendTemplateEmail(
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
      ),
  });
}

async function deliverDirectConfirmation(
  admin: AdminClient,
  args: {
    toEmail: string;
    interval: FulfillProPurchaseInput["interval"];
    durationDays: number;
    siteUrl: string;
    locale: "ar" | "en";
    purchaseId: string;
    alreadyDelivered: boolean;
    expiresAt: string | null;
  },
): Promise<{ delivered: boolean; error?: string }> {
  return deliverPurchaseEmailOnce(admin, {
    purchaseId: args.purchaseId,
    alreadyDelivered: args.alreadyDelivered,
    toEmail: args.toEmail,
    template: "direct_activated",
    send: () =>
      sendTemplateEmail(
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
      ),
  });
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

async function grantDirectEntitlement(
  admin: AdminClient,
  args: {
    purchaseId: string;
    userId: string;
    activatedAt: string | null;
    metadata: Json | null;
    codeDeliveredAt: string | null;
    durationDays: number;
    provider: string;
    providerPaymentId: string;
    email: string;
    interval: FulfillProPurchaseInput["interval"];
    siteUrl: string;
    locale: "ar" | "en";
    idempotent: boolean;
  },
): Promise<FulfillProPurchaseResult> {
  const meta = metadataRecord(args.metadata);
  const ref = paymentRef(args.provider, args.providerPaymentId);
  let applied = entitlementAlreadyApplied(meta, args.activatedAt);
  let expiresAt: string | null = null;

  const finishEmail = async (expires: string | null, idempotent: boolean): Promise<FulfillProPurchaseResult> => {
    const emailStatus = await deliverDirectConfirmation(admin, {
      toEmail: args.email,
      interval: args.interval,
      durationDays: args.durationDays,
      siteUrl: args.siteUrl,
      locale: args.locale,
      purchaseId: args.purchaseId,
      alreadyDelivered: Boolean(args.codeDeliveredAt),
      expiresAt: expires,
    });
    return {
      ok: true,
      purchaseId: args.purchaseId,
      purchaseType: "direct",
      code: null,
      durationDays: args.durationDays,
      email: emailStatus,
      sms: idempotent
        ? { delivered: false, error: "skipped_idempotent" }
        : { delivered: false },
      idempotent,
      activation: "direct",
      emailedTo: args.email,
      expiresAt: expires,
    };
  };

  if (!applied) {
    const current = await readSubscription(admin, args.userId);
    if (current.error) return { ok: false, error: current.error };
    if (current.row?.active_code === ref) {
      await markEntitlementApplied(admin, args.purchaseId, meta);
      applied = true;
      expiresAt = current.row.expires_at;
    }
  }

  if (!applied && args.activatedAt) {
    const claimedAt = Date.parse(String(meta["entitlement_claimed_at"] ?? args.activatedAt));
    const age = Number.isFinite(claimedAt) ? Date.now() - claimedAt : 0;
    if (age < 15_000) {
      for (let attempt = 0; attempt < 6; attempt++) {
        await pause(400);
        const again = await readSubscription(admin, args.userId);
        if (again.row?.active_code === ref) {
          await markEntitlementApplied(admin, args.purchaseId, meta);
          return finishEmail(again.row.expires_at, true);
        }
      }
      return { ok: false, error: "activation_in_progress" };
    }
  }

  if (!applied) {
    let claimed = false;
    if (!args.activatedAt) {
      claimed = await claimEntitlement(admin, args.purchaseId, meta);
    } else {
      const now = new Date().toISOString();
      const next: Record<string, Json> = {
        ...meta,
        entitlement_applied: false,
        entitlement_claimed_at: now,
      };
      const { data, error } = await admin
        .from("pro_purchases")
        .update({ activated_at: now, metadata: next as Json, updated_at: now })
        .eq("id", args.purchaseId)
        .eq("activated_at", args.activatedAt)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[pro-purchase] reclaim entitlement failed", { message: error.message });
      }
      claimed = Boolean(data);
    }
    if (!claimed) {
      for (let attempt = 0; attempt < 6; attempt++) {
        await pause(400);
        const again = await readSubscription(admin, args.userId);
        if (again.row?.active_code === ref) {
          await markEntitlementApplied(admin, args.purchaseId, meta);
          return finishEmail(again.row.expires_at, true);
        }
      }
      return { ok: false, error: "activation_in_progress" };
    }

    const activated = await activateProDirectly(admin, {
      userId: args.userId,
      durationDays: args.durationDays,
      paymentRef: `${args.provider}:${args.providerPaymentId}`,
    });
    if (!activated.ok) {
      await releaseEntitlementClaim(admin, args.purchaseId, meta);
      return activated;
    }
    await markEntitlementApplied(admin, args.purchaseId, {
      ...meta,
      entitlement_applied: false,
      entitlement_claimed_at: new Date().toISOString(),
    });
    expiresAt = activated.expiresAt;
    console.info("[pro-purchase] fulfilled (direct activation)", {
      purchaseId: args.purchaseId,
      userId: args.userId,
      durationDays: args.durationDays,
      idempotent: args.idempotent,
    });
    return finishEmail(expiresAt, args.idempotent);
  }

  if (!expiresAt) {
    const current = await readSubscription(admin, args.userId);
    if (current.error) return { ok: false, error: current.error };
    expiresAt = current.row?.expires_at ?? null;
  }
  return finishEmail(expiresAt, true);
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
      "id, activation_code_id, code_delivered_at, purchase_type, activated_at, gift_recipient_email, gift_message, user_id, metadata",
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
        const emailStatus = await deliverSelfActivationEmail(admin, {
          toEmail: email,
          code: codeRow.code,
          interval: input.interval,
          durationDays: codeRow.duration_days,
          siteUrl: input.siteUrl,
          locale,
          purchaseId: existing.id,
          alreadyDelivered: Boolean(existing.code_delivered_at),
        });
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
          emailedTo: email,
        };
      }
    }

    if (existingType === "direct") {
      const buyerId = existing.user_id ?? (await resolveBuyerUserId(admin, input, email));
      if (!buyerId) return { ok: false, error: "direct_requires_user" };
      return grantDirectEntitlement(admin, {
        purchaseId: existing.id,
        userId: buyerId,
        activatedAt: existing.activated_at,
        metadata: existing.metadata,
        codeDeliveredAt: existing.code_delivered_at,
        durationDays,
        provider,
        providerPaymentId,
        email,
        interval: input.interval,
        siteUrl: input.siteUrl,
        locale,
        idempotent: true,
      });
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
        const deliverTo = normalizeEmail(existing.gift_recipient_email) ?? email;
        const emailStatus = await deliverGiftEmail(admin, {
          toEmail: deliverTo,
          code: codeRow.code,
          interval: input.interval,
          durationDays: codeRow.duration_days,
          siteUrl: input.siteUrl,
          locale,
          purchaseId: existing.id,
          alreadyDelivered: Boolean(existing.code_delivered_at),
          ...(existing.gift_message ? { giftMessage: existing.gift_message } : {}),
          ...(normalizeEmail(existing.gift_recipient_email) && input.buyerName
            ? { fromName: input.buyerName }
            : {}),
        });

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
          emailedTo: deliverTo,
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

    const emailStatus = await deliverSelfActivationEmail(admin, {
      toEmail: email,
      code: inserted.code,
      interval: input.interval,
      durationDays,
      siteUrl: input.siteUrl,
      locale,
      purchaseId: purchase.id,
      alreadyDelivered: false,
    });

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
      emailedTo: email,
    };
  }

  if (purchaseType === "direct") {
    if (!userId) return { ok: false, error: "direct_requires_user" };

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
        activation_code_id: null,
        metadata: (input.metadata ?? {}) as Json,
      })
      .select("id, activated_at, metadata, code_delivered_at")
      .single();

    if (purchaseError && /duplicate|unique/i.test(purchaseError.message)) {
      const { data: raced, error: racedError } = await admin
        .from("pro_purchases")
        .select("id, activated_at, metadata, code_delivered_at, user_id")
        .eq("provider", provider)
        .eq("provider_payment_id", providerPaymentId)
        .maybeSingle();
      if (racedError || !raced) {
        return { ok: false, error: "purchase_insert_failed" };
      }
      return grantDirectEntitlement(admin, {
        purchaseId: raced.id,
        userId: raced.user_id ?? userId,
        activatedAt: raced.activated_at,
        metadata: raced.metadata,
        codeDeliveredAt: raced.code_delivered_at,
        durationDays,
        provider,
        providerPaymentId,
        email,
        interval: input.interval,
        siteUrl: input.siteUrl,
        locale,
        idempotent: true,
      });
    }

    if (purchaseError || !purchase) {
      console.error("[pro-purchase] insert direct purchase failed", purchaseError);
      return { ok: false, error: purchaseError?.message ?? "purchase_insert_failed" };
    }

    return grantDirectEntitlement(admin, {
      purchaseId: purchase.id,
      userId,
      activatedAt: purchase.activated_at,
      metadata: purchase.metadata,
      codeDeliveredAt: purchase.code_delivered_at,
      durationDays,
      provider,
      providerPaymentId,
      email,
      interval: input.interval,
      siteUrl: input.siteUrl,
      locale,
      idempotent: false,
    });
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

  const emailStatus = await deliverGiftEmail(admin, {
    toEmail: deliverTo,
    code: inserted.code,
    interval: input.interval,
    durationDays,
    siteUrl: input.siteUrl,
    locale,
    purchaseId: purchase.id,
    alreadyDelivered: false,
    ...(giftMessage ? { giftMessage } : {}),
    ...(giftRecipientEmail && (input.buyerName || email)
      ? { fromName: input.buyerName ?? email }
      : {}),
  });

  let smsResult: { delivered: boolean; error?: string } = { delivered: false };
  const phone = input.phone?.trim();
  if (phone) {
    const duration = intervalLabel(input.interval, durationDays);
    const sms = await sendSms(
      phone,
      `CylixStudio Pro (${duration}) — الرمز: ${formatActivationCode(inserted.code)}. سجّل الدخول من لوحة التحكم لتفعيله. لا تشاركه.`,
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
    emailedTo: deliverTo,
  };
}
