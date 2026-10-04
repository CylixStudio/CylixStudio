import { useEffect, useRef } from "react";

/** Platforms the user can set as the dashboard default. */
export const STUDIO_PLATFORMS = ["KICK", "TWITCH", "YOUTUBE", "TIKTOK"] as const;

export type StudioPlatform = (typeof STUDIO_PLATFORMS)[number];

export function parseStudioPlatform(value: unknown): StudioPlatform | null {
  return typeof value === "string" && (STUDIO_PLATFORMS as readonly string[]).includes(value)
    ? (value as StudioPlatform)
    : null;
}

/** Second side of a comparison when the user has not picked one yet. */
export function alternatePlatform(platform: StudioPlatform): StudioPlatform {
  if (platform === "KICK") return "TWITCH";
  if (platform === "TWITCH") return "KICK";
  if (platform === "YOUTUBE") return "KICK";
  return "KICK";
}

/**
 * Apply a saved primary platform once, when it first loads.
 * Later local changes are left alone.
 */
export function useApplyDefaultPlatform(
  saved: string | null | undefined,
  apply: (platform: StudioPlatform) => void,
) {
  const done = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (done.current) return;
    const platform = parseStudioPlatform(saved);
    if (!platform) return;
    done.current = true;
    applyRef.current(platform);
  }, [saved]);
}
