import { extractKickChat, viewerChatMessageId, type KickPayload } from "@/lib/kickWebhookParse";
import { readChatAvatarUrl } from "@/lib/royalCompact";

/** Viewer chat lines stored on the Chat Box widget row and pushed to every overlay. */
export type OverlayChatLine = {
  id: string;
  platform: "TWITCH" | "KICK" | "TEST";
  author: string;
  color: string | null;
  badges: string[];
  avatarUrl?: string | null;
  text: string;
  at: number;
};

export type ChatLinkStatus = "connecting" | "live" | "reconnecting" | "error";
export type ChatLinkSurface = "overlay" | "studio";

export type ChatWidgetRecord = {
  id: string;
  state: unknown;
  updatedAt: string;
};

export type ChatPublishResult = {
  ok: boolean;
  stored: boolean;
  reason: string;
};

const MAX_LINES = 25;

export function readChatLine(row: unknown): OverlayChatLine | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"].trim() : "";
  const text = typeof record["text"] === "string" ? record["text"].trim() : "";
  const author = typeof record["author"] === "string" ? record["author"].trim() : "";
  if (!id || !text || !author) return null;
  const platform =
    record["platform"] === "TWITCH" || record["platform"] === "KICK" || record["platform"] === "TEST"
      ? record["platform"]
      : "TEST";
  const at = typeof record["at"] === "number" && Number.isFinite(record["at"]) ? record["at"] : Date.now();
  const badges = Array.isArray(record["badges"])
    ? record["badges"].filter((badge): badge is string => typeof badge === "string" && badge.trim().length > 0).slice(0, 12)
    : [];
  const color = typeof record["color"] === "string" && record["color"].trim() ? record["color"].trim() : null;
  const avatar =
    typeof record["avatarUrl"] === "string" && /^https:\/\//i.test(record["avatarUrl"]) ? record["avatarUrl"] : null;
  const line: OverlayChatLine = {
    id: id.slice(0, 80),
    platform,
    author: author.slice(0, 40),
    color,
    badges,
    text: text.slice(0, 400),
    at,
  };
  if (avatar) line.avatarUrl = avatar;
  return line;
}

export function parseOverlayChat(state: unknown): OverlayChatLine[] {
  const source =
    state && typeof state === "object" && !Array.isArray(state)
      ? (state as Record<string, unknown>)["chatLines"]
      : null;
  if (!Array.isArray(source)) return [];
  const lines: OverlayChatLine[] = [];
  for (const row of source) {
    const line = readChatLine(row);
    if (line) lines.push(line);
  }
  return lines.slice(0, MAX_LINES);
}

/** Appends one viewer line. The same id is kept once. Other widget state keys stay put. */
export function appendChatLine(state: unknown, line: OverlayChatLine): { state: Record<string, unknown>; added: boolean } {
  const base =
    state && typeof state === "object" && !Array.isArray(state) ? { ...(state as Record<string, unknown>) } : {};
  const current = parseOverlayChat(base);
  const clean = readChatLine(line);
  if (!clean) return { state: { ...base, chatLines: current }, added: false };
  if (current.some((row) => row.id === clean.id)) return { state: { ...base, chatLines: current }, added: false };
  return { state: { ...base, chatLines: [clean, ...current].slice(0, MAX_LINES) }, added: true };
}

/** Snapshot from the database wins. Local lines that are not stored yet stay until the cap. */
export function reconcileChatLines(local: OverlayChatLine[], snapshot: OverlayChatLine[]): OverlayChatLine[] {
  const byId = new Map<string, OverlayChatLine>();
  for (const line of snapshot) {
    const clean = readChatLine(line);
    if (clean) byId.set(clean.id, clean);
  }
  for (const line of local) {
    const clean = readChatLine(line);
    if (clean && !byId.has(clean.id)) byId.set(clean.id, clean);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_LINES);
}

export function dedupeChatById<T extends { id: string }>(groups: readonly (readonly T[])[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const line of group) {
      if (!line?.id || seen.has(line.id)) continue;
      seen.add(line.id);
      out.push(line);
    }
  }
  return out;
}

/** Default and Royal Compact read this list. The theme id does not filter it. */
export function sameChatSource<T>(themeId: string, lines: readonly T[]): T[] {
  void themeId;
  return [...lines];
}

export function chatOwnerUserId(
  rows: readonly { userId: string; platformUserId: string; active: boolean }[],
  broadcasterId: string,
): string | null {
  const match = rows.find((row) => row.active && row.platformUserId === broadcasterId);
  return match?.userId ?? null;
}

/**
 * Waiting for chat only when the link is up and nothing has arrived.
 * A failed link is not a quiet chat. OBS does not paint the error.
 */
export function chatStatusLabel(input: {
  status: ChatLinkStatus;
  count: number;
  surface: ChatLinkSurface;
}): string | null {
  if (input.status === "connecting") return input.count > 0 ? null : "Connecting";
  if (input.status === "reconnecting") return input.count > 0 ? null : "Reconnecting";
  if (input.status === "error") return input.surface === "studio" ? "Connection Error" : null;
  if (input.count === 0) return "Waiting for chat";
  return null;
}

export function decideChatIngest(input: {
  duplicate?: boolean;
  botAuthor?: boolean;
  emptyText?: boolean;
  noBroadcaster?: boolean;
  connectionFailed?: boolean;
  noConnection?: boolean;
  publish?: ChatPublishResult | null;
  commandFailed?: boolean;
}): { httpStatus: number; bodyStatus: "processed" | "ignored" | "failed" | "duplicate"; reason: string } {
  if (input.duplicate) return { httpStatus: 200, bodyStatus: "duplicate", reason: "duplicate" };
  if (input.botAuthor) return { httpStatus: 200, bodyStatus: "ignored", reason: "bot_author" };
  if (input.emptyText) return { httpStatus: 200, bodyStatus: "ignored", reason: "empty_text" };
  if (input.noBroadcaster) return { httpStatus: 200, bodyStatus: "ignored", reason: "no_broadcaster" };
  if (input.connectionFailed) {
    return { httpStatus: 503, bodyStatus: "failed", reason: "kick_connection_query_failed" };
  }
  if (input.noConnection) return { httpStatus: 200, bodyStatus: "ignored", reason: "kick_connection_not_found" };
  const publish = input.publish;
  if (!publish || !publish.ok) {
    return { httpStatus: 503, bodyStatus: "failed", reason: publish?.reason ?? "chat_store_failed" };
  }
  if (!publish.stored) {
    return {
      httpStatus: publish.reason === "no_chat_widget" || publish.reason === "empty_text" ? 200 : 503,
      bodyStatus: publish.reason === "no_chat_widget" || publish.reason === "empty_text" ? "ignored" : "failed",
      reason: publish.reason,
    };
  }
  if (input.commandFailed) {
    return { httpStatus: 200, bodyStatus: "processed", reason: "command_failed_chat_kept" };
  }
  return { httpStatus: 200, bodyStatus: "processed", reason: "stored" };
}

export type ChatStore = {
  list: (userId: string) => Promise<ChatWidgetRecord[] | null>;
  save: (id: string, state: unknown, updatedAt: string) => Promise<"ok" | "conflict" | "error">;
  broadcast: (ids: string[], line: OverlayChatLine) => Promise<boolean>;
};

/**
 * Writes the line onto that creator's Chat Box rows, then broadcasts it.
 * A failed write or broadcast is not success. Missing bot credentials are not an input.
 */
export async function publishViewerChat(
  userId: string,
  line: OverlayChatLine,
  store: ChatStore,
): Promise<ChatPublishResult> {
  const clean = readChatLine(line);
  if (!clean) return { ok: true, stored: false, reason: "empty_text" };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const widgets = await store.list(userId);
    if (widgets == null) return { ok: false, stored: false, reason: "chat_store_failed" };
    if (widgets.length === 0) return { ok: true, stored: false, reason: "no_chat_widget" };

    let conflict = false;
    const savedIds: string[] = [];
    for (const widget of widgets) {
      const next = appendChatLine(widget.state, clean);
      if (!next.added) {
        savedIds.push(widget.id);
        continue;
      }
      const result = await store.save(widget.id, next.state, widget.updatedAt);
      if (result === "conflict") {
        conflict = true;
        break;
      }
      if (result === "error") return { ok: false, stored: false, reason: "chat_store_failed" };
      savedIds.push(widget.id);
    }
    if (conflict) continue;

    // The widget row is the shared store. A missed broadcast still reaches OBS
    // on the overlay's existing poll. A failed save does not.
    await store.broadcast(savedIds, clean);
    return { ok: true, stored: true, reason: "stored" };
  }

  return { ok: false, stored: false, reason: "chat_store_failed" };
}

function kickColor(body: KickPayload): string | null {
  const piles = [body, body["data"], body["sender"], body["payload"]];
  for (const pile of piles) {
    if (!pile || typeof pile !== "object") continue;
    const record = pile as KickPayload;
    const identity = record["identity"];
    const fromIdentity =
      identity && typeof identity === "object"
        ? ((identity as KickPayload)["color"] ?? (identity as KickPayload)["username_color"])
        : null;
    const candidate = fromIdentity ?? record["color"] ?? record["username_color"];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 20);
  }
  return null;
}

export function viewerLineFromKick(body: KickPayload, fallbackId: string, at = Date.now()): OverlayChatLine | null {
  const chat = extractKickChat(body);
  const text = chat.text.trim();
  if (!text) return null;
  const id = (viewerChatMessageId(body) ?? fallbackId).trim();
  if (!id) return null;
  const avatar = readChatAvatarUrl(body);
  const line: OverlayChatLine = {
    id,
    platform: "KICK",
    author: (chat.username || "viewer").slice(0, 40),
    color: kickColor(body),
    badges: chat.identityBadges.filter((badge) => badge.trim().length > 0).slice(0, 12),
    text: text.slice(0, 400),
    at,
  };
  if (avatar) line.avatarUrl = avatar;
  return line;
}

export function viewerLineFromTwitch(event: Record<string, unknown>, messageId: string, at = Date.now()): OverlayChatLine | null {
  const message = event["message"];
  const text =
    message && typeof message === "object" && typeof (message as { text?: unknown }).text === "string"
      ? (message as { text: string }).text.trim()
      : "";
  if (!text) return null;
  const id =
    (typeof event["message_id"] === "string" && event["message_id"].trim()) || messageId.trim();
  if (!id) return null;
  const author =
    (typeof event["chatter_user_name"] === "string" && event["chatter_user_name"].trim()) ||
    (typeof event["chatter_user_login"] === "string" && event["chatter_user_login"].trim()) ||
    "viewer";
  const color = typeof event["color"] === "string" && event["color"].trim() ? event["color"].trim() : null;
  const badges = Array.isArray(event["badges"])
    ? event["badges"]
        .map((badge) => {
          if (!badge || typeof badge !== "object") return "";
          const setId = (badge as { set_id?: unknown }).set_id;
          return typeof setId === "string" ? setId : "";
        })
        .filter((badge) => badge.length > 0)
        .slice(0, 12)
    : [];
  const avatar = readChatAvatarUrl(event);
  const line: OverlayChatLine = {
    id: id.slice(0, 80),
    platform: "TWITCH",
    author: author.slice(0, 40),
    color,
    badges,
    text: text.slice(0, 400),
    at,
  };
  if (avatar) line.avatarUrl = avatar;
  return line;
}
