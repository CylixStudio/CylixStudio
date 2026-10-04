import { createHmac } from "crypto";

import type { ProBillingInterval, ProPurchaseType } from "@/lib/plans";
import { buildProCheckoutPayload } from "@/lib/plans";
import { safeEqual } from "@/lib/webhooks/verify.server";

const API_BASE = "https://stream-app-service.streampay.sa/api/v2";

type Json = Record<string, unknown>;

const STREAM_PAY_NAME_FALLBACK = "CylixStudio User";

/** StreamPay consumers require `name`. Keep it a short readable string. */
export function streamPayCustomerName(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned.length >= 2 ? cleaned : STREAM_PAY_NAME_FALLBACK;
}

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
    meta["preferred_username"],
    meta["user_name"],
    input.email?.split("@")[0]?.replace(/[._+-]+/g, " "),
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const name = streamPayCustomerName(value);
    if (name !== STREAM_PAY_NAME_FALLBACK) return name;
  }
  return STREAM_PAY_NAME_FALLBACK;
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
    record["hosted_url"] ??
    record["hosted_invoice_url"] ??
    record["public_url"] ??
    nested?.["url"] ??
    nested?.["checkout_url"] ??
    nested?.["payment_url"] ??
    nested?.["hosted_invoice_url"];
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

async function findConsumer(userId: string, email: string): Promise<string | null> {
  const queries = [
    `/consumers?external_id=${encodeURIComponent(userId)}`,
    `/consumers?email=${encodeURIComponent(email)}`,
    `/consumers?limit=100`,
  ];
  for (const path of queries) {
    const listed = await streampay("GET", path);
    const match = listOf(listed.json).find((row) => row["external_id"] === userId || row["email"] === email);
    const id = readId(match);
    if (id) return id;
  }
  return null;
}

async function ensureConsumer(input: {
  name: string;
  email: string;
  userId: string;
  locale: "ar" | "en";
}): Promise<{ id: string } | { id: null; message: string }> {
  const name = streamPayCustomerName(input.name);
  const attempts: Json[] = [
    {
      name,
      email: input.email,
      external_id: input.userId,
      preferred_language: input.locale,
      communication_methods: ["EMAIL"],
    },
    {
      name: STREAM_PAY_NAME_FALLBACK,
      email: input.email,
      external_id: input.userId,
    },
  ];
  let lastMessage = "StreamPay could not create the customer";
  for (const body of attempts) {
    const created = await streampay("POST", "/consumers", body);
    const createdId = readId(created.json) ?? readId(asRecord(created.json)?.["data"]);
    if (created.status >= 200 && created.status < 300 && createdId) return { id: createdId };
    lastMessage = streamPayErrorMessage(created.json);
    logStreamPayFailure("create_consumer", created);
    const existing = await findConsumer(input.userId, input.email);
    if (existing) return { id: existing };
  }
  return { id: null, message: lastMessage };
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
    const payload = buildProCheckoutPayload(input.interval, {
      purchaseType: input.purchaseType,
      userId: input.userId,
      buyerEmail: input.email,
    });
    const customerName = streamPayCustomerName(input.name);
    console.info("[streampay] create checkout", {
      interval: input.interval,
      amount: payload.amount,
      listAmount: payload.listAmount,
      launchOffer: payload.launchOffer,
      currency: "SAR",
      name: customerName,
    });
    const consumer = await ensureConsumer({
      name: customerName,
      email: input.email,
      userId: input.userId,
      locale: input.locale,
    });
    if (!consumer.id) {
      return { ok: false, error: "streampay_consumer_failed", message: consumer.message };
    }
    const consumerId = consumer.id;

    const origin = input.origin.replace(/\/+$/, "");
    const metadata = {
      user_id: input.userId,
      email: input.email,
      interval: input.interval,
      purchase_type: input.purchaseType,
      amount: String(payload.amount),
      list_amount: payload.listAmount != null ? String(payload.listAmount) : "",
      launch_offer: payload.launchOffer ? "1" : "0",
      currency: "SAR",
      buyer_name: customerName,
      locale: input.locale,
    };
    const line = {
      name: payload.productName,
      description: payload.productName,
      quantity: 1,
      unit_price: payload.amount,
      price: payload.amount,
      amount: payload.amount,
      currency: "SAR",
    };
    const created = await streampay("POST", "/invoices", {
      name: payload.productName,
      description: payload.productName,
      currency: "SAR",
      customer_name: customerName,
      customer: { name: customerName, email: input.email },
      organization_consumer_id: consumerId,
      items: [line],
      success_redirect_url: `${origin}/subscription?streampay=paid`,
      failure_redirect_url: `${origin}/subscription?streampay=failed`,
      custom_metadata: metadata,
    });
    let url = created.status >= 200 && created.status < 300 ? readUrl(created.json) : null;
    if (!url) {
      logStreamPayFailure("create_invoice", created);
      const product = await streampay("POST", "/products", {
        name: payload.productName,
        description: payload.productName,
        type: "ONE_OFF",
        is_active: true,
        is_one_time: true,
        currency: "SAR",
        price: payload.amount,
        prices: [
          {
            currency: "SAR",
            amount: payload.amount,
            is_price_inclusive_of_vat: true,
            is_price_exempt_from_vat: false,
          },
        ],
      });
      const productId = readId(product.json) ?? readId(asRecord(product.json)?.["data"]);
      if (product.status < 200 || product.status >= 300 || !productId) {
        logStreamPayFailure("create_inline_product", product);
        return {
          ok: false,
          error: "streampay_invoice_failed",
          message: streamPayErrorMessage(created.json),
        };
      }
      const link = await streampay("POST", "/payment_links", {
        name: payload.productName,
        description: payload.productName,
        currency: "SAR",
        items: [{ product_id: productId, quantity: 1 }],
        contact_information_type: "EMAIL",
        max_number_of_payments: 1,
        organization_consumer_id: consumerId,
        success_redirect_url: `${origin}/subscription?streampay=paid`,
        failure_redirect_url: `${origin}/subscription?streampay=failed`,
        custom_metadata: metadata,
      });
      url = link.status >= 200 && link.status < 300 ? readUrl(link.json) : null;
      if (!url) {
        logStreamPayFailure("create_payment_link", link);
        return {
          ok: false,
          error: "streampay_link_failed",
          message: streamPayErrorMessage(link.json),
        };
      }
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
