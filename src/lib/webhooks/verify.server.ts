import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from "crypto";

/** Current key from https://api.kick.com/public/v1/public-key. A newer key is fetched if this one misses. */
const KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0C0tthITvk/EjIxCGCko
YrxM7eqP4GDnUyP4BnfgJ9yaHqniNfraxTKeRv7TGkOOZviow2zcx/YP9waURfHd
cZOHU+EKA3lSFdMpezLiDGaym+FxR0iXAFZXE9VBdCCOyBeK81/m3mGScGVBNumt
6pGCZYU9DCn5oqnC6RC5pUnlHnJp+TOXW6z8Silr4Y81a/66b0FAJ6EGUVXmXXgP
FXQRTmJcLM4EgCXfNXLwExzr2MtowBwp5PYD6Usl7uZcnMIPutPdXJ0JnvqrztFC
QTvrGMxzKLKLcKQTG159jfHGJ4wKSeenvwXN8jaVJAtW7wRAooRRT8Kho7Axe8jp
qQIDAQAB
-----END PUBLIC KEY-----`;

const KICK_PUBLIC_KEY_URL = "https://api.kick.com/public/v1/public-key";

let cachedLiveKey: { pem: string; fetchedAt: number } | null = null;

/** Constant-time comparison of two ASCII/hex/base64 strings. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Twitch EventSub — HMAC-SHA256 over (messageId + timestamp + rawBody),
 * compared against the `Twitch-Eventsub-Message-Signature` header.
 */
export function verifyTwitchSignature(params: {
  secret: string;
  messageId: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
}): boolean {
  const { secret, messageId, timestamp, signature, rawBody } = params;
  if (!messageId || !timestamp || !signature) return false;

  // Reject replays older than 10 minutes (Twitch's own recommendation).
  const sent = Date.parse(timestamp);
  if (Number.isNaN(sent) || Math.abs(Date.now() - sent) > 10 * 60 * 1000) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", secret)
      .update(messageId + timestamp + rawBody)
      .digest("hex");
  return safeEqual(signature, expected);
}

/**
 * Kick — RSA-SHA256 over `messageId.timestamp.rawBody`, base64 in
 * `Kick-Event-Signature`, verified with Kick's public key.
 * A shared-secret relay can set KICK_WEBHOOK_SECRET for HMAC mode.
 * A valid signature is accepted for 24 hours so Kick's retries are not dropped.
 */
export type KickSignatureResult = {
  ok: boolean;
  reason: string;
  messageId: string | null;
  timestamp: string | null;
  timestampAgeMs: number | null;
  receivedSignature: string | null;
  expectedSignature: string | null;
  bodyBytes: number;
  keySource: string | null;
  keysTried: string[];
};

const KICK_SIGNATURE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function parseKickTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (/^\d{10}$/.test(trimmed)) return Number(trimmed) * 1000;
  if (/^\d{13}$/.test(trimmed)) return Number(trimmed);
  const normalized = trimmed.replace(/(\.\d{3})\d+(Z|[+-]\d{2}:\d{2})$/, "$1$2");
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

function normalizePublicKey(value: string): string {
  const trimmed = value.trim().replace(/\\n/g, "\n");
  if (trimmed.includes("BEGIN PUBLIC KEY")) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function pemBody(pem: string): string {
  return pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
}

function signatureBuffers(signature: string): Buffer[] {
  const cleaned = signature.trim().replace(/^sha256=/i, "");
  const buffers = [Buffer.from(cleaned, "base64"), Buffer.from(cleaned, "base64url")];
  const unique: Buffer[] = [];
  for (const buffer of buffers) {
    if (buffer.length === 0) continue;
    if (unique.some((existing) => existing.equals(buffer))) continue;
    unique.push(buffer);
  }
  return unique;
}

/** SHA256 + PKCS1 v1.5 over the exact `messageId.timestamp.rawBody` bytes. */
function rsaVerify(publicKeyPem: string, payload: string, signature: Buffer): boolean {
  const key = createPublicKey(publicKeyPem);
  return verifySignature("RSA-SHA256", Buffer.from(payload, "utf8"), key, signature);
}

async function fetchLiveKickPublicKey(): Promise<string | null> {
  if (cachedLiveKey && Date.now() - cachedLiveKey.fetchedAt < 60 * 60 * 1000) {
    return cachedLiveKey.pem;
  }
  try {
    const response = await fetch(KICK_PUBLIC_KEY_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return cachedLiveKey?.pem ?? null;
    const json = (await response.json()) as { data?: { public_key?: string } };
    const pem = json.data?.public_key?.trim().replace(/\\n/g, "\n");
    if (!pem?.includes("BEGIN PUBLIC KEY")) return cachedLiveKey?.pem ?? null;
    cachedLiveKey = { pem, fetchedAt: Date.now() };
    return pem;
  } catch {
    return cachedLiveKey?.pem ?? null;
  }
}

function tryKeys(
  keys: Array<{ source: string; pem: string }>,
  payload: string,
  signatures: Buffer[],
  ageMs: number | null,
  base: Omit<KickSignatureResult, "ok" | "reason">,
): { matched: KickSignatureResult | null; sawMismatch: boolean; rsaError: string | null; keysTried: string[] } {
  let rsaError: string | null = null;
  let sawMismatch = false;
  const keysTried: string[] = [];
  for (const key of keys) {
    keysTried.push(key.source);
    for (const candidate of signatures) {
      try {
        if (rsaVerify(key.pem, payload, candidate)) {
          if (ageMs != null && Math.abs(ageMs) > KICK_SIGNATURE_MAX_AGE_MS) {
            return {
              matched: { ...base, ok: false, reason: "timestamp_expired", keySource: key.source, keysTried },
              sawMismatch,
              rsaError,
              keysTried,
            };
          }
          return {
            matched: { ...base, ok: true, reason: "ok", keySource: key.source, keysTried },
            sawMismatch,
            rsaError,
            keysTried,
          };
        }
        sawMismatch = true;
      } catch (error) {
        rsaError = error instanceof Error ? error.message : "rsa_verify_threw";
      }
    }
  }
  return { matched: null, sawMismatch, rsaError, keysTried };
}

export async function verifyKickSignature(params: {
  publicKeyPem: string | undefined;
  hmacSecret: string | undefined;
  messageId: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
}): Promise<KickSignatureResult> {
  const { publicKeyPem, hmacSecret, messageId, timestamp, signature, rawBody } = params;
  const base = {
    messageId,
    timestamp,
    timestampAgeMs: null as number | null,
    receivedSignature: signature,
    expectedSignature: null as string | null,
    bodyBytes: Buffer.byteLength(rawBody),
    keySource: null as string | null,
    keysTried: [] as string[],
  };
  if (!signature || !messageId || !timestamp) {
    return { ...base, ok: false, reason: "missing_headers" };
  }

  const sent = parseKickTimestamp(timestamp);
  const ageMs = sent == null ? null : Date.now() - sent;
  base.timestampAgeMs = ageMs;

  const payload = `${messageId}.${timestamp}.${rawBody}`;
  const signatures = signatureBuffers(signature);
  const keys: Array<{ source: string; pem: string }> = [
    { source: "kick_builtin", pem: KICK_PUBLIC_KEY },
  ];
  if (publicKeyPem?.trim()) {
    const pem = normalizePublicKey(publicKeyPem);
    if (pemBody(pem) !== pemBody(KICK_PUBLIC_KEY)) keys.push({ source: "KICK_WEBHOOK_PUBLIC_KEY", pem });
  }

  const first = tryKeys(keys, payload, signatures, ageMs, base);
  if (first.matched) return { ...first.matched, keysTried: first.keysTried };
  base.keysTried = first.keysTried;

  const livePem = await fetchLiveKickPublicKey();
  if (livePem && !keys.some((key) => pemBody(key.pem) === pemBody(livePem))) {
    const second = tryKeys([{ source: "kick_live_public_key", pem: livePem }], payload, signatures, ageMs, base);
    base.keysTried = [...first.keysTried, ...second.keysTried];
    if (second.matched) return { ...second.matched, keysTried: base.keysTried };
    if (second.sawMismatch) first.sawMismatch = true;
    if (second.rsaError) first.rsaError = second.rsaError;
  }

  if (hmacSecret?.trim()) {
    const expected = createHmac("sha256", hmacSecret.trim()).update(payload).digest("base64");
    base.expectedSignature = expected;
    base.keySource = "KICK_WEBHOOK_SECRET";
    base.keysTried = [...base.keysTried, "KICK_WEBHOOK_SECRET"];
    if (safeEqual(signature.trim(), expected)) {
      if (ageMs != null && Math.abs(ageMs) > KICK_SIGNATURE_MAX_AGE_MS) {
        return { ...base, ok: false, reason: "timestamp_expired" };
      }
      return { ...base, ok: true, reason: "ok" };
    }
  }

  if (!base.keySource && base.keysTried.length > 0) {
    base.keySource = base.keysTried.join(",");
  }
  if (sent == null && !first.sawMismatch && !first.rsaError) {
    return { ...base, ok: false, reason: "timestamp_unparsed" };
  }
  return {
    ...base,
    ok: false,
    reason: first.sawMismatch ? "signature_mismatch" : first.rsaError ? "rsa_error" : "signature_mismatch",
  };
}

/**
 * StreamElements sends HS256 JWTs. Verifies signature with the channel's
 * StreamElements JWT secret and returns the decoded payload.
 */
export function verifyStreamElementsJwt(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (!safeEqual(signature, expected)) return null;

  try {
    const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as {
      alg?: string;
    };
    if (decodedHeader.alg !== "HS256") return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const exp = decoded["exp"];
    if (typeof exp === "number" && exp * 1000 < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}
