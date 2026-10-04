import { useEffect, useRef, useState } from "react";

import { ingestStreamElementsEvent } from "@/lib/connections.functions";

type SeEventType = "DONATION" | "SUBSCRIPTION" | "GIFT_SUB" | "BITS" | "FOLLOW" | "RAID" | "LIKE";

export type StreamElementsSocketStatus = "idle" | "connecting" | "live" | "error";

const SOCKET_URL = "wss://realtime.streamelements.com/socket.io/?transport=websocket&EIO=3";

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Maps a StreamElements activity `type` onto our internal event enum. */
function mapType(type: string): SeEventType | null {
  switch (type) {
    case "tip":
    case "donation":
    case "merch":
    case "superchat":
    case "superchatmessage":
      return "DONATION";
    case "subscriber":
    case "resub":
    case "membership":
    case "sponsor":
      return "SUBSCRIPTION";
    case "communityGiftPurchase":
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

function relayOrigin(raw: SeRaw, eventType: SeEventType): string | null {
  const provider = (raw.provider ?? "").toString().trim();
  if (provider) return provider;
  const type = (raw.type ?? "").toString().toLowerCase();
  if (type.includes("superchat") || type === "membership" || type === "sponsor") return "youtube";
  if (eventType === "LIKE" || type === "gift") return "tiktok";
  return null;
}

type SeRaw = {
  _id?: string;
  type?: string;
  provider?: string;
  data?: Record<string, unknown>;
};

/**
 * Direct StreamElements realtime bridge.
 *
 * StreamElements uses socket.io v2 (engine.io v3) framing. After the `0` open
 * frame we emit `authenticate` with `{ method: 'jwt', token }`, then forward
 * every `event` / `event:test` payload to the server so rules, timer, goals and
 * the activity feed all update.
 */
export function useStreamElementsSocket(token: string | null) {
  const [status, setStatus] = useState<StreamElementsSocketStatus>("idle");
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

    const forward = async (raw: SeRaw) => {
      const eventType = mapType((raw.type ?? "").toString());
      if (!eventType) return;
      const payload = raw.data ?? {};
      const providerEventId =
        str(raw._id) ?? `${raw.type}:${str(payload["username"]) ?? ""}:${Date.now()}`;
      if (seen.current.has(providerEventId)) return;
      seen.current.add(providerEventId);
      if (seen.current.size > 500) seen.current = new Set([providerEventId]);

      try {
        await ingestStreamElementsEvent({
          data: {
            eventType,
            providerEventId,
            actorName:
              str(payload["displayName"]) ?? str(payload["username"]) ?? "Anonymous",
            amount: num(payload["amount"]),
            currency: str(payload["currency"]) ?? null,
            quantity:
              eventType === "SUBSCRIPTION" || eventType === "GIFT_SUB"
                ? Math.max(num(payload["quantity"]) ?? num(payload["months"]) ?? 1, 1)
                : Math.max(num(payload["quantity"]) ?? 1, 1),
            message: str(payload["message"]) ?? null,
            origin: relayOrigin(raw, eventType),
          },
        });
      } catch {
        // A single failed event must never tear down the live socket.
      }
    };

    const connect = () => {
      if (closed) return;
      setStatus("connecting");
      socket = new WebSocket(SOCKET_URL);

      socket.onopen = () => {
        attempts = 0;
        socket?.send(`42${JSON.stringify(["authenticate", { method: "jwt", token }])}`);
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
          const parsed = JSON.parse(frame.slice(2)) as [string, SeRaw];
          const [name, payload] = parsed;
          if (name === "authenticated") {
            setStatus("live");
            return;
          }
          if ((name === "event" || name === "event:test") && payload) void forward(payload);
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
