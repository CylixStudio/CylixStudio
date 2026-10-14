import { useEffect, useState } from "react";

import { useTimerSession } from "@/hooks/useTimerSession";
import type { TimerFrame } from "@/lib/timer";

export type StreamStatus = "connecting" | "live" | "error";

/**
 * Subscribes to the overlay SSE stream. The countdown is the shared end
 * timestamp minus the monotonic clock. SSE frames update that end only when
 * the persisted timer actually changes.
 * Reconnects with backoff so an OBS browser source left running overnight
 * recovers from deploys, sleeps and dropped connections on its own.
 */
export function useTimerStream(publicToken: string | null) {
  const [frame, setFrame] = useState<TimerFrame | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const countdown = useTimerSession(frame != null, publicToken);

  useEffect(() => {
    if (!publicToken) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let cancelled = false;

    const onFrame = (next: TimerFrame) => {
      attempts = 0;
      countdown.adopt(next, "realtime");
      setFrame(next);
      setStatus("live");
    };

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(`/api/public/overlay/${publicToken}/stream`);

      source.addEventListener("init", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { frame: TimerFrame | null };
        if (payload.frame) onFrame(payload.frame);
        else setStatus("live");
      });
      source.addEventListener("state", (event) => {
        onFrame(JSON.parse((event as MessageEvent).data) as TimerFrame);
      });
      source.onerror = () => {
        setStatus("error");
        source?.close();
        source = null;
        if (cancelled) return;
        attempts += 1;
        const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4));
        retry = setTimeout(() => {
          setStatus("connecting");
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [publicToken, countdown.adopt]);

  const shown =
    frame && countdown.status === "ENDED" && frame.status === "RUNNING"
      ? { ...frame, status: "ENDED" as const, remainingSeconds: 0, remainingMs: 0 }
      : frame;

  return { frame: shown, remaining: countdown.remaining, status, serverOffsetMs: countdown.serverOffsetMs };
}
