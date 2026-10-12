export type PlatformId = "KICK" | "TWITCH" | "YOUTUBE" | "TIKTOK";

export type PlatformFilter = "ALL" | PlatformId;

export const PLATFORM_META: Record<
  PlatformId,
  { color: string; label: { en: string; ar: string } }
> = {
  KICK: { color: "#53FC18", label: { en: "Kick", ar: "كيك" } },
  TWITCH: { color: "#9146FF", label: { en: "Twitch", ar: "تويتش" } },
  YOUTUBE: { color: "#FF0000", label: { en: "YouTube", ar: "يوتيوب" } },
  TIKTOK: { color: "#25F4EE", label: { en: "TikTok", ar: "تيك توك" } },
};

/** Hub-only platform mark: a small color dot (TikTok is black / cyan on one circle). */
export function platformDotBackground(id: PlatformId): string {
  if (id === "TIKTOK") {
    return "linear-gradient(90deg, #000 50%, #25F4EE 50%)";
  }
  return PLATFORM_META[id].color;
}

/** Real catalog platforms — used for “all sources” widgets and the All chip. */
export const ALL_PLATFORMS: PlatformId[] = ["KICK", "TWITCH", "YOUTUBE", "TIKTOK"];

export const FILTER_ORDER: PlatformFilter[] = ["ALL", "KICK", "TWITCH", "YOUTUBE", "TIKTOK"];

/** Streamer-hub popularity: Kick → Twitch → YouTube → TikTok */
export const PLATFORM_USAGE_ORDER: PlatformId[] = ["KICK", "TWITCH", "YOUTUBE", "TIKTOK"];

export function sortHubPlatforms(platforms: readonly PlatformId[]): PlatformId[] {
  return [...platforms].sort(
    (a, b) => PLATFORM_USAGE_ORDER.indexOf(a) - PLATFORM_USAGE_ORDER.indexOf(b),
  );
}

const TIKTOK_HUB_PATTERN = /tiktok|تيك\s*توك/i;

/** Hub grids only: hide a card that is itself a TikTok tool. Mixed-platform tools stay. */
export function isTikTokHubCard(fields: {
  id?: string | null;
  type?: string | null;
  title?: string | null;
  name?: string | null;
  category?: string | null;
  platforms?: readonly string[] | null;
}): boolean {
  const texts = [fields.id, fields.type, fields.title, fields.name, fields.category];
  if (texts.some((value) => typeof value === "string" && TIKTOK_HUB_PATTERN.test(value))) {
    return true;
  }
  const platforms = fields.platforms ?? [];
  return platforms.length > 0 && platforms.every((platform) => TIKTOK_HUB_PATTERN.test(platform));
}

export function platformAccent(platforms: PlatformId[]): string {
  const first = platforms[0];
  return first ? PLATFORM_META[first].color : PLATFORM_META.KICK.color;
}
