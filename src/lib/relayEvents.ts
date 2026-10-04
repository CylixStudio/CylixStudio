/**
 * Tolerant Streamlabs / StreamElements payload parsing.
 * Null fields, string amounts, and the overlay `listener`/`event` shape are
 * all accepted. Provider ids stay stable so a socket replay is not a new tip.
 */

export type RelayEventType =
  | "DONATION"
  | "SUBSCRIPTION"
  | "GIFT_SUB"
  | "BITS"
  | "FOLLOW"
  | "RAID"
  | "LIKE";

export type ParsedRelayEvent = {
  eventType: RelayEventType;
  providerEventId: string;
  actorName: string;
  amount: number | null;
  currency: string | null;
  quantity: number;
  message: string | null;
  origin: string | null;
  raw: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Pulls a money amount out of a number or a formatted string such as "$1,250.50". */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/,/g, "").replace(/[^\d.+-]/g, "");
  if (!normalized || !/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstMoney(record: Record<string, unknown>, keys: string[]): number | null {
  let zero: number | null = null;
  for (const key of keys) {
    const parsed = parseMoney(record[key]);
    if (parsed == null || parsed < 0) continue;
    if (parsed > 0) return parsed;
    if (zero == null) zero = parsed;
  }
  return zero;
}

function hashId(prefix: string, parts: Array<string | number | null>): string {
  const body = parts.map((part) => (part == null ? "" : String(part))).join("|");
  let hash = 2166136261;
  for (let index = 0; index < body.length; index += 1) {
    hash ^= body.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}:${(hash >>> 0).toString(16)}`.slice(0, 180);
}

function providerId(
  prefix: string,
  record: Record<string, unknown>,
  fallback: Array<string | number | null>,
): string {
  const explicit =
    text(record["_id"]) ??
    text(record["id"]) ??
    text(record["tipId"]) ??
    text(record["activityId"]) ??
    text(record["event_id"]);
  if (explicit) return explicit.slice(0, 180);
  return hashId(prefix, fallback);
}

export function mapStreamlabsType(type: string): RelayEventType | null {
  switch (type.toLowerCase()) {
    case "donation":
    case "streamlabscharitydonation":
    case "merch":
    case "superchat":
    case "pledge":
      return "DONATION";
    case "subscription":
    case "resub":
    case "membership":
      return "SUBSCRIPTION";
    case "submysterygift":
    case "giftsub":
      return "GIFT_SUB";
    case "bits":
    case "cheer":
      return "BITS";
    case "follow":
    case "subscriber":
      return "FOLLOW";
    case "raid":
    case "host":
      return "RAID";
    case "like":
    case "likes":
      return "LIKE";
    default:
      return null;
  }
}

export function mapStreamElementsType(type: string): RelayEventType | null {
  const normalized = type.toLowerCase().replace(/[_-]/g, "");
  if (
    normalized === "tip" ||
    normalized === "tiplatest" ||
    normalized === "donation" ||
    normalized === "merch" ||
    normalized.startsWith("superchat")
  ) {
    return "DONATION";
  }
  switch (normalized) {
    case "subscriber":
    case "resub":
    case "membership":
    case "sponsor":
      return "SUBSCRIPTION";
    case "communitygiftpurchase":
    case "subgift":
      return "GIFT_SUB";
    case "cheer":
    case "bits":
      return "BITS";
    case "follow":
      return "FOLLOW";
    case "raid":
    case "host":
      return "RAID";
    case "like":
    case "likes":
      return "LIKE";
    case "gift":
      return "DONATION";
    default:
      return null;
  }
}

function actorName(record: Record<string, unknown>): string {
  const from = record["from"];
  const fromRecord = asRecord(from);
  const user = asRecord(record["user"]);
  return (
    text(from) ??
    text(fromRecord?.["name"]) ??
    text(fromRecord?.["displayName"]) ??
    text(record["name"]) ??
    text(record["displayName"]) ??
    text(record["display_name"]) ??
    text(record["username"]) ??
    text(user?.["username"]) ??
    text(user?.["displayName"]) ??
    text(user?.["name"]) ??
    "Anonymous"
  ).slice(0, 80);
}

function messageText(record: Record<string, unknown>): string | null {
  const value = text(record["message"]) ?? text(record["comment"]) ?? text(record["text"]);
  return value ? value.slice(0, 400) : null;
}

function quantityOf(record: Record<string, unknown>, eventType: RelayEventType): number {
  if (eventType !== "SUBSCRIPTION" && eventType !== "GIFT_SUB") return 1;
  const count = parseMoney(record["months"]) ?? parseMoney(record["quantity"]);
  if (count == null || count < 1) return 1;
  return Math.min(Math.floor(count), 100000);
}

function streamlabsMessages(root: Record<string, unknown>): Record<string, unknown>[] {
  const message = root["message"];
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message) as unknown;
      if (Array.isArray(parsed) || asRecord(parsed)) return streamlabsMessages({ ...root, message: parsed });
    } catch {
      // The string is the tip text. Donation fields live on the root object.
    }
    return [root];
  }
  if (Array.isArray(message)) {
    return message.map(asRecord).filter((item): item is Record<string, unknown> => item != null);
  }
  const record = asRecord(message);
  if (record) return [record];
  if (
    parseMoney(root["amount"]) != null ||
    text(root["formatted_amount"]) ||
    text(root["formattedAmount"]) ||
    text(root["from"]) ||
    text(root["name"])
  ) {
    return [root];
  }
  return [];
}

function streamlabsOrigin(type: string, tagged: string | null, eventType: RelayEventType): string | null {
  if (tagged) return tagged;
  if (type === "superchat" || type === "membership") return "youtube";
  if (eventType === "LIKE") return "tiktok";
  return null;
}

/** Socket frame or webhook body → zero or more relay events. */
export function parseStreamlabsPayload(body: unknown): ParsedRelayEvent[] {
  const root = asRecord(body);
  if (!root) return [];
  const type = (text(root["type"]) ?? "").toLowerCase();
  const eventType = mapStreamlabsType(type);
  if (!eventType) return [];
  const origin = streamlabsOrigin(type, text(root["for"]), eventType);
  const messages = streamlabsMessages(root);
  return messages.map((message, index) => {
    const amount =
      eventType === "DONATION" || eventType === "BITS"
        ? firstMoney(message, ["amount", "formatted_amount", "formattedAmount"])
        : null;
    const actor = actorName(message);
    const note = messageText(message);
    return {
      eventType,
      providerEventId: providerId("streamlabs", message, [
        text(root["event_id"]),
        type,
        actor,
        amount,
        note,
        text(message["created_at"]) ?? text(root["created_at"]),
        index,
      ]),
      actorName: actor,
      amount,
      currency: text(message["currency"])?.slice(0, 12) ?? null,
      quantity: quantityOf(message, eventType),
      message: note,
      origin,
      raw: message,
    };
  });
}

function streamElementsOrigin(
  type: string,
  provider: string | null,
  eventType: RelayEventType,
): string | null {
  if (provider) return provider;
  if (type.includes("superchat") || type === "membership" || type === "sponsor") return "youtube";
  if (eventType === "LIKE" || type === "gift") return "tiktok";
  return null;
}

/** Realtime activity, webhook body, or overlay `listener`/`event` payload. */
export function parseStreamElementsPayload(body: unknown): ParsedRelayEvent | null {
  const root = asRecord(body);
  if (!root) return null;
  const nested = asRecord(root["event"]);
  const data =
    asRecord(root["data"]) ??
    asRecord(nested?.["data"]) ??
    nested ??
    asRecord(root["donation"]) ??
    root;
  if (!data) return null;
  const type = (
    text(root["type"]) ??
    text(nested?.["type"]) ??
    text(root["listener"]) ??
    ""
  ).toLowerCase();
  const eventType = mapStreamElementsType(type);
  if (!eventType) return null;
  const provider = text(root["provider"]) ?? text(data["provider"]) ?? text(nested?.["provider"]);
  const amount =
    eventType === "DONATION" || eventType === "BITS"
      ? firstMoney(data, ["amount", "formattedAmount", "formatted_amount"])
      : null;
  const actor = actorName(data);
  const note = messageText(data);
  const idSource: Record<string, unknown> = {
    _id: root["_id"] ?? data["_id"] ?? data["tipId"] ?? data["activityId"],
    tipId: data["tipId"],
    activityId: data["activityId"],
  };
  return {
    eventType,
    providerEventId: providerId("streamelements", idSource, [type, actor, amount, note, provider]),
    actorName: actor,
    amount,
    currency: text(data["currency"])?.slice(0, 12) ?? null,
    quantity: quantityOf(data, eventType),
    message: note,
    origin: streamElementsOrigin(type, provider, eventType),
    raw: { ...data, message: note },
  };
}

const RELAY_SKEW_MS = 10 * 60 * 1000;

/**
 * Missing or unreadable timestamps are allowed. A timestamp that parses and is
 * outside the replay window is rejected.
 */
export function isFreshRelayTimestamp(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return isFreshRelayTimestamp(Number(value.trim()));
  }
  const sent =
    typeof value === "number"
      ? value < 1e12
        ? value * 1000
        : value
      : Date.parse(String(value));
  if (Number.isNaN(sent)) return true;
  return Math.abs(Date.now() - sent) <= RELAY_SKEW_MS;
}

export type SocketIoFrame = { name: string; payload: unknown } | "ping";

/** Engine.io / socket.io v2 text frame. `2` is a ping; `42[...]` is an event. */
export function readSocketIoFrame(frame: string): SocketIoFrame | null {
  if (frame === "2") return "ping";
  if (!frame.startsWith("42")) return null;
  try {
    const parsed = JSON.parse(frame.slice(2)) as unknown;
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string") return null;
    return { name: parsed[0], payload: parsed[1] };
  } catch {
    return null;
  }
}
