/**
 * Shared reply detection and the 10-minute live-alert clock.
 * Historical rows stay in the activity feed; only live alert surfaces expire.
 */

export const REPLY_ALERT_MS = 10 * 60 * 1000;
export const REPLY_FADE_MS = 500;

const FLAG_KEYS = new Set(["is_reply", "isreply"]);

/** Present, non-empty values on these keys mean the payload is a reply. */
const REF_KEYS = new Set([
  "reply_to",
  "replyto",
  "reply_to_message_id",
  "replytomessageid",
  "reply_to_msg_id",
  "reply_to_id",
  "reply_id",
  "replyid",
  "replied_to",
  "repliedto",
  "replying_to",
  "replyingto",
  "parent_message",
  "parentmessage",
  "parent_message_id",
  "parentmessageid",
  "parent_msg_id",
  "in_reply_to",
  "inreplyto",
  "in_reply_to_status_id",
  "in_reply_to_user_id",
  "in_reply_to_message_id",
  "quoted_message",
  "quotedmessage",
  "quoted_status",
  "quotedstatus",
  "reply_parent_msg_id",
  "reply_parent_user_id",
  "reply_parent_display_name",
  "reply_parent_msg_body",
  "message_reference",
  "referenced_message",
  "referencedmessage",
  "original_message",
  "originalmessage",
]);

const QUOTE_KEYS = new Set([
  "reply_parent_msg_body",
  "quoted_message",
  "quotedmessage",
  "parent_message",
  "parentmessage",
  "original_message",
  "originalmessage",
  "referenced_message",
  "referencedmessage",
  "message_reference",
]);

const APPEARANCE_KEYS = [
  "received_at",
  "receivedat",
  "created_at",
  "createdat",
  "sent_at",
  "sentat",
  "tmi_sent_ts",
];

const MAX_DEPTH = 6;
const MAX_NODES = 200;

export type ReplyMeta = {
  isReply: boolean;
  quote: string | null;
  /** Provider timestamp from the payload, when one was sent. */
  appearanceMs: number | null;
};

function normKey(key: string): string {
  return key.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function meaningful(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((entry) => meaningful(entry));
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

function replyKeyHit(key: string, value: unknown): boolean {
  const norm = normKey(key);
  if (FLAG_KEYS.has(norm)) return value === true || value === "true" || value === 1;
  if (norm === "reply") {
    if (value === true || value === "true" || value === 1) return true;
    if (value && typeof value === "object") return meaningful(value);
    if (typeof value === "string") {
      const text = value.trim();
      return text.length > 0 && text.length <= 80 && !/\s/.test(text);
    }
    return false;
  }
  if (norm === "thread") {
    if (value === true) return true;
    return Boolean(value && typeof value === "object" && meaningful(value));
  }
  if (norm === "thread_id" || norm === "threadid" || norm === "thread_ts") return meaningful(value);
  if (
    (norm === "type" || norm === "message_type" || norm === "messagetype") &&
    typeof value === "string"
  ) {
    return value.trim().toLowerCase() === "reply";
  }
  if (REF_KEYS.has(norm)) return meaningful(value);
  return false;
}

export function readTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 1e9) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function quoteFromValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 160);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["content", "text", "body", "message", "msg"]) {
    const nested = record[key];
    if (typeof nested === "string" && nested.trim()) return nested.trim().slice(0, 160);
  }
  return null;
}

function walk(
  value: unknown,
  depth: number,
  state: { nodes: number; reply: boolean; quote: string | null; appearanceMs: number | null },
) {
  if (state.reply && state.quote && state.appearanceMs != null) return;
  if (depth > MAX_DEPTH || state.nodes >= MAX_NODES) return;
  state.nodes += 1;
  if (Array.isArray(value)) {
    for (const entry of value) {
      walk(entry, depth + 1, state);
      if (state.reply && state.quote && state.appearanceMs != null) return;
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    const norm = normKey(key);
    if (!state.reply && replyKeyHit(key, entry)) state.reply = true;
    if (!state.quote && QUOTE_KEYS.has(norm)) state.quote = quoteFromValue(entry);
    if (depth === 0 && state.appearanceMs == null && APPEARANCE_KEYS.includes(norm)) {
      state.appearanceMs = readTimestamp(entry);
    }
    if (entry && typeof entry === "object") walk(entry, depth + 1, state);
    if (state.reply && state.quote && state.appearanceMs != null) return;
  }
}

/** True only when the payload carries a real reply / quote / thread reference. */
export function isReplyPayload(payload: unknown): boolean {
  return readReplyMeta(payload).isReply;
}

export function readReplyMeta(payload: unknown): ReplyMeta {
  const state = { nodes: 0, reply: false, quote: null as string | null, appearanceMs: null as number | null };
  walk(payload, 0, state);
  return { isReply: state.reply, quote: state.quote, appearanceMs: state.appearanceMs };
}

/**
 * Copies a reply flag onto the stored JSON payload.
 * Non-replies are returned unchanged. Timer fields are never touched.
 */
export function annotateReplyPayload(raw: unknown): unknown {
  if (!isReplyPayload(raw)) return raw;
  const meta = readReplyMeta(raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { isReply: true, ...(meta.quote ? { replyQuote: meta.quote } : {}), payload: raw ?? null };
  }
  const record = { ...(raw as Record<string, unknown>) };
  record["isReply"] = true;
  if (meta.quote && typeof record["replyQuote"] !== "string") record["replyQuote"] = meta.quote;
  return record;
}

export function replyExpiresAt(appearanceMs: number): number {
  return appearanceMs + REPLY_ALERT_MS;
}

export function replyRemainingMs(appearanceMs: number, now = Date.now()): number {
  return replyExpiresAt(appearanceMs) - now;
}

/** True once the reply has been on screen for 10 minutes, including the exact boundary. */
export function isReplyExpired(appearanceMs: number, now = Date.now()): boolean {
  return replyRemainingMs(appearanceMs, now) <= 0;
}
