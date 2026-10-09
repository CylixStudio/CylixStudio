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

/**
 * A successful clip URL this fresh can be handed out again while Kick is in
 * cooldown, so a second `!clip` does not create another request.
 */
export const RECENT_CLIP_MS = 15_000;

/**
 * Cooldown after a 429, across later `!clip` commands. It grows and then
 * stops. This is not a same-URL retry loop.
 */
export const CLIP_COOLDOWN_STEPS_MS = [5_000, 10_000, 15_000] as const;

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
 * How long to keep Kick clip creates closed after a 429.
 * `strike` is how many 429s this channel has hit in a row (1, 2, 3…).
 * Steps are 5s, 10s, then 15s. A longer `Retry-After` is honored up to 15s.
 */
export function cooldownAfterRateLimitMs(
  strike: number,
  retryAfter?: string | null,
  now = Date.now(),
): number {
  const cap = CLIP_COOLDOWN_STEPS_MS[CLIP_COOLDOWN_STEPS_MS.length - 1]!;
  const index = Math.min(CLIP_COOLDOWN_STEPS_MS.length - 1, Math.max(0, strike - 1));
  const stepped = CLIP_COOLDOWN_STEPS_MS[index]!;
  const header = retryAfterDelayMs(retryAfter, now);
  if (header == null) return stepped;
  return Math.min(cap, Math.max(stepped, header));
}

/**
 * During a 429 cooldown the next `!clip` must not call Kick.
 * A clip URL from the last few seconds is reused. Otherwise the bot replies
 * locally and does not POST.
 */
export function clipDuringCooldown(
  now: number,
  cooldownUntil: number,
  lastSuccessAt: number | null,
): "kick" | "reuse" | "local" {
  if (now >= cooldownUntil) return "kick";
  if (lastSuccessAt != null && now - lastSuccessAt <= RECENT_CLIP_MS) return "reuse";
  return "local";
}

/**
 * 404/405 skip to the next Kick path and are not retried.
 * 429 closes Kick clip creates for this command and arms a cooldown.
 * Other non-success statuses go to HLS without repeating the call.
 */
const ARABIC_LETTER = /[\u0600-\u06FF]/;

/** Viewer text after Kick and HLS both fail. No status codes, and not an offline claim. */
export function clipFailureNotice(username: string, error: string, responseTemplate: string): string {
  const mention = `@${username.replace(/^@+/, "")}`;
  if (error === "stream_offline") return `${mention} Stream is offline, no clip could be captured.`;
  const line = ARABIC_LETTER.test(responseTemplate)
    ? "تعذّر إنشاء الكليب الآن، حاول مرة أخرى بعد لحظات."
    : "The clip could not be created right now, try again in a moment.";
  return `${mention} ${line}`;
}

export function clipHttpNext(status: number): "ok" | "next" | "rate_limit" | "hls" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403 || status === 404 || status === 405) return "next";
  return "hls";
}
