export type KickLivestreamShape = {
  is_live?: boolean;
  viewer_count?: number;
};

/**
 * A missing livestream object, or a livestream list, is unknown — not offline.
 * Live means `is_live === true` or `viewer_count > 0`.
 */
export function liveStateFromLivestream(
  livestream: KickLivestreamShape | readonly unknown[] | null | undefined,
): boolean | null {
  if (livestream == null || typeof livestream !== "object" || Array.isArray(livestream)) return null;
  const stream = livestream as KickLivestreamShape;
  const viewers = stream.viewer_count;
  if (stream.is_live === true || (typeof viewers === "number" && viewers > 0)) return true;
  if (stream.is_live === false) return false;
  return null;
}

/**
 * The offline chat sentence is only for a fresh read that says not live
 * together with a clip attempt that also says the stream is offline.
 * A missing livestream, a live channel, or any other API error stays a
 * generic capture failure.
 */
export function clipErrorAfterAttempt(liveState: boolean | null, clipError: string): string {
  if (liveState === false && clipError === "stream_offline") return "stream_offline";
  if (clipError === "stream_offline") return "capture_failed";
  return clipError;
}

/** The clip call always runs. A null or false local flag is not a reason to skip it. */
export function shouldAttemptClip(liveState: boolean | null): boolean {
  void liveState;
  return true;
}

export type TimedSegment = { duration: number };

/**
 * Segments already listed on one playlist read, taken from the live edge
 * (the end of the list) until `seconds` is covered. Does not wait for more.
 */
export function liveEdgeWindow<T extends TimedSegment>(segments: readonly T[], seconds: number): T[] {
  if (segments.length === 0 || !(seconds > 0)) return [];
  const picked: T[] = [];
  let covered = 0;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]!;
    picked.push(segment);
    covered += segment.duration > 0 ? segment.duration : 2;
    if (covered >= seconds) break;
  }
  picked.reverse();
  return picked;
}

const ARABIC_LETTER = /[\u0600-\u06FF]/;

/** Viewer text after a clip create fails. No status codes, and not an offline claim unless Kick said the stream is offline. */
export function clipFailureNotice(username: string, error: string, responseTemplate: string): string {
  const mention = `@${username.replace(/^@+/, "")}`;
  if (error === "stream_offline") return `${mention} Stream is offline, no clip could be captured.`;
  const line = ARABIC_LETTER.test(responseTemplate)
    ? "تعذّر إنشاء الكليب الآن، حاول مرة أخرى بعد لحظات."
    : "The clip could not be created right now, try again in a moment.";
  return `${mention} ${line}`;
}

/** Leftover status classes. The `!clip` path does not use this to start another URL. */
export function clipHttpNext(status: number): "ok" | "next" | "rate_limit" | "hls" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403 || status === 404 || status === 405) return "next";
  return "hls";
}
