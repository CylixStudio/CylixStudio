import { useEffect, useRef, useState } from "react";

import { ingestStreamElementsEvent } from "@/lib/connections.functions";
import { parseStreamElementsPayload, readSocketIoFrame } from "@/lib/relayEvents";

export type StreamElementsSocketStatus = "idle" | "connecting" | "live" | "error";

const SOCKET_URL = "wss://realtime.streamelements.com/socket.io/?transport=websocket&EIO=3";

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

    const forward = async (raw: unknown) => {
      const event = parseStreamElementsPayload(raw);
      if (!event) return;
      if (seen.current.has(event.providerEventId)) return;
      seen.current.add(event.providerEventId);
      if (seen.current.size > 500) seen.current = new Set([event.providerEventId]);

      try {
        await ingestStreamElementsEvent({
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
        const parsed = readSocketIoFrame(frame);
        if (!parsed || parsed === "ping") return;
        if (parsed.name === "authenticated") {
          setStatus("live");
          return;
        }
        if (parsed.name === "event" || parsed.name === "event:test") void forward(parsed.payload);
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
