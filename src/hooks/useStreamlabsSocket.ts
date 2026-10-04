import { useEffect, useRef, useState } from "react";

import { ingestStreamlabsSocketEvent } from "@/lib/connections.functions";

type SlEventType = "DONATION" | "SUBSCRIPTION" | "GIFT_SUB" | "BITS" | "FOLLOW" | "RAID" | "LIKE";

type SlRaw = {
  type?: string;
  event_id?: string;
  for?: string;
  message?: Record<string, unknown>[] | Record<string, unknown>;
};

export type StreamlabsSocketStatus = "idle" | "connecting" | "live" | "error";

const SOCKET_URL = "wss://sockets.streamlabs.com/socket.io/?transport=websocket&token=";

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Maps a Streamlabs socket `type` onto our internal event enum. */
function mapType(type: string): SlEventType | null {
  switch (type) {
    case "donation":
    case "streamlabscharitydonation":
    case "merch":
    case "superchat":
      return "DONATION";
    case "subscription":
    case "resub":
    case "membership":
      return "SUBSCRIPTION";
    case "subMysteryGift":
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

function relayOrigin(raw: SlRaw, eventType: SlEventType): string | null {
  const tagged = (raw.for ?? "").toString().trim();
  if (tagged) return tagged;
  const type = (raw.type ?? "").toString().toLowerCase();
  if (type === "superchat" || type === "membership") return "youtube";
  if (eventType === "LIKE") return "tiktok";
  return null;
}

/**
 * Direct Streamlabs Socket API bridge.
 *
 * Streamlabs uses socket.io v2 (engine.io v3) framing: `0` open, `2` ping,
 * `3` pong, `42["event", payload]` for events. We speak that framing over a
 * raw WebSocket so no extra dependency is required, then forward every parsed
 * event to the server so rules, timer, goals and the activity feed all update.
 */
export function useStreamlabsSocket(token: string | null) {
  const [status, setStatus] = useState<StreamlabsSocketStatus>("idle");
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) {
      setStatus("idle");
      return;
    }

    let socket: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let closed = false;

    const forward = async (raw: SlRaw) => {
      const type = (raw.type ?? "").toString();
      const eventType = mapType(type);
      if (!eventType) return;
      const list = Array.isArray(raw.message)
        ? raw.message
        : raw.message
          ? [raw.message]
          : [];
      for (const [index, msg] of list.entries()) {
        const providerEventId =
          str(msg["_id"]) ??
          str(msg["id"]) ??
          (raw.event_id ? `${raw.event_id}:${index}` : `${type}:${Date.now()}:${index}`);
        if (seen.current.has(providerEventId)) continue;
        seen.current.add(providerEventId);
        if (seen.current.size > 500) seen.current = new Set([providerEventId]);

        const amount = eventType === "DONATION" ? num(msg["amount"]) : null;
        const bits = eventType === "BITS" ? num(msg["amount"]) : null;
        try {
          await ingestStreamlabsSocketEvent({
            data: {
              eventType,
              providerEventId,
              actorName:
                str(msg["from"]) ?? str(msg["name"]) ?? str(msg["display_name"]) ?? "Anonymous",
              amount: amount ?? bits,
              currency: str(msg["currency"]) ?? null,
              quantity:
                eventType === "SUBSCRIPTION" || eventType === "GIFT_SUB"
                  ? Math.max(num(msg["months"]) ?? 1, 1)
                  : 1,
              message: str(msg["message"]) ?? str(msg["comment"]) ?? null,
              origin: relayOrigin(raw, eventType),
            },
          });
        } catch {
          // A single failed event must never tear down the live socket.
        }
      }
    };

    const connect = () => {
      if (closed) return;
      setStatus("connecting");
      socket = new WebSocket(`${SOCKET_URL}${encodeURIComponent(token)}`);

      socket.onopen = () => {
        attempts = 0;
        setStatus("live");
        ping = setInterval(() => socket?.readyState === 1 && socket.send("2"), 20000);
      };

      socket.onmessage = (event) => {
        const frame = typeof event.data === "string" ? event.data : "";
        if (frame === "2") {
          socket?.send("3");
          return;
        }
        if (!frame.startsWith("42")) return;
        try {
          const parsed = JSON.parse(frame.slice(2)) as [string, SlRaw];
          if (parsed[0] === "event" && parsed[1]) void forward(parsed[1]);
        } catch {
          // Ignore malformed frames.
        }
      };

      socket.onerror = () => setStatus("error");

      socket.onclose = () => {
        if (ping) clearInterval(ping);
        if (closed) return;
        setStatus("error");
        attempts += 1;
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempts, 30000));
      };
    };

    connect();

    return () => {
      closed = true;
      if (ping) clearInterval(ping);
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [token]);

  return status;
}
