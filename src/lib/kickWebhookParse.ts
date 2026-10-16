export type KickPayload = Record<string, unknown>;

export type KickChatFields = {
  text: string;
  rawText: string;
  username: string;
  broadcasterId: string | null;
  senderId: string | null;
  /** `sender.user_id` / `sender.id` only. Top-level `user_id` is not the chatter. */
  senderUserId: string | null;
  identityBadges: string[];
};

export type KickNormalizedEvent = {
  platform: "KICK";
  providerEventId: string;
  rawPayload: KickPayload;
  amount: number | null;
  currency: string | null;
  eventType: "FOLLOW" | "SUBSCRIPTION" | "GIFT_SUB" | "BITS" | "RAID";
  actorName: string | null;
  actorPlatformId: string | null;
  quantity: number;
};

export type KickWebhookOutcome =
  | "processed"
  | "accepted"
  | "intentionally_ignored"
  | "duplicate"
  | "failed";

function pickString(obj: unknown, ...path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : typeof cur === "number" ? String(cur) : null;
}

function asRecord(value: unknown): KickPayload | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as KickPayload) : null;
}

function messageTextFrom(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number") return String(value);
  const record = asRecord(value);
  if (!record) return null;
  return (
    messageTextFrom(record["text"], depth + 1) ??
    messageTextFrom(record["content"], depth + 1) ??
    messageTextFrom(record["message"], depth + 1) ??
    messageTextFrom(record["body"], depth + 1)
  );
}

function firstString(source: KickPayload, paths: string[][]): string | null {
  for (const path of paths) {
    const value = pickString(source, ...path);
    if (value) return value;
  }
  return null;
}

function readIdentityBadges(source: KickPayload): string[] {
  const identity = (source["sender"] as KickPayload | undefined)?.["identity"] as KickPayload | undefined;
  const badges = identity?.["badges"];
  if (!Array.isArray(badges)) return [];
  return badges.map((badge) => {
    const record = asRecord(badge);
    return String(record?.["type"] ?? record?.["text"] ?? badge ?? "");
  });
}

const SENDER_NAME_PATHS = [
  ["sender", "username"],
  ["sender", "name"],
  ["sender", "slug"],
  ["chatter", "username"],
  ["author", "username"],
  ["message", "sender", "username"],
] as const;

const BROADCASTER_NAME_PATHS = [
  ["broadcaster", "username"],
  ["broadcaster", "name"],
  ["broadcaster", "channel_slug"],
  ["channel", "username"],
  ["channel", "slug"],
] as const;

/** Prefer the chatter. A nested `user` is only used when it is not the channel account. */
function senderUsernameFrom(source: KickPayload): string {
  const sender = firstString(source, SENDER_NAME_PATHS.map((path) => [...path]));
  if (sender) return sender;
  const broadcaster = firstString(source, BROADCASTER_NAME_PATHS.map((path) => [...path]));
  const generic = firstString(source, [["user", "username"], ["user", "name"], ["username"]]) ?? "";
  if (generic && generic.toLowerCase() !== (broadcaster ?? "").toLowerCase()) return generic;
  return "";
}

/** Walks the shapes Kick has used for chat.message.sent, including wrapped `data`. */
export function extractKickChat(body: KickPayload): KickChatFields {
  const sources = [body, asRecord(body["data"]), asRecord(body["payload"]), asRecord(body["event"])].filter(
    (source): source is KickPayload => source != null,
  );
  let rawText = "";
  let username = "";
  let broadcasterId: string | null = null;
  let senderId: string | null = null;
  let senderUserId: string | null = null;
  let identityBadges: string[] = [];

  for (const source of sources) {
    rawText ||=
      messageTextFrom(source["content"]) ??
      messageTextFrom(source["message"]) ??
      messageTextFrom(source["text"]) ??
      "";
    username ||= senderUsernameFrom(source);
    broadcasterId ||= firstString(source, [
      ["broadcaster", "user_id"],
      ["broadcaster", "id"],
      ["broadcaster_user_id"],
      ["channel", "user_id"],
      ["channel_id"],
    ]);
    senderId ||= firstString(source, [
      ["sender", "user_id"],
      ["sender", "id"],
      ["user", "user_id"],
      ["user_id"],
    ]);
    senderUserId ||= firstString(source, [
      ["sender", "user_id"],
      ["sender", "id"],
      ["message", "sender", "user_id"],
    ]);
    if (!identityBadges.length) identityBadges = readIdentityBadges(source);
  }

  const plain = rawText
    .replace(/\[emote:\d+:[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text: plain || rawText.trim(),
    rawText,
    username: username || "Kick viewer",
    broadcasterId,
    senderId,
    senderUserId,
    identityBadges,
  };
}

export function viewerChatMessageId(body: KickPayload): string | null {
  const sources = [body, asRecord(body["data"]), asRecord(body["payload"]), asRecord(body["message"])].filter(
    (source): source is KickPayload => source != null,
  );
  for (const source of sources) {
    const id = firstString(source, [["message_id"], ["id"]]);
    if (id && id.length >= 8 && id.length <= 80) return id;
  }
  return null;
}

export function isKickChatEvent(type: string, chat: KickChatFields): boolean {
  const normalized = type.toLowerCase().replace(/_/g, ".");
  if (normalized === "chat.message.sent" || normalized.includes("chat.message")) return true;
  if (
    normalized.startsWith("channel.") ||
    normalized.startsWith("kicks.") ||
    normalized === "follow" ||
    normalized === "subscription" ||
    normalized === "raid" ||
    normalized.startsWith("gifted.")
  ) {
    return false;
  }
  return Boolean(chat.rawText && chat.username !== "Kick viewer");
}

/** Kick sometimes wraps the event in `data` / `payload`. Chat uses the outer body. */
export function unwrapKickEvent(body: KickPayload): KickPayload {
  const nested = [asRecord(body["data"]), asRecord(body["payload"])].filter(
    (source): source is KickPayload => source != null,
  );
  for (const source of nested) {
    if (
      source["follower"] ||
      source["subscriber"] ||
      source["gifter"] ||
      source["broadcaster"] ||
      source["sender"] ||
      source["gift"] ||
      source["raider"]
    ) {
      return source;
    }
  }
  return body;
}

function subscriptionMonths(value: unknown): number {
  const months = Number(value ?? 1);
  if (!Number.isFinite(months) || months < 1 || months > 36) return 1;
  return Math.round(months);
}

function boundedCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.round(value), 500);
}

export function normalizeKickEvent(type: string, messageId: string, body: KickPayload): KickNormalizedEvent | null {
  const kind = type.toLowerCase().replace(/_/g, ".");
  const gift = asRecord(body["gift"]);
  const giftMessage = pickString(gift ?? {}, "message") ?? pickString(body, "message");
  const base = {
    platform: "KICK" as const,
    providerEventId: messageId,
    rawPayload: giftMessage ? { ...body, message: giftMessage } : body,
    amount: null as number | null,
    currency: null as string | null,
  };
  const actorName =
    pickString(body, "follower", "username") ??
    pickString(body, "subscriber", "username") ??
    pickString(body, "gifter", "username") ??
    pickString(body, "sender", "username") ??
    pickString(body, "raider", "username") ??
    pickString(body, "user", "username");
  const actorPlatformId =
    pickString(body, "follower", "user_id") ??
    pickString(body, "subscriber", "user_id") ??
    pickString(body, "gifter", "user_id") ??
    pickString(body, "sender", "user_id") ??
    pickString(body, "raider", "user_id");

  switch (kind) {
    case "channel.followed":
    case "follow":
      return { ...base, eventType: "FOLLOW", actorName, actorPlatformId, quantity: 1 };
    case "channel.subscription.new":
    case "channel.subscription.renewal":
    case "subscription":
      return {
        ...base,
        eventType: "SUBSCRIPTION",
        actorName,
        actorPlatformId,
        quantity: subscriptionMonths(body["duration"]),
      };
    case "channel.subscription.gifts":
    case "gifted.subscriptions":
      return {
        ...base,
        eventType: "GIFT_SUB",
        actorName: actorName ?? "Anonymous",
        actorPlatformId,
        quantity: boundedCount(
          Array.isArray(body["giftees"]) ? (body["giftees"] as unknown[]).length : Number(body["quantity"] ?? 1) || 1,
        ),
      };
    case "kicks.gifted":
    case "channel.kicks.gifted": {
      const amount = Number(gift?.["amount"] ?? body["amount"] ?? 0);
      return {
        ...base,
        eventType: "BITS",
        actorName,
        actorPlatformId,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        quantity: 1,
      };
    }
    case "channel.raid":
    case "livestream.raid":
    case "raid":
      return {
        ...base,
        eventType: "RAID",
        actorName,
        actorPlatformId,
        amount: null,
        quantity: 1,
      };
    default:
      return null;
  }
}

/**
 * Static predicates that do not need the custom-command catalog.
 * True for `!`, `#`, or `?` (including Arabic names after the marker),
 * an exact shop/store/متجر or wheel/spin/عجلة word, `mark`/`emark` with
 * an optional `!` or `/`, or a media link. A trailing `?` is not a prefix.
 * Ordinary sentences stay false so the route does not import command modules.
 */
export function chatTextNeedsHandlers(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[!#?]/.test(trimmed)) return true;
  if (/^(?:shop|store|متجر|wheel|spin|عجلة)$/i.test(trimmed)) return true;
  if (/^[!/]?(?:emark|mark)\b/i.test(trimmed)) return true;
  if (/https?:\/\/|spotify:track:/i.test(trimmed)) return true;
  return false;
}

type DirectCatalog = {
  defaultPrefix: string;
  commands: Array<{
    id: string;
    name: string;
    prefix: string | null;
    response: string;
    enabled: boolean;
    platforms: Array<"KICK" | "TWITCH">;
    roles: string[];
    cooldownSeconds: number;
    createdAt: string;
    updatedAt: string;
  }>;
};

/**
 * True when this chat line must import command handlers.
 * A null catalog means the name query failed, so the line is not treated as ordinary.
 * An empty catalog means there is no direct trigger to match.
 */
export async function chatLineNeedsCommandModules(
  text: string,
  catalog: DirectCatalog | null,
): Promise<boolean> {
  if (chatTextNeedsHandlers(text)) return true;
  if (!text.trim()) return false;
  if (!catalog) return true;
  if (!catalog.commands.length) return false;
  const { matchCustomCommand } = await import("@/lib/customCommands");
  return matchCustomCommand(text, catalog.commands, catalog.defaultPrefix, "KICK") != null;
}

const seenEvents = new Map<string, number>();
const SEEN_LIMIT = 2000;

/** True when this isolate already finished this Kick event id. */
export function kickEventAlreadyHandled(messageId: string | null): boolean {
  if (!messageId) return false;
  return seenEvents.has(messageId);
}

/** Record a finished event so a Kick retry on this isolate does not run twice. */
export function rememberKickEvent(messageId: string | null): void {
  if (!messageId) return;
  if (seenEvents.has(messageId)) return;
  seenEvents.set(messageId, Date.now());
  if (seenEvents.size <= SEEN_LIMIT) return;
  const oldest = seenEvents.keys().next().value;
  if (oldest) seenEvents.delete(oldest);
}

export function resetKickEventMemory(): void {
  seenEvents.clear();
}

/**
 * True when the sender is the official Developer app bot user id.
 * The display name @CylixBot is not enough: that name is also an ordinary user.
 */
export function isCylixBotChatAuthor(
  _username: string,
  senderUserId: string | null,
  botUserId?: string | null,
): boolean {
  const configured = botUserId?.trim() ?? "";
  const sender = senderUserId?.trim() ?? "";
  return Boolean(configured && sender && sender === configured);
}
