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
