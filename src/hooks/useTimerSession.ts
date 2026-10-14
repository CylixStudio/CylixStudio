import { useCallback, useEffect, useRef, useState } from "react";

import {
  SubathonTimerSession,
  type ClockReading,
  type NtpSample,
  type TimerFrame,
  type TimerSource,
  type TimerStatus,
} from "@/lib/timer";

function readClock(): ClockReading {
  return { wallMs: Date.now(), perfMs: performance.now() };
}

/** One live snapshot, timed on the client. SSE pushes are not samples. */
async function takeNtpSample(publicToken: string): Promise<NtpSample | null> {
  const t0 = Date.now();
  try {
    const response = await fetch(`/api/public/overlay/${publicToken}/live`, { cache: "no-store" });
    const t1 = Date.now();
    if (!response.ok) return null;
    const body = (await response.json()) as { frame?: { serverTime?: number } | null };
    const serverTime = body.frame?.serverTime;
    if (typeof serverTime !== "number" || !Number.isFinite(serverTime)) return null;
    return { t0, t1, serverTime };
  } catch {
    return null;
  }
}

/**
 * Display loop for one view. The session reads the shared end timestamp;
 * the interval only republishes the projected second.
 */
export function useTimerSession(ticking: boolean, publicToken: string | null = null) {
  const sessionRef = useRef<SubathonTimerSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new SubathonTimerSession();
  const [remaining, setRemaining] = useState(0);
  const [status, setStatus] = useState<TimerStatus>("IDLE");
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const publish = useCallback((view: { displayedSeconds: number; status: TimerStatus }) => {
    setRemaining((current) => (current === view.displayedSeconds ? current : view.displayedSeconds));
    setStatus((current) => (current === view.status ? current : view.status));
  }, []);

  const adopt = useCallback(
    (frame: TimerFrame, source: TimerSource) => {
      const session = sessionRef.current;
      if (!session) return;
      const nowMs = session.now(readClock());
      publish(session.adoptFrame(frame, source, nowMs));
    },
    [publish],
  );

  useEffect(() => {
    if (!publicToken || !ticking) return;
    let cancelled = false;
    void (async () => {
      const first = await takeNtpSample(publicToken);
      if (cancelled || !first) return;
      const second = await takeNtpSample(publicToken);
      if (cancelled || !second) return;
      const session = sessionRef.current;
      if (!session) return;
      const offset = session.lockNtpOffset([first, second]);
      if (offset == null) return;
      setServerOffsetMs(offset);
      publish(session.project(readClock()));
    })();
    return () => {
      cancelled = true;
    };
  }, [publicToken, ticking, publish]);

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      publish(session.project(readClock()));
    }, 250);
    return () => clearInterval(id);
  }, [publish, ticking]);

  return { adopt, remaining, status, serverOffsetMs };
}
