import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProBillingInterval, ProPurchaseType } from "@/lib/plans";
import { PRO_BILLING_OPTIONS } from "@/lib/plans";
import type { Database, Json } from "@/lib/supabase/types";

export const TUWAIQPAY_PRODUCTION_URL = "https://onboarding-prod.tuwaiqpay.com.sa";
export const TUWAIQPAY_UAT_URL = "https://onboarding-uat.tuwaiqpay.com.sa";

const DEFAULT_METHODS = ["VISA", "MASTER", "MADA", "AMEX"] as const;
const TOKEN_TTL_MS = 20 * 60 * 1000;

export type TuwaiqPaymentMethod = (typeof DEFAULT_METHODS)[number];

export type TuwaiqBillRequest = {
  actionDateInDays: number;
  amount: number;
  currencyId: number;
  supportedPaymentMethods: string[];
  description: string;
  customerName: string;
  customerMobilePhone: string;
  includeVat?: boolean;
  continueWithMaxCharge?: boolean;
};

export type TuwaiqBillResult = {
  link: string;
  qrCode: string;
  billId: number;
  transactionId: string | null;
  merchantTransactionId: string | null;
  expireDate: string | null;
  amount: number;
};

type CachedToken = { token: string; expiresAt: number };

let cachedToken: CachedToken | null = null;
let pendingAuth: Promise<string> | null = null;

export function tuwaiqBaseUrl(): string {
  const explicit = process.env["TUWAIQPAY_BASE_URL"]?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  return process.env["TUWAIQPAY_ENV"]?.trim().toLowerCase() === "uat"
    ? TUWAIQPAY_UAT_URL
    : TUWAIQPAY_PRODUCTION_URL;
}

export function tuwaiqConfigured(): boolean {
  return Boolean(process.env["TUWAIQPAY_USERNAME"]?.trim() && process.env["TUWAIQPAY_PASSWORD"]?.trim());
}

export type TuwaiqReadiness = {
  ready: boolean;
  reason: "ok" | "missing_credentials" | "auth_failed";
};

/** Confirms merchant env vars are set and that TuwaiqPay will issue an access token. */
export async function probeTuwaiqGateway(): Promise<TuwaiqReadiness> {
  if (!tuwaiqConfigured()) {
    return { ready: false, reason: "missing_credentials" };
  }
  try {
    const token = await getTuwaiqAccessToken();
    if (!token) return { ready: false, reason: "auth_failed" };
    return { ready: true, reason: "ok" };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "tuwaiqpay_not_configured") {
      return { ready: false, reason: "missing_credentials" };
    }
    return { ready: false, reason: "auth_failed" };
  }
}

function languageHeader(): "ar" | "en" {
  return process.env["TUWAIQPAY_LANGUAGE"]?.trim().toLowerCase() === "en" ? "en" : "ar";
}

function paymentMethods(): string[] {
  const raw = process.env["TUWAIQPAY_PAYMENT_METHODS"]?.trim();
  if (!raw) return [...DEFAULT_METHODS];
  const parsed = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => DEFAULT_METHODS.includes(item as TuwaiqPaymentMethod));
  return parsed.length > 0 ? parsed : [...DEFAULT_METHODS];
}

export function currencyId(): number {
  const parsed = Number(process.env["TUWAIQPAY_CURRENCY_ID"]);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  // TuwaiqPay catalog: 1 = SAR. Pro list prices are USD.
  return 2;
}

export const BILL_CURRENCY = "USD" as const;

/** Plan prices are USD with two decimal places. */
export function formatUsdAmount(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Merchant access token, cached in process memory and refreshed before expiry. */
export async function getTuwaiqAccessToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  if (!force && pendingAuth) return pendingAuth;

  pendingAuth = requestAccessToken().finally(() => {
    pendingAuth = null;
  });
  return pendingAuth;
}

async function requestAccessToken(): Promise<string> {
  const username = process.env["TUWAIQPAY_USERNAME"]?.trim() ?? "";
  const password = process.env["TUWAIQPAY_PASSWORD"] ?? "";
  const userNameType = (process.env["TUWAIQPAY_USERNAME_TYPE"]?.trim() || "MOBILE").toUpperCase();
  if (!username || !password) {
    throw new Error("tuwaiqpay_not_configured");
  }
  if (userNameType !== "MOBILE" && userNameType !== "EMAIL") {
    throw new Error("tuwaiqpay_invalid_username_type");
  }

  const response = await fetch(`${tuwaiqBaseUrl()}/api/v1/auth/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Language": languageHeader(),
    },
    body: JSON.stringify({ username, userNameType, password }),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: { access_token?: unknown };
    message?: unknown;
  } | null;
  const token = payload?.data?.access_token;
  if (!response.ok || typeof token !== "string" || !token) {
    cachedToken = null;
    console.error("[tuwaiqpay] authenticate failed", {
      status: response.status,
      message: typeof payload?.message === "string" ? payload.message : null,
    });
    throw new Error("tuwaiqpay_auth_failed");
  }

  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

export async function createTuwaiqBill(input: TuwaiqBillRequest): Promise<TuwaiqBillResult> {
  const body = {
    actionDateInDays: input.actionDateInDays,
    amount: input.amount,
    currencyId: input.currencyId,
    supportedPaymentMethods: input.supportedPaymentMethods,
    description: input.description.slice(0, 500),
    customerName: input.customerName.slice(0, 100),
    customerMobilePhone: input.customerMobilePhone.slice(0, 100),
    includeVat: input.includeVat ?? false,
    continueWithMaxCharge: input.continueWithMaxCharge ?? false,
  };

  let response = await postBill(body, await getTuwaiqAccessToken());
  if (response.status === 401) {
    cachedToken = null;
    response = await postBill(body, await getTuwaiqAccessToken(true));
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: {
      link?: unknown;
      qrCode?: unknown;
      billId?: unknown;
      transactionId?: unknown;
      merchantTransactionId?: unknown;
      expireDate?: unknown;
      amount?: unknown;
    };
    message?: unknown;
    errors?: unknown;
  } | null;

  const data = payload?.data;
  const billId = typeof data?.billId === "number" ? data.billId : Number(data?.billId);
  if (!response.ok || !data || typeof data.link !== "string" || !Number.isFinite(billId)) {
    console.error("[tuwaiqpay] create bill failed", {
      status: response.status,
      message: typeof payload?.message === "string" ? payload.message : null,
    });
    throw new Error("tuwaiqpay_bill_failed");
  }

  return {
    link: data.link,
    qrCode: typeof data.qrCode === "string" ? data.qrCode : "",
    billId,
    transactionId: typeof data.transactionId === "string" ? data.transactionId : null,
    merchantTransactionId:
      typeof data.merchantTransactionId === "string" ? data.merchantTransactionId : null,
    expireDate: typeof data.expireDate === "string" ? data.expireDate : null,
    amount: typeof data.amount === "number" ? data.amount : body.amount,
  };
}

async function postBill(body: TuwaiqBillRequest, token: string): Promise<Response> {
  return fetch(`${tuwaiqBaseUrl()}/api/v1/integration/bills`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Language": languageHeader(),
    },
    body: JSON.stringify(body),
  });
}

export function buildProBillRequest(args: {
  interval: ProBillingInterval;
  customerName: string;
  customerMobilePhone: string;
}): TuwaiqBillRequest {
  const option = PRO_BILLING_OPTIONS[args.interval];
  const days = Number(process.env["TUWAIQPAY_BILL_DAYS"] ?? "1");
  return {
    actionDateInDays: Number.isFinite(days) && days >= 1 ? Math.min(Math.round(days), 30) : 1,
    amount: formatUsdAmount(option.amount),
    currencyId: currencyId(),
    supportedPaymentMethods: paymentMethods(),
    description: `CylixStudio Pro (${option.id})`,
    customerName: args.customerName,
    customerMobilePhone: args.customerMobilePhone,
    includeVat: false,
    continueWithMaxCharge: false,
  };
}

type Admin = SupabaseClient<Database>;

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** E.164 phone from an auth profile value. */
export function normalizeCustomerPhone(raw: string): string | null {
  let value = raw.replace(/[\s()-]/g, "");
  if (!value) return null;
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (/^05\d{8}$/.test(value)) value = `+966${value.slice(1)}`;
  if (/^9665\d{8}$/.test(value)) value = `+${value}`;
  if (/^5\d{8}$/.test(value)) value = `+966${value}`;
  if (!value.startsWith("+") && /^\d{8,15}$/.test(value)) value = `+${value}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

/** Name, mobile, and email from the account profile and auth session. */
export async function resolveBuyerContact(
  admin: Admin,
  userId: string,
  claimEmail: string | null,
): Promise<{ name: string; phone: string | null; email: string | null }> {
  const { data: profile } = await admin.from("users").select("name, email").eq("id", userId).maybeSingle();
  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const authUser = authData.user;
  const meta = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
  const emailRaw = pickText(profile?.email, authUser?.email, claimEmail).toLowerCase();
  const email = emailRaw.includes("@") ? emailRaw : null;
  const localName = email?.split("@")[0] ?? "";
  const name = pickText(
    profile?.name,
    meta["full_name"],
    meta["name"],
    meta["preferred_username"],
    localName,
  ).slice(0, 100);
  const phone = normalizeCustomerPhone(
    pickText(authUser?.phone, meta["phone"], meta["mobile"], meta["phone_number"], meta["mobile_phone"]),
  );
  return {
    name: name.length >= 2 ? name : "CylixStudio",
    phone,
    email,
  };
}

export async function saveTuwaiqBill(
  admin: Admin,
  args: {
    userId: string;
    email: string;
    interval: ProBillingInterval;
    purchaseType: ProPurchaseType;
    customerName: string;
    customerMobilePhone: string;
    giftRecipientEmail?: string | null;
    giftMessage?: string | null;
    bill: TuwaiqBillResult;
  },
): Promise<void> {
  const { error } = await admin.from("tuwaiqpay_bills").insert({
    user_id: args.userId,
    bill_id: args.bill.billId,
    transaction_id: args.bill.transactionId,
    merchant_transaction_id: args.bill.merchantTransactionId,
    amount: args.bill.amount,
    currency_id: currencyId(),
    status: "PENDING",
    payment_link: args.bill.link,
    qr_code: args.bill.qrCode || null,
    description: `CylixStudio Pro (${args.interval})`,
    customer_name: args.customerName,
    customer_mobile_phone: args.customerMobilePhone,
    purchase_type: args.purchaseType,
    billing_interval: args.interval,
    buyer_email: args.email,
    gift_recipient_email: args.giftRecipientEmail ?? null,
    gift_message: args.giftMessage ?? null,
    metadata: {
      expireDate: args.bill.expireDate,
      currency: BILL_CURRENCY,
    } as Json,
  });
  if (error) {
    console.error("[tuwaiqpay] save bill failed", error.message);
    throw new Error("tuwaiqpay_save_failed");
  }
}

export type TuwaiqWebhookBill = {
  id?: number;
  status?: string;
  amount?: number;
  description?: string;
  customerEmail?: string;
  customerName?: string;
  customerMobilePhone?: string;
};

export type TuwaiqWebhookPayload = {
  transactionDetails?: {
    transactionId?: string;
    transactionStatus?: string;
    merchantTransactionId?: string;
    paymentDate?: string;
    bill?: TuwaiqWebhookBill;
  };
};

const PAID_STATUSES = new Set(["PAID", "PENDING_SETTLEMENT"]);

export function normalizeBillStatus(raw: string | undefined): string {
  const status = (raw ?? "PENDING").trim().toUpperCase();
  if (status === "PAID" || status === "PENDING_SETTLEMENT" || status === "FAILED" || status === "PENDING") {
    return status;
  }
  if (status === "EXPIRED" || status === "REFUNDED") return status;
  return "PENDING";
}

export async function applyTuwaiqWebhook(
  admin: Admin,
  payload: TuwaiqWebhookPayload,
  siteUrl: string,
): Promise<{ matched: boolean; fulfilled: boolean }> {
  const details = payload.transactionDetails;
  const bill = details?.bill;
  const billId = typeof bill?.id === "number" ? bill.id : Number(bill?.id);
  if (!Number.isFinite(billId)) return { matched: false, fulfilled: false };

  const status = normalizeBillStatus(bill?.status ?? details?.transactionStatus);
  const { data: row, error } = await admin
    .from("tuwaiqpay_bills")
    .select(
      "id, user_id, buyer_email, billing_interval, purchase_type, gift_recipient_email, gift_message, customer_name, customer_mobile_phone, amount, status",
    )
    .eq("bill_id", billId)
    .maybeSingle();

  if (error) {
    console.error("[tuwaiqpay] bill lookup failed", error.message);
    throw new Error("tuwaiqpay_lookup_failed");
  }

  if (!row) {
    console.warn("[tuwaiqpay] webhook for unknown bill", { billId, status });
    return { matched: false, fulfilled: false };
  }

  const paidAt = PAID_STATUSES.has(status) ? new Date().toISOString() : null;
  const { error: updateError } = await admin
    .from("tuwaiqpay_bills")
    .update({
      status,
      ...(details?.transactionId ? { transaction_id: details.transactionId } : {}),
      ...(details?.merchantTransactionId
        ? { merchant_transaction_id: details.merchantTransactionId }
        : {}),
      ...(paidAt ? { paid_at: paidAt } : {}),
      metadata: {
        transactionStatus: details?.transactionStatus ?? null,
        paymentDate: details?.paymentDate ?? null,
        amount: bill?.amount ?? null,
      } as Json,
    })
    .eq("id", row.id);

  if (updateError) {
    console.error("[tuwaiqpay] status update failed", updateError.message);
    throw new Error("tuwaiqpay_update_failed");
  }

  if (!PAID_STATUSES.has(status) || !row.user_id || !row.buyer_email) {
    return { matched: true, fulfilled: false };
  }

  const interval = row.billing_interval;
  if (interval !== "monthly" && interval !== "six_months" && interval !== "yearly") {
    return { matched: true, fulfilled: false };
  }

  const { data: profile } = await admin
    .from("users")
    .select("email")
    .eq("id", row.user_id)
    .maybeSingle();
  const profileEmail = profile?.email?.trim().toLowerCase() ?? "";
  const buyerEmail = profileEmail.includes("@") ? profileEmail : row.buyer_email;

  const { fulfillProPurchase } = await import("@/lib/proPurchase.server");
  const amount = typeof bill?.amount === "number" ? bill.amount : Number(row.amount);
  const purchaseType = row.purchase_type === "gift" ? "gift" : "direct";
  const result = await fulfillProPurchase(admin, {
    email: buyerEmail,
    userId: row.user_id,
    interval,
    amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : null,
    currency: BILL_CURRENCY,
    provider: "tuwaiqpay",
    providerPaymentId: `bill:${billId}`,
    phone: row.customer_mobile_phone,
    siteUrl,
    locale: languageHeader(),
    purchaseType,
    buyerName: row.customer_name,
    metadata: {
      billId,
      transactionId: details?.transactionId ?? null,
      transactionStatus: details?.transactionStatus ?? null,
    },
  });

  if (!result.ok) {
    console.error("[tuwaiqpay] fulfill failed", { billId, error: result.error });
    return { matched: true, fulfilled: false };
  }
  return { matched: true, fulfilled: true };
}
