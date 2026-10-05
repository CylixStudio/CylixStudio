import { useEffect, useRef, useState } from "react";

import { isReplyExpired, REPLY_FADE_MS, replyRemainingMs } from "@/lib/replyAlert";

type Phase = "fade" | "gone";

/**
 * Drops reply alerts from a live list 10 minutes after they appeared.
 * Non-replies are left untouched. Timers are cleared on unmount.
 */
export function useReplyAlertExpiry<T>(
  items: readonly T[],
  options: {
    enabled?: boolean;
    getId: (item: T) => string;
    isReply: (item: T) => boolean;
    appearanceMs: (item: T) => number | null;
  },
): { items: T[]; fadingIds: ReadonlySet<string> } {
  const enabled = options.enabled !== false;
  const [phase, setPhase] = useState<Record<string, Phase>>({});
  const timers = useRef(new Map<string, number[]>());
  const armed = useRef(new Set<string>());
  const firstSeen = useRef(new Map<string, number>());
  const snapshot = useRef(options);
  snapshot.current = options;

  const signature = enabled
    ? items
        .map((item) => {
          const id = options.getId(item);
          if (!options.isReply(item)) return `${id}:0`;
          return `${id}:1:${options.appearanceMs(item) ?? "x"}`;
        })
        .join("\n")
    : "";

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const handles of pending.values()) {
        for (const handle of handles) window.clearTimeout(handle);
      }
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const { items: current, getId, isReply, appearanceMs } = snapshot.current;
    const now = Date.now();
    const expired: string[] = [];

    for (const item of current) {
      if (!isReply(item)) continue;
      const id = getId(item);
      if (armed.current.has(id)) continue;
      const given = appearanceMs(item);
      let appearance: number;
      if (given != null && Number.isFinite(given) && given > 0) {
        appearance = given;
      } else {
        const cached = firstSeen.current.get(id);
        appearance = cached ?? now;
        if (!cached) firstSeen.current.set(id, now);
      }
      armed.current.add(id);
      if (isReplyExpired(appearance, now)) {
        expired.push(id);
        continue;
      }
      const remaining = Math.max(0, replyRemainingMs(appearance, now));
      const handles: number[] = [];
      const fadeTimer = window.setTimeout(() => {
        setPhase((prev) => (prev[id] === "gone" ? prev : { ...prev, [id]: "fade" }));
        const hideTimer = window.setTimeout(() => {
          setPhase((prev) => ({ ...prev, [id]: "gone" }));
        }, REPLY_FADE_MS);
        const bucket = timers.current.get(id);
        if (bucket) bucket.push(hideTimer);
      }, remaining);
      handles.push(fadeTimer);
      timers.current.set(id, handles);
    }

    if (expired.length === 0) return;
    setPhase((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of expired) {
        if (next[id] !== "gone") {
          next[id] = "gone";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enabled, signature]);

  const fadingIds = new Set<string>();
  for (const [id, value] of Object.entries(phase)) {
    if (value === "fade") fadingIds.add(id);
  }

  if (!enabled) return { items: [...items], fadingIds };

  const visible = items.filter((item) => {
    if (!options.isReply(item)) return true;
    const id = options.getId(item);
    const state = phase[id];
    if (state === "gone") return false;
    if (state === "fade") return true;
    const given = options.appearanceMs(item);
    const cached = firstSeen.current.get(id);
    const appearance = given != null && Number.isFinite(given) && given > 0 ? given : cached;
    if (appearance == null) return true;
    return !isReplyExpired(appearance);
  });

  return { items: visible, fadingIds };
}
