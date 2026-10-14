import { useMemo } from "react";

import { kickBadgeAssets } from "@/lib/kickBadgeAssets";
import {
  kickBadgeDisplayUrl,
  type KickBadgeRecord,
  type KickBadgeResolver,
  type KickSubscriberTier,
} from "@/lib/kickBadgeResolver";

export type { KickBadgeResolver };
export type KickBadge = KickBadgeRecord;

export {
  badgeAssetUrl,
  catalogFromPayload,
  createKickBadgeCatalogCache,
  kickBadgeDisplayUrl,
  parseKickBadges,
  resolveKickBadgeImage,
} from "@/lib/kickBadgeResolver";

/**
 * Resolves Kick badge images from the message and this channel's uploaded tiers.
 * No catalog request runs here. A missing image returns null and chat still renders.
 */
export function useKickBadges(
  _channelSlug: string | null,
  enabled: boolean,
  subscriberTiers: readonly KickSubscriberTier[] = [],
  useDefaultSubscriberBadge = false,
): KickBadgeResolver {
  const catalog = useMemo(
    () => ({ subscriberTiers: [...subscriberTiers], global: {} }),
    [subscriberTiers],
  );
  return useMemo(() => {
    if (!enabled) return () => null;
    return (badge: KickBadgeRecord) =>
      kickBadgeDisplayUrl(badge, catalog, { assets: kickBadgeAssets, useDefaultSubscriberBadge });
  }, [catalog, enabled, useDefaultSubscriberBadge]);
}
