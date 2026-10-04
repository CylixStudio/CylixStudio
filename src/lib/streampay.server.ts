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

function configuredApiKey(): string | null {
  const explicit = process.env["STREAMPAY_X_API_KEY"]?.trim();
  if (explicit) return explicit;
  return derivedApiKey();
}

function derivedApiKey(): string | null {
  const key = process.env["STREAMPAY_API_KEY"]?.trim();
  const secret = process.env["STREAMPAY_SECRET_KEY"]?.trim();
  if (!key || !secret) return null;
  return Buffer.from(`${key}:${secret}`, "utf8").toString("base64");
}

function webhookSecret(): string | null {
  const secret = (
    process.env["STREAMPAY_WEBHOOK_SECRET"] ??
    process.env["STREAMPAY_SECRET_KEY"] ??
    ""
  ).trim();
  return secret || null;
}

async function streampay(
  method: "GET" | "POST",
  path: string,
  body?: Json,
  apiKey = configuredApiKey(),
): Promise<{ status: number; json: unknown }> {
  if (!apiKey) return { status: 503, json: { error: "streampay_not_configured" } };
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
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
      json = { raw: text.slice(0, 500) };
    }
  }
  if (response.status === 401) {
    const fallback = derivedApiKey();
    if (fallback && fallback !== apiKey) return streampay(method, path, body, fallback);
  }
  return { status: response.status, json };
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
  const url = record?.["url"] ?? record?.["checkout_url"] ?? record?.["payment_url"];
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
    if (id) {
      productIds.set(interval, id);
      return id;
    }
    if (created.status !== 422 && created.status !== 400) {
      console.error("[streampay] product create failed", { status: created.status, interval });
      return null;
    }
  }
  console.error("[streampay] product create rejected", { interval });
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
  if (createdId) return createdId;

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
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!configuredApiKey()) return { ok: false, error: "streampay_not_configured" };
  const option = PRO_BILLING_OPTIONS[input.interval];
  const payload = buildProCheckoutPayload(input.interval, {
    purchaseType: input.purchaseType,
    userId: input.userId,
    buyerEmail: input.email,
  });
  const productId = await ensureProduct(input.interval, payload.productName, option.amount);
  if (!productId) return { ok: false, error: "streampay_product_failed" };

  const consumerId = await ensureConsumer({
    name: input.name,
    email: input.email,
    userId: input.userId,
    locale: input.locale,
  });
  if (!consumerId) return { ok: false, error: "streampay_consumer_failed" };

  const origin = input.origin.replace(/\/+$/, "");
  const created = await streampay("POST", "/payment_links", {
    name: payload.productName,
    description: payload.productName,
    currency: "SAR",
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
      currency: "SAR",
      buyer_name: input.name,
      locale: input.locale,
    },
  });
  const url = readUrl(created.json) ?? readUrl(asRecord(created.json)?.["data"]);
  if (!url) {
    console.error("[streampay] payment link failed", { status: created.status });
    return { ok: false, error: "streampay_link_failed" };
  }
  const checkout = new URL(url);
  checkout.searchParams.set("language", input.locale);
  return { ok: true, url: checkout.toString() };
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
