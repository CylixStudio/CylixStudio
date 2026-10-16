import type { OverlayEvent } from "@/lib/widgets";

/** How often /live runs while the direct stream is down. */
export const FALLBACK_MS = 2_000;
/** Start /live if the stream has not delivered its first snapshot. */
export const SSE_BOOT_MS = 2_500;

export function reconnectDelay(attempt: number): number {
  return Math.min(15_000, 1_000 * 2 ** Math.min(Math.max(attempt, 1), 4));
}

type SseState = "closed" | "opening" | "open";

/**
 * One EventSource at a time. /live is the fallback while that socket is down,
 * and it stops as soon as the stream delivers a snapshot again.
 */
export function createOverlayLink() {
  let sse: SseState = "closed";
  let fallback = false;
  let attempt = 0;
  let retryArmed = false;

  return {
    streamOpen(): boolean {
      return sse === "open";
    },
    fallbackActive(): boolean {
      return fallback;
    },
    begin(): { opened: boolean } {
      if (sse === "opening" || sse === "open") return { opened: false };
      sse = "opening";
      return { opened: true };
    },
    opened(): { stopFallback: true } {
      sse = "open";
      fallback = false;
      attempt = 0;
      retryArmed = false;
      return { stopFallback: true };
    },
    lost(): { schedule: boolean; delay: number; startFallback: true } {
      sse = "closed";
      fallback = true;
      if (retryArmed) return { schedule: false, delay: 0, startFallback: true };
      retryArmed = true;
      attempt += 1;
      return { schedule: true, delay: reconnectDelay(attempt), startFallback: true };
    },
    retryDue(): void {
      retryArmed = false;
    },
    bootTimedOut(): boolean {
      if (sse === "open") return false;
      fallback = true;
      return true;
    },
    closed(): void {
      sse = "closed";
      fallback = false;
      retryArmed = false;
      attempt = 0;
    },
  };
}

export function eventFromBroadcast(payload: Record<string, unknown>): OverlayEvent | null {
  const id = typeof payload["eventId"] === "string" ? payload["eventId"].trim() : "";
  if (!id) return null;
  const amount = payload["amount"];
  const quantity = payload["quantity"];
  const seconds = payload["secondsAdded"];
  return {
    id,
    platform: String(payload["platform"] ?? ""),
    eventType: String(payload["eventType"] ?? ""),
    actorName: typeof payload["actorName"] === "string" ? payload["actorName"] : null,
    amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
    currency: typeof payload["currency"] === "string" ? payload["currency"] : null,
    quantity: typeof quantity === "number" && quantity > 0 ? quantity : 1,
    secondsAdded: typeof seconds === "number" && Number.isFinite(seconds) ? seconds : 0,
    createdAt: new Date().toISOString(),
    isTest: payload["isTest"] === true,
  };
}

/** Newest copy of an id wins. A later stale snapshot cannot drop a just-seen event. */
export function mergeAlert(current: OverlayEvent[], next: OverlayEvent): OverlayEvent[] {
  return [next, ...current.filter((event) => event.id !== next.id)].slice(0, 50);
}

export function mergeServerEvents(server: OverlayEvent[], local: OverlayEvent[], now = Date.now()): OverlayEvent[] {
  const ids = new Set(server.map((event) => event.id));
  const fresh = local.filter((event) => {
    if (ids.has(event.id)) return false;
    const at = new Date(event.createdAt).getTime();
    return Number.isFinite(at) && now - at < 10_000;
  });
  return [...fresh, ...server].slice(0, 50);
}

export function needsDirectRead(payload: Record<string, unknown>): boolean {
  const seconds = payload["secondsAdded"];
  const goals = payload["goals"];
  return (typeof seconds === "number" && seconds > 0) || (Array.isArray(goals) && goals.length > 0);
}
