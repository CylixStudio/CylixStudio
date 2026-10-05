import { useEffect, useRef, useState } from "react";

import { badgeAssetUrl, type KickBadge } from "@/hooks/useKickBadges";
import { readReplyMeta } from "@/lib/replyAlert";

export type ChatMessage = {
  id: string;
  platform: "TWITCH" | "KICK" | "TEST";
  author: string;
  color: string | null;
  badges: string[];
  /** Full, ordered badge objects exactly as the provider sent them (Kick). */
  badgeList?: KickBadge[];
  text: string;
  at: number;
  isReply?: boolean;
  replyQuote?: string | null;
};

function replyFields(
  payload: unknown,
  fallbackAt: number,
): Pick<ChatMessage, "isReply" | "replyQuote" | "at"> {
  const meta = readReplyMeta(payload);
  return {
    isReply: meta.isReply,
    replyQuote: meta.quote,
    at: meta.appearanceMs ?? fallbackAt,
  };
}

export type ChatSources = {
  twitchChannel: string | null;
  kickChatroomId: string | null;
  /** Kick channel slug, used to resolve channel-specific subscriber badges. */
  kickSlug?: string | null;
};

const TWITCH_IRC = "wss://irc-ws.chat.twitch.tv:443";
const KICK_WS =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false";

let counter = 0;
const nextId = () => `chat-${Date.now()}-${++counter}`;

/** Parses IRCv3 tags into a plain map. */
function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const [key, value = ""] = part.split("=");
    if (key) tags[key] = value.replace(/\\s/g, " ");
  }
  return tags;
}

/**
 * Direct, read-only chat connectivity for the Chat Box overlay.
 *
 * Twitch: anonymous IRC over WebSocket (no token required for reading).
 * Kick: the public Pusher chat gateway for the channel's chatroom id.
 * Both run in the browser so OBS renders messages with zero server latency.
 */
export function useLiveChat(
  sources: ChatSources | null,
  max = 25,
  onMessage?: (message: ChatMessage) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Messages the streamer pinned natively in Kick/Twitch chat.
  const [pinnedLive, setPinnedLive] = useState<ChatMessage | null>(null);
  const limit = useRef(max);
  limit.current = max;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const push = useRef((message: ChatMessage) => {
    setMessages((prev) => [message, ...prev].slice(0, Math.max(limit.current, 25)));
    onMessageRef.current?.(message);
  });

  const twitchChannel = sources?.twitchChannel ?? null;
  const kickChatroomId = sources?.kickChatroomId ?? null;

  // ------------------------------- Twitch -------------------------------
  useEffect(() => {
    if (!twitchChannel) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      socket = new WebSocket(TWITCH_IRC);

      socket.onopen = () => {
        attempts = 0;
        socket?.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        socket?.send("PASS SCHMOOPIIE");
        socket?.send(`NICK justinfan${Math.floor(Math.random() * 80000 + 1000)}`);
        socket?.send(`JOIN #${twitchChannel.toLowerCase()}`);
      };

      socket.onmessage = (event) => {
        for (const line of String(event.data).split("\r\n")) {
          if (!line) continue;
          if (line.startsWith("PING")) {
            socket?.send("PONG :tmi.twitch.tv");
            continue;
          }
          const match = line.match(/^(?:@([^ ]+) )?:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
          if (!match) continue;
          const tags = match[1] ? parseTags(match[1]) : {};
          const reply = replyFields(
            {
              "reply-parent-msg-id": tags["reply-parent-msg-id"],
              "reply-parent-user-id": tags["reply-parent-user-id"],
              "reply-parent-display-name": tags["reply-parent-display-name"],
              "reply-parent-msg-body": tags["reply-parent-msg-body"],
              "tmi-sent-ts": tags["tmi-sent-ts"],
            },
            Date.now(),
          );
          push.current({
            id: tags["id"] ?? nextId(),
            platform: "TWITCH",
            author: tags["display-name"] || (match[2] ?? "viewer"),
            color: tags["color"] || null,
            badges: (tags["badges"] ?? "")
              .split(",")
              .map((badge) => badge.split("/")[0] ?? "")
              .filter(Boolean),
            text: match[3] ?? "",
            ...reply,
          });
        }
      };

      const reconnect = () => {
        socket?.close();
        socket = null;
        if (cancelled) return;
        attempts += 1;
        retry = setTimeout(connect, Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4)));
      };
      socket.onerror = reconnect;
      socket.onclose = () => {
        if (!cancelled) reconnect();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      socket?.close();
      socket = null;
    };
  }, [twitchChannel]);

  // -------------------------------- Kick --------------------------------
  useEffect(() => {
    if (!kickChatroomId) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      socket = new WebSocket(KICK_WS);

      socket.onopen = () => {
        attempts = 0;
        socket?.send(
          JSON.stringify({
            event: "pusher:subscribe",
            data: { auth: "", channel: `chatrooms.${kickChatroomId}.v2` },
          }),
        );
      };

      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(String(event.data)) as { event?: string; data?: unknown };
          const name = frame.event ?? "";
          const isPinEvent = name.includes("PinnedMessage") || name.includes("ChatMessagePinned");
          if (!name.includes("ChatMessage") && !isPinEvent) return;
          const data =
            typeof frame.data === "string" ? JSON.parse(frame.data) : (frame.data as unknown);

          if (isPinEvent) {
            if (name.includes("Deleted")) {
              setPinnedLive(null);
              return;
            }
            const pin = (data as { message?: Record<string, unknown> })?.message ?? data;
            const pinPayload = pin as {
              id?: string;
              content?: string;
              sender?: {
                username?: string;
                identity?: { color?: string; badges?: Record<string, unknown>[] };
              };
            };
            if (!pinPayload?.content) return;
            const pinReply = replyFields(pin, Date.now());
            const pinBadges: KickBadge[] = (pinPayload.sender?.identity?.badges ?? []).map(
              (badge) => ({
                type: String(badge["type"] ?? "").trim(),
                text: typeof badge["text"] === "string" ? badge["text"] : null,
                count: typeof badge["count"] === "number" ? badge["count"] : null,
                imageUrl: badgeAssetUrl(badge),
              }),
            );
            setPinnedLive({
              id: pinPayload.id ?? nextId(),
              platform: "KICK",
              author: pinPayload.sender?.username ?? "viewer",
              color: pinPayload.sender?.identity?.color ?? null,
              badges: pinBadges.map((badge) => badge.type).filter(Boolean),
              badgeList: pinBadges,
              text: pinPayload.content,
              ...pinReply,
            });
            return;
          }
          const payload = data as {
            id?: string;
            content?: string;
            sender?: {
              username?: string;
              identity?: { color?: string; badges?: Record<string, unknown>[] };
            };
          };
          const rawBadges = payload.sender?.identity?.badges ?? [];
          const badgeList: KickBadge[] = rawBadges
            .map((badge) => ({
              type: String(badge["type"] ?? "").trim(),
              text: typeof badge["text"] === "string" ? badge["text"] : null,
              count: typeof badge["count"] === "number" ? badge["count"] : null,
              imageUrl: badgeAssetUrl(badge),
            }))
            .filter((badge) => badge.type.length > 0 || Boolean(badge.imageUrl));
          let text = payload.content ?? "";
          // Kick can place channel-point input outside `content`. Always scan
          // the complete event so Media Request URLs cannot be missed.
          try {
            const urlMatch = JSON.stringify(data).match(
              /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>\\]+/i,
            );
            if (urlMatch && !/youtube\.com|youtu\.be/i.test(text))
              text = `${text} ${urlMatch[0]}`.trim();
          } catch {
            /* ignore malformed payloads */
          }
          const message: ChatMessage = {
            id: payload.id ?? nextId(),
            platform: "KICK",
            author: payload.sender?.username ?? "viewer",
            color: payload.sender?.identity?.color ?? null,
            badges: badgeList.map((badge) => badge.type).filter(Boolean),
            badgeList,
            text,
            ...replyFields(data, Date.now()),
          };
          push.current(message);
        } catch {
          /* ignore malformed frames */
        }
      };

      const reconnect = () => {
        socket?.close();
        socket = null;
        if (cancelled) return;
        attempts += 1;
        retry = setTimeout(connect, Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4)));
      };
      socket.onerror = reconnect;
      socket.onclose = () => {
        if (!cancelled) reconnect();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      socket?.close();
      socket = null;
    };
  }, [kickChatroomId]);

  /** Injects a message from outside (test simulation via Realtime). */
  const pushMessage = push.current;

  return { messages, pushMessage, pinnedLive };
}
