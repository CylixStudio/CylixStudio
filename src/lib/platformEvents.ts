/**
 * Events each platform is allowed to report. The rules builder, the activity
 * feed, and webhook ingest all read this list so a trigger that cannot be
 * ingested is never offered.
 */
export const PLATFORM_EVENT_ALLOWLIST = {
  TWITCH: ["FOLLOW", "SUBSCRIPTION", "GIFT_SUB", "BITS", "RAID"],
  KICK: ["RAID", "FOLLOW", "SUBSCRIPTION", "GIFT_SUB", "BITS"],
  TIKTOK: ["FOLLOW", "DONATION", "LIKE"],
  STREAMELEMENTS: ["DONATION"],
  STREAMLABS: ["DONATION"],
  YOUTUBE: ["FOLLOW", "SUBSCRIPTION", "DONATION"],
  X: ["FOLLOW"],
  MANUAL: ["FOLLOW", "SUBSCRIPTION", "GIFT_SUB", "BITS", "DONATION", "RAID"],
} as const;

export type StreamPlatform = keyof typeof PLATFORM_EVENT_ALLOWLIST;
export type StreamEventType = (typeof PLATFORM_EVENT_ALLOWLIST)[StreamPlatform][number];

export function eventsForPlatform(platform: string): StreamEventType[] {
  const list = PLATFORM_EVENT_ALLOWLIST[platform as StreamPlatform];
  return list ? [...list] : [];
}

export function isAllowedPlatformEvent(platform: string, eventType: string): boolean {
  return eventsForPlatform(platform).includes(eventType as StreamEventType);
}

/**
 * How many rule units one event is worth.
 * Money-like events use the amount only. A raid is one raid, not one unit per
 * viewer, so a raid rule cannot multiply the timer by the viewer count.
 */
export function timerUnits(event: {
  eventType: string;
  amount: number | null;
  quantity: number;
}): number {
  if (event.eventType === "RAID") return 1;
  if (event.eventType === "DONATION" || event.eventType === "BITS") {
    const amount = Number(event.amount ?? 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  const count = Math.round(Number(event.quantity) || 1);
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(count, 500);
}

/** Dropdown / feed phrase id. Callers map this onto i18n keys. */
export function triggerPhrase(platform: string, eventType: string): string {
  if (platform === "KICK" && eventType === "BITS") return "KICKS";
  if (platform === "YOUTUBE" && eventType === "FOLLOW") return "SUBSCRIBE";
  if (platform === "YOUTUBE" && eventType === "SUBSCRIPTION") return "MEMBERSHIP";
  if (platform === "YOUTUBE" && eventType === "DONATION") return "SUPER_CHAT";
  if (platform === "TIKTOK" && eventType === "DONATION") return "GIFT";
  return eventType;
}

/**
 * Streamlabs and StreamElements also forward Twitch/Kick/YouTube/TikTok
 * activity. Native Twitch and Kick events stay on those webhooks. YouTube and
 * TikTok have no first-party webhook here, so their relayed events are
 * reattributed. Anything else the relay does not own is dropped.
 */
export function resolveRelaySource(args: {
  relay: "STREAMLABS" | "STREAMELEMENTS";
  origin: string | null;
  eventType: string;
}): { platform: StreamPlatform; eventType: StreamEventType } | null {
  const origin = (args.origin ?? "").toLowerCase();
  const youtube = origin.includes("youtube");
  const tiktok = origin.includes("tiktok");
  const nativeOwned = origin.includes("twitch") || origin.includes("kick");

  if (youtube) {
    if (args.eventType === "DONATION" || args.eventType === "FOLLOW" || args.eventType === "SUBSCRIPTION") {
      return { platform: "YOUTUBE", eventType: args.eventType };
    }
    return null;
  }

  if (tiktok) {
    if (args.eventType === "FOLLOW" || args.eventType === "LIKE") {
      return { platform: "TIKTOK", eventType: args.eventType };
    }
    if (args.eventType === "DONATION" || args.eventType === "GIFT_SUB" || args.eventType === "BITS") {
      return { platform: "TIKTOK", eventType: "DONATION" };
    }
    return null;
  }

  if (nativeOwned) {
    return args.eventType === "DONATION" ? { platform: args.relay, eventType: "DONATION" } : null;
  }

  if (args.eventType === "DONATION" && isAllowedPlatformEvent(args.relay, "DONATION")) {
    return { platform: args.relay, eventType: "DONATION" };
  }
  return null;
}
