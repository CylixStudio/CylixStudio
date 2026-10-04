import type { TestEventInput } from "@/lib/simulate.functions";
import type { TranslationKey } from "@/lib/i18n";

export type TestEventSpec = {
  type: TestEventInput["eventType"];
  labelKey: TranslationKey;
  amount?: number;
  quantity?: number;
  message?: string | null;
};

export type TestEventGroup = {
  platform: TestEventInput["platform"];
  /** Matches Activity Feed filter section titles. */
  headingKey:
    | "activity.filter.twitch"
    | "activity.filter.kick"
    | "activity.filter.tiktok"
    | "activity.filter.youtube"
    | "activity.filter.x"
    | "activity.filter.streamlabs"
    | "activity.filter.streamelements"
    | "activity.test.group.other";
  tabKey: TranslationKey;
  icon: string;
  color: string;
  events: TestEventSpec[];
};

/**
 * One synthetic payload per source the ingest allowlist already accepts.
 * Amounts match EventTestPanel / overlay simulators (Twitch 100 bits,
 * YouTube Super Chat $5, TikTok gift $2, Streamlabs $10, StreamElements $5).
 */
export const TEST_EVENT_GROUPS: TestEventGroup[] = [
  {
    platform: "KICK",
    headingKey: "activity.filter.kick",
    tabKey: "settings.test.tab.kick",
    icon: "kick",
    color: "#53FC18",
    events: [
      { type: "FOLLOW", labelKey: "settings.test.event.follow" },
      { type: "SUBSCRIPTION", labelKey: "settings.test.event.sub" },
      { type: "GIFT_SUB", labelKey: "settings.test.event.giftSub" },
      { type: "BITS", labelKey: "settings.test.event.kicks", amount: 100 },
      { type: "RAID", labelKey: "settings.test.event.raid" },
    ],
  },
  {
    platform: "TWITCH",
    headingKey: "activity.filter.twitch",
    tabKey: "settings.test.tab.twitch",
    icon: "twitch",
    color: "#9F77F7",
    events: [
      { type: "FOLLOW", labelKey: "settings.test.event.follow" },
      { type: "SUBSCRIPTION", labelKey: "settings.test.event.sub" },
      { type: "GIFT_SUB", labelKey: "settings.test.event.giftSub" },
      { type: "BITS", labelKey: "settings.test.event.bits100", amount: 100, message: "Let's go!" },
      { type: "RAID", labelKey: "settings.test.event.raid" },
    ],
  },
  {
    platform: "YOUTUBE",
    headingKey: "activity.filter.youtube",
    tabKey: "settings.test.tab.youtube",
    icon: "youtube",
    color: "#FF4444",
    events: [
      { type: "FOLLOW", labelKey: "settings.test.event.subscribe" },
      { type: "SUBSCRIPTION", labelKey: "settings.test.event.membership" },
      {
        type: "DONATION",
        labelKey: "settings.test.event.superChat5",
        amount: 5,
        message: "Keep it up!",
      },
    ],
  },
  {
    platform: "TIKTOK",
    headingKey: "activity.filter.tiktok",
    tabKey: "settings.test.tab.tiktok",
    icon: "tiktok",
    color: "#2DCCD3",
    events: [
      { type: "FOLLOW", labelKey: "settings.test.event.follow" },
      { type: "DONATION", labelKey: "settings.test.event.gift2", amount: 2, message: "Keep it up!" },
      { type: "LIKE", labelKey: "settings.test.event.likes", quantity: 50 },
    ],
  },
  {
    platform: "X",
    headingKey: "activity.filter.x",
    tabKey: "settings.test.tab.x",
    icon: "x",
    color: "#E7E9EA",
    events: [{ type: "FOLLOW", labelKey: "settings.test.event.follower" }],
  },
  {
    platform: "STREAMLABS",
    headingKey: "activity.filter.streamlabs",
    tabKey: "settings.test.tab.streamlabs",
    icon: "streamlabs",
    color: "#80F5D2",
    events: [
      {
        type: "DONATION",
        labelKey: "settings.test.event.donation10",
        amount: 10,
        message: "Keep it up!",
      },
    ],
  },
  {
    platform: "STREAMELEMENTS",
    headingKey: "activity.filter.streamelements",
    tabKey: "settings.test.tab.streamelements",
    icon: "streamelements",
    color: "#4FC3F7",
    events: [
      { type: "DONATION", labelKey: "settings.test.event.tip5", amount: 5, message: "Keep it up!" },
    ],
  },
  {
    platform: "MANUAL",
    headingKey: "activity.test.group.other",
    tabKey: "settings.test.tab.other",
    icon: "custom",
    color: "#A1A1AA",
    events: [
      { type: "FOLLOW", labelKey: "settings.test.event.customFollow" },
      { type: "SUBSCRIPTION", labelKey: "settings.test.event.customSub" },
      { type: "GIFT_SUB", labelKey: "settings.test.event.customGiftSub" },
      { type: "BITS", labelKey: "settings.test.event.customBits", amount: 100, message: "Let's go!" },
      {
        type: "DONATION",
        labelKey: "settings.test.event.customDonation5",
        amount: 5,
        message: "Keep it up!",
      },
      { type: "RAID", labelKey: "settings.test.event.customRaid" },
    ],
  },
];
