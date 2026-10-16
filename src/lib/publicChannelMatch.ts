const AVATAR_KEYS = ["avatar_url", "profile_picture", "profile_pic", "image", "avatar", "thumbnail"] as const;
const COMMANDS_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;

type MatchRow = {
  user_id?: string;
  platform: string;
  username: string | null;
  metadata?: unknown;
};

export type MatchedPublicChannel = {
  userId: string;
  slug: string;
  displayName: string;
  avatarUrl: string;
};

function avatarFrom(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const record = metadata as Record<string, unknown>;
  for (const key of AVATAR_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Skip the second channel read only when the Kick row already decides the page.
 * Kick outranks every other platform, so another connection or the bio profile
 * cannot change the name or the picture. Any other shape returns null and the
 * caller keeps the full read.
 */
export function channelFromUsernameMatches(key: string, matches: MatchRow[]): MatchedPublicChannel | null {
  const kick = matches.find((row) => row.platform === "KICK" && row.user_id && row.username?.trim());
  if (!kick?.user_id || !kick.username) return null;
  const username = kick.username.trim();
  if (username.toLowerCase() !== key) return null;
  const avatarUrl = avatarFrom(kick.metadata);
  if (!avatarUrl) return null;
  const slug = COMMANDS_KEY.test(key) ? key : username.toLowerCase();
  return { userId: kick.user_id, slug, displayName: username, avatarUrl };
}
