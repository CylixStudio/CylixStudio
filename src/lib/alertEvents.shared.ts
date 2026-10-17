export type AlertEventPlatform = "KICK" | "TWITCH";

export type PlatformEventTypeEntry = {
  type: string;
  label: string;
  alertId: import("./alertStudio").AlertKind;
};

/** Per-(platform, event) capability map. Mirrors ALERT_CATALOG support notes. */
export const PLATFORM_EVENT_TYPES: Record<AlertEventPlatform, PlatformEventTypeEntry[]> = {
  KICK: [
    { type: "channel.followed", label: "New Follow", alertId: "follow" },
    { type: "channel.subscription.new", label: "New Subscription", alertId: "subscription" },
    { type: "channel.subscription.renewal", label: "Resubscription", alertId: "resubscription" },
    { type: "channel.subscription.gifts", label: "Gifted Subs", alertId: "gift" },
    { type: "kicks.gifted", label: "KICKs", alertId: "kicks" },
    { type: "channel.raid", label: "Raid", alertId: "raid" },
  ],
  TWITCH: [
    { type: "channel.follow", label: "New Follow", alertId: "follow" },
    { type: "channel.subscribe", label: "New Subscription", alertId: "subscription" },
    { type: "channel.subscription.message", label: "Resubscription", alertId: "resubscription" },
    { type: "channel.subscription.gift", label: "Gifted Subs", alertId: "gift" },
    { type: "channel.cheer", label: "Cheer / Bits", alertId: "cheer" },
    { type: "channel.raid", label: "Raid", alertId: "raid" },
  ],
} as const;
