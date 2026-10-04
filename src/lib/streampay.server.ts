import { createHmac } from "crypto";

import type { ProBillingInterval, ProPurchaseType } from "@/lib/plans";
import { PRO_BILLING_OPTIONS, buildProCheckoutPayload } from "@/lib/plans";
import { safeEqual } from "@/lib/webhooks/verify.server";

const API_BASE = "https://stream-app-service.streampay.sa/api/v2";

const productIds = new Map<string, string>();

type Json = Record<string, unknown>;

export function customerDisplayName(input: {
  email: string | null;
  metadata: Record<string, unknown> | null;
  profileName: string | null;
}): string {
  const meta = input.metadata ?? {};
  const candidates = [
    input.profileName,
    meta["full_name"],
    meta["name"],
    meta["display_name"],
    meta["username"],
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  const local = input.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (local) return local.slice(0, 120);
  return "CylixStudio";
}

function cleanEnv(name: string): string {
  let value = process.env[name]?.trim() ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

/** StreamPay auth is `x-api-key: base64(api-key:api-secret)`, not a Bearer token. */
function configuredApiKey(): { value: string; source: string } | null {
  const apiKey = cleanEnv("STREAMPAY_API_KEY");
  const secret = cleanEnv("STREAMPAY_SECRET_KEY");
  if (apiKey && secret) {
    return {
      value: Buffer.from(`${apiKey}:${secret}`, "utf8").toString("base64"),
      source: "STREAMPAY_API_KEY:STREAMPAY_SECRET_KEY",
    };
  }

  const explicit = cleanEnv("STREAMPAY_X_API_KEY");
  if (!explicit) return null;
  const decoded = Buffer.from(explicit, "base64").toString("utf8");
  const splitAt = decoded.indexOf(":");
  const printable = /^[\x20-\x7e]+$/.test(decoded);
  if (splitAt > 0 && printable) {
    return {
      value: Buffer.from(decoded, "utf8").toString("base64"),
      source: "STREAMPAY_X_API_KEY",
    };
  }
  console.error(
    "[streampay] STREAMPAY_X_API_KEY is not base64(api-key:api-secret). Set STREAMPAY_API_KEY and STREAMPAY_SECRET_KEY.",
  );
  return null;
}

function webhookSecret(): string | null {
  const secret = (
    process.env["STREAMPAY_WEBHOOK_SECRET"] ??
    process.env["STREAMPAY_SECRET_KEY"] ??
    ""
  ).trim();
  return secret || null;
}

function streamPayErrorMessage(json: unknown): string {
  const record = asRecord(json);
  const error = asRecord(record?.["error"]);
  const detail = record?.["detail"];
  const detailText = Array.isArray(detail)
    ? detail
        .map((item) => {
          const row = asRecord(item);
          const loc = Array.isArray(row?.["loc"]) ? row["loc"].join(".") : "";
          const msg = typeof row?.["msg"] === "string" ? row["msg"] : "";
          return [loc, msg].filter(Boolean).join(": ");
        })
        .filter(Boolean)
        .join("; ")
    : typeof detail === "string"
      ? detail
      : "";
  return (
    (typeof error?.["additional_info"] === "string" && error["additional_info"]) ||
    (typeof error?.["message"] === "string" && error["message"]) ||
    detailText ||
    (typeof record?.["message"] === "string" && record["message"]) ||
    "streampay_request_failed"
  );
}

function logStreamPayFailure(step: string, result: { status: number; json: unknown }) {
  console.error("[streampay] request failed", {
    step,
    status: result.status,
    keySource: configuredApiKey()?.source ?? "missing",
    message: streamPayErrorMessage(result.json),
  });
}

async function streampay(
  method: "GET" | "POST",
  path: string,
  body?: Json,
): Promise<{ status: number; json: unknown }> {
  const key = configuredApiKey();
  if (!key) return { status: 503, json: { error: { message: "streampay_not_configured" } } };
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": key.value,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = { message: text.slice(0, 500) };
      }
    }
    return { status: response.status, json };
  } catch (error) {
    const message = error instanceof Error ? error.message : "streampay_network_error";
    console.error("[streampay] request threw", { step: `${method} ${path}`, message });
    return { status: 502, json: { error: { message } } };
  }
}

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function readId(value: unknown): string | null {
  const record = asRecord(value);
  const id = record?.["id"];
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function readUrl(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const nested = asRecord(record["data"]) ?? asRecord(record["payment_link"]);
  const url =
    record["url"] ??
    record["checkout_url"] ??
    record["payment_url"] ??
    record["link"] ??
    nested?.["url"] ??
    nested?.["checkout_url"] ??
    nested?.["payment_url"];
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

function listOf(value: unknown): Json[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((row): row is Json => row != null);
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ["data", "items", "results", "consumers", "products"]) {
    if (Array.isArray(record[key])) return listOf(record[key]);
  }
  return [];
}

function productEnvKey(interval: ProBillingInterval): string {
  if (interval === "monthly") return "STREAMPAY_PRODUCT_MONTHLY";
  if (interval === "six_months") return "STREAMPAY_PRODUCT_SIX_MONTHS";
  return "STREAMPAY_PRODUCT_YEARLY";
}

async function ensureProduct(interval: ProBillingInterval, name: string, amount: number): Promise<string | null> {
  const fromEnv = process.env[productEnvKey(interval)]?.trim();
  if (fromEnv) return fromEnv;
  const cached = productIds.get(interval);
  if (cached) return cached;

  const listed = await streampay("GET", "/products");
  const existing = listOf(listed.json).find((row) => row["name"] === name);
  const existingId = readId(existing);
  if (existingId) {
    productIds.set(interval, existingId);
    return existingId;
  }

  const attempts: Json[] = [
    { name, description: name, currency: "SAR", price: amount, type: "ONE_TIME", is_recurring: false },
    { name, description: name, currency: "SAR", prices: [{ currency: "SAR", amount, type: "ONE_TIME" }] },
  ];
  for (const body of attempts) {
    const created = await streampay("POST", "/products", body);
    const id = readId(created.json) ?? readId(asRecord(created.json)?.["data"]);
    if (created.status >= 200 && created.status < 300 && id) {
      productIds.set(interval, id);
      return id;
    }
    logStreamPayFailure("create_product", created);
  }
  return null;
}

async function ensureConsumer(input: {
  name: string;
  email: string;
  userId: string;
  locale: "ar" | "en";
}): Promise<string | null> {
  const created = await streampay("POST", "/consumers", {
    name: input.name,
    email: input.email,
    external_id: input.userId,
    preferred_language: input.locale,
    communication_methods: ["EMAIL"],
  });
  const createdId = readId(created.json) ?? readId(asRecord(created.json)?.["data"]);
  if (created.status >= 200 && created.status < 300 && createdId) return createdId;
  logStreamPayFailure("create_consumer", created);

  const listed = await streampay("GET", `/consumers?external_id=${encodeURIComponent(input.userId)}`);
  const match = listOf(listed.json).find((row) => {
    return row["external_id"] === input.userId || row["email"] === input.email;
  });
  return readId(match);
}

export async function createStreamPayCheckout(input: {
  userId: string;
  email: string;
  name: string;
  interval: ProBillingInterval;
  purchaseType: ProPurchaseType;
  locale: "ar" | "en";
  origin: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string; message: string }> {
  try {
    if (!configuredApiKey()) {
      console.error("[streampay] missing STREAMPAY_API_KEY or STREAMPAY_SECRET_KEY");
      return { ok: false, error: "streampay_not_configured", message: "StreamPay keys are missing" };
    }
    const option = PRO_BILLING_OPTIONS[input.interval];
    const payload = buildProCheckoutPayload(input.interval, {
      purchaseType: input.purchaseType,
      userId: input.userId,
      buyerEmail: input.email,
    });
    console.info("[streampay] create checkout", {
      interval: input.interval,
      amount: option.amount,
      currency: option.currency,
      name: input.name,
    });
    const productId = await ensureProduct(input.interval, payload.productName, option.amount);
    if (!productId) {
      return { ok: false, error: "streampay_product_failed", message: "StreamPay rejected the product" };
    }

    const consumerId = await ensureConsumer({
      name: input.name,
      email: input.email,
      userId: input.userId,
      locale: input.locale,
    });
    if (!consumerId) {
      return { ok: false, error: "streampay_consumer_failed", message: "StreamPay rejected the customer name" };
    }

    const origin = input.origin.replace(/\/+$/, "");
    const created = await streampay("POST", "/payment_links", {
      name: input.name,
      description: payload.productName,
      currency: option.currency,
      items: [{ product_id: productId, quantity: 1 }],
      contact_information_type: "EMAIL",
      max_number_of_payments: 1,
      organization_consumer_id: consumerId,
      success_redirect_url: `${origin}/subscription?streampay=paid`,
      failure_redirect_url: `${origin}/subscription?streampay=failed`,
      custom_metadata: {
        user_id: input.userId,
        email: input.email,
        interval: input.interval,
        purchase_type: input.purchaseType,
        amount: String(option.amount),
        currency: option.currency,
        buyer_name: input.name,
        locale: input.locale,
      },
    });
    const url = readUrl(created.json);
    if (created.status < 200 || created.status >= 300 || !url) {
      logStreamPayFailure("create_payment_link", created);
      return {
        ok: false,
        error: "streampay_link_failed",
        message: streamPayErrorMessage(created.json),
      };
    }
    const checkout = new URL(url);
    checkout.searchParams.set("language", input.locale);
    return { ok: true, url: checkout.toString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "streampay_checkout_failed";
    console.error("[streampay] checkout threw", { message });
    return { ok: false, error: "streampay_checkout_failed", message };
  }
}

export function verifyStreamPaySignature(rawBody: string, header: string | null): boolean {
  const secret = webhookSecret();
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return index === -1 ? [part, ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  const millis = sent > 10_000_000_000 ? sent : sent * 1000;
  if (Math.abs(Date.now() - millis) > 10 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(expected, signature);
}

export async function fetchStreamPayPayment(paymentId: string): Promise<Json | null> {
  const result = await streampay("GET", `/payments/${encodeURIComponent(paymentId)}`);
  if (result.status < 200 || result.status >= 300) return null;
  const record = asRecord(result.json);
  return asRecord(record?.["data"]) ?? record;
}
