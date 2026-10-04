import { useEffect, useRef, useState } from "react";

import { ingestStreamlabsSocketEvent } from "@/lib/connections.functions";
import { parseStreamlabsPayload, readSocketIoFrame } from "@/lib/relayEvents";

export type StreamlabsSocketStatus = "idle" | "connecting" | "live" | "error";

const SOCKET_URL = "wss://sockets.streamlabs.com/socket.io/?transport=websocket&token=";

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

    const forward = async (raw: unknown) => {
      for (const event of parseStreamlabsPayload(raw)) {
        if (seen.current.has(event.providerEventId)) continue;
        seen.current.add(event.providerEventId);
        if (seen.current.size > 500) seen.current = new Set([event.providerEventId]);

        try {
          await ingestStreamlabsSocketEvent({
            data: {
              eventType: event.eventType,
              providerEventId: event.providerEventId,
              actorName: event.actorName,
              amount: event.amount,
              currency: event.currency,
              quantity: event.quantity,
              message: event.message,
              origin: event.origin,
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
        const parsed = readSocketIoFrame(frame);
        if (parsed && parsed !== "ping" && parsed.name === "event") void forward(parsed.payload);
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
