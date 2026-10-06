export const BOTRIX_PLATFORMS = ["kick", "twitch", "youtube"] as const;

export type BotRixPlatform = (typeof BOTRIX_PLATFORMS)[number];

const STREAMER_NAME = /^[A-Za-z0-9_-]{2,40}$/;

/** Kick / Twitch / YouTube labels, stored as lowercase API values. */
export function normalizeBotRixPlatform(value: string): BotRixPlatform | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "kick" || normalized === "twitch" || normalized === "youtube") return normalized;
  return null;
}

/** One channel token: trim, drop a single leading @, then letters, numbers, _ and -. */
export function normalizeBotRixStreamerName(value: string): string | null {
  const trimmed = value.trim().replace(/^@/, "");
  if (!STREAMER_NAME.test(trimmed)) return null;
  return trimmed;
}

export type BotRixSectionError = "unavailable" | "timeout";

export type BotRixSection<T> = { ok: true; items: T[] } | { ok: false; error: BotRixSectionError };

export type BotRixCommand = {
  cmd: string;
  message: string;
  mods: boolean;
};

export type BotRixShopItem = {
  name: string;
  description: string;
  price: number | null;
  image: string | null;
};

export type BotRixLeaderRow = {
  name: string;
  level: number | null;
  points: number | null;
  xp: number | null;
  watchtime: number | null;
};

export type BotRixLookupResult =
  | {
      ok: true;
      streamerName: string;
      platform: BotRixPlatform;
      commands: BotRixSection<BotRixCommand>;
      shop: BotRixSection<BotRixShopItem>;
      leaderboard: BotRixSection<BotRixLeaderRow>;
    }
  | { ok: false; error: "invalid_name" | "invalid_platform" | "unavailable" };
