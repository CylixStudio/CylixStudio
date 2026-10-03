import { createHmac, timingSafeEqual, createVerify } from "crypto";

const KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

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

function rsaVerify(publicKey: string, payload: string, signature: Buffer): boolean {
  const verifier = createVerify("RSA-SHA256");
  verifier.update(payload);
  verifier.end();
  return verifier.verify(publicKey, signature);
}

export function verifyKickSignature(params: {
  publicKeyPem: string | undefined;
  hmacSecret: string | undefined;
  messageId: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
}): KickSignatureResult {
  const { publicKeyPem, hmacSecret, messageId, timestamp, signature, rawBody } = params;
  const base = {
    messageId,
    timestamp,
    timestampAgeMs: null as number | null,
    receivedSignature: signature,
    expectedSignature: null as string | null,
    bodyBytes: Buffer.byteLength(rawBody),
    keySource: null as string | null,
  };
  if (!signature || !messageId || !timestamp) {
    return { ...base, ok: false, reason: "missing_headers" };
  }

  const sent = parseKickTimestamp(timestamp);
  const ageMs = sent == null ? null : Date.now() - sent;
  base.timestampAgeMs = ageMs;

  const payload = `${messageId}.${timestamp}.${rawBody}`;
  const signatures = signatureBuffers(signature);
  const keys: Array<{ source: string; pem: string }> = [];
  if (publicKeyPem?.trim()) {
    keys.push({ source: "KICK_WEBHOOK_PUBLIC_KEY", pem: normalizePublicKey(publicKeyPem) });
  }
  if (!keys.some((key) => key.pem === KICK_PUBLIC_KEY)) {
    keys.push({ source: "kick_builtin", pem: KICK_PUBLIC_KEY });
  }

  let rsaError: string | null = null;
  let sawMismatch = false;
  for (const key of keys) {
    for (const candidate of signatures) {
      try {
        if (rsaVerify(key.pem, payload, candidate)) {
          if (ageMs != null && Math.abs(ageMs) > KICK_SIGNATURE_MAX_AGE_MS) {
            return { ...base, ok: false, reason: "timestamp_expired", keySource: key.source };
          }
          return { ...base, ok: true, reason: "ok", keySource: key.source };
        }
        sawMismatch = true;
      } catch (error) {
        rsaError = error instanceof Error ? error.message : "rsa_verify_threw";
      }
    }
  }

  if (hmacSecret?.trim()) {
    const expected = createHmac("sha256", hmacSecret.trim()).update(payload).digest("base64");
    base.expectedSignature = expected;
    base.keySource = "KICK_WEBHOOK_SECRET";
    if (safeEqual(signature.trim(), expected)) {
      if (ageMs != null && Math.abs(ageMs) > KICK_SIGNATURE_MAX_AGE_MS) {
        return { ...base, ok: false, reason: "timestamp_expired" };
      }
      return { ...base, ok: true, reason: "ok" };
    }
    return { ...base, ok: false, reason: sawMismatch ? "signature_mismatch" : rsaError ? "rsa_error" : "signature_mismatch" };
  }

  if (sent == null && !sawMismatch && !rsaError) {
    return { ...base, ok: false, reason: "timestamp_unparsed" };
  }
  return {
    ...base,
    ok: false,
    reason: sawMismatch ? "signature_mismatch" : rsaError ? "rsa_error" : "signature_mismatch",
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
