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

/** Initial try plus retries. After the third 429, that URL is not posted again. */
export const CLIP_RATE_LIMIT_ATTEMPTS = 3;

function retryAfterDelayMs(retryAfter: string | null | undefined, now: number): number | null {
  const raw = retryAfter?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(0, when - now);
  return null;
}

/**
 * Wait before retrying the same clip URL after a 429.
 * `attempt` is how many tries have already been made (1 or 2).
 * Returns null after the third try so there is no fourth POST.
 * Default waits are 1s then 2s. `Retry-After` is used when it falls between
 * 1 and 3 seconds; longer values are capped at 3 seconds.
 */
export function rateLimitRetryWaitMs(
  attempt: number,
  retryAfter?: string | null,
  now = Date.now(),
): number | null {
  if (attempt >= CLIP_RATE_LIMIT_ATTEMPTS) return null;
  const stepped = Math.min(3_000, Math.max(1_000, attempt * 1_000));
  const header = retryAfterDelayMs(retryAfter, now);
  if (header == null) return stepped;
  return Math.min(3_000, Math.max(1_000, header));
}

/**
 * 404/405 skip to the next Kick path and are not retried.
 * 429 is retried on the same URL up to three times, then HLS.
 * Other non-success statuses go to HLS without repeating the call.
 */
const ARABIC_LETTER = /[\u0600-\u06FF]/;

/** Viewer text after Kick retries and HLS both fail. No status codes, and not an offline claim. */
export function clipFailureNotice(username: string, error: string, responseTemplate: string): string {
  const mention = `@${username.replace(/^@+/, "")}`;
  if (error === "stream_offline") return `${mention} Stream is offline, no clip could be captured.`;
  const line = ARABIC_LETTER.test(responseTemplate)
    ? "تعذّر إنشاء الكليب الآن، حاول مرة أخرى بعد لحظات."
    : "The clip could not be created right now, try again in a moment.";
  return `${mention} ${line}`;
}

export function clipHttpNext(status: number): "ok" | "next" | "retry" | "hls" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "retry";
  if (status === 401 || status === 403 || status === 404 || status === 405) return "next";
  return "hls";
}
