export type KickLivestreamShape = {
  is_live?: boolean;
  viewer_count?: number;
};

/**
 * A missing livestream object is unknown, not offline.
 * `is_live === true` or `viewer_count > 0` is live.
 */
export function liveStateFromLivestream(
  livestream: KickLivestreamShape | null | undefined,
): boolean | null {
  if (!livestream || typeof livestream !== "object") return null;
  const viewers = livestream.viewer_count;
  if (livestream.is_live === true || (typeof viewers === "number" && viewers > 0)) return true;
  if (livestream.is_live === false) return false;
  return null;
}

/**
 * Never map a confirmed-live channel to the offline chat reply.
 * A null livestream only becomes "offline" after the clip call itself says so.
 */
export function clipErrorAfterAttempt(liveState: boolean | null, clipError: string): string {
  if (liveState === true) return clipError === "stream_offline" ? "capture_failed" : clipError;
  if (clipError === "stream_offline") return "stream_offline";
  return clipError;
}

/** The clip call always runs. A null or false local flag is not a reason to skip it. */
export function shouldAttemptClip(liveState: boolean | null): boolean {
  void liveState;
  return true;
}

const RATE_LIMIT_DEFAULT_MS = 2_000;
const RATE_LIMIT_CAP_MS = 8_000;

/**
 * One wait after HTTP 429. Uses Kick's `Retry-After` when it is delay-seconds
 * or an HTTP date, otherwise 2 seconds. Never waits longer than 8 seconds.
 */
export function rateLimitBackoffMs(retryAfter: string | null | undefined, now = Date.now()): number {
  const raw = retryAfter?.trim();
  if (!raw) return RATE_LIMIT_DEFAULT_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(RATE_LIMIT_CAP_MS, Math.round(seconds * 1000));
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.min(RATE_LIMIT_CAP_MS, Math.max(0, when - now));
  return RATE_LIMIT_DEFAULT_MS;
}

/**
 * After a single clip POST: 401/403/404/405 may try the next Kick call once.
 * 429 waits once, then HLS, and must not POST that URL again.
 * Any other non-success status also goes to HLS instead of repeating the call.
 */
export function clipHttpNext(status: number): "ok" | "next" | "wait-hls" | "hls" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "wait-hls";
  if (status === 401 || status === 403 || status === 404 || status === 405) return "next";
  return "hls";
}
