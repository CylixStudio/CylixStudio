/**
 * Widget contracts shared by the dashboard builder, the SSE broadcaster and
 * the public OBS renderer. Configs live in `widgets.config` (JSON), so every
 * read goes through a parser that tolerates missing/legacy keys.
 */

import { selectedEventLabelOptions, type EventLabelOption } from "@/lib/eventLabels";
import { OVERLAY_FONTS, DEFAULT_OVERLAY_THEME } from "@/lib/overlayTheme";
import {
  defaultScheduleEvents,
  normalizeScheduleEvents,
  parseStreamEventsRuntime,
  type StreamEventsRuntime,
  type StreamScheduleEvent,
} from "@/lib/streamEventsSchedule";


export type WidgetType =
  | "SUBATHON_TIMER"
  | "GOAL_BAR"
  | "CHAT_BOX"
  | "SPIN_WHEEL"
  | "EMOTE_RAIN"
  | "CHAT_SPOTLIGHT"
  | "STREAM_EVENTS_SCHEDULE"
  | "TIKTOK_TAPPERS"
  | "TIKTOK_TAP_GOAL"
  | "KICKS_GOAL"
  | "VIEWER_COUNTER"
  | "EVENT_LABELS"
  | "DONATION_GOAL"
  | "FOLLOWER_GOAL"
  | "SUBSCRIBER_GOAL"
  | "CUSTOM_GOAL";

export const WIDGET_TYPES: { value: WidgetType; label: string; hint: string }[] = [
  { value: "SUBATHON_TIMER", label: "Subathon timer", hint: "Live countdown driven by rules" },
  { value: "CHAT_BOX", label: "Activity feed", hint: "Rolling list of the latest events" },
  { value: "SPIN_WHEEL", label: "Wheel of fortune", hint: "Weighted prize wheel" },
  { value: "EMOTE_RAIN", label: "Emote rain", hint: "Emotes rain down on every incoming event" },
  {
    value: "CHAT_SPOTLIGHT",
    label: "Chat spotlight",
    hint: "Pin one chat message to a featured glass card",
  },
  {
    value: "STREAM_EVENTS_SCHEDULE",
    label: "Stream events schedule",
    hint: "Timed on-stream segments with live countdown on OBS",
  },
  {
    value: "TIKTOK_TAPPERS",
    label: "Top tappers overlay",
    hint: "Live TikTok tap leaderboard with animated ranks",
  },
  {
    value: "TIKTOK_TAP_GOAL",
    label: "TikTok tap goal overlay",
    hint: "Progress bar toward a total TikTok tap target",
  },
  { value: "KICKS_GOAL", label: "Kicks Goal", hint: "Kick currency progress bar" },
  { value: "VIEWER_COUNTER", label: "Viewer counter", hint: "Live viewer or follower count" },
  { value: "EVENT_LABELS", label: "Latest events", hint: "Selected event lines, one at a time" },
  { value: "DONATION_GOAL", label: "Donation goal", hint: "Donation progress bar" },
  { value: "FOLLOWER_GOAL", label: "Follower goal", hint: "Follower count progress bar" },
  { value: "SUBSCRIBER_GOAL", label: "Subscriber goal", hint: "Subscriber count progress bar" },
  { value: "CUSTOM_GOAL", label: "Custom goal", hint: "Progress bar with a free unit label" },
];

/** Create-menu types. Custom goal remains in the enum and is not offered. */
export const OFFERED_WIDGET_TYPES = WIDGET_TYPES.filter((entry) => entry.value !== "CUSTOM_GOAL");

export const WIDGET_LABEL: Record<WidgetType, string> = {
  SUBATHON_TIMER: "Subathon timer",
  GOAL_BAR: "Goal bar",
  CHAT_BOX: "Activity feed",
  SPIN_WHEEL: "عجلة الحظ",
  KICKS_GOAL: "هدف الكيكس",
  VIEWER_COUNTER: "عداد المشاهدين",
  EVENT_LABELS: "آخر الأحداث",
  DONATION_GOAL: "هدف التبرعات",
  FOLLOWER_GOAL: "هدف المتابعين",
  SUBSCRIBER_GOAL: "هدف المشتركين",
  CUSTOM_GOAL: "هدف مخصص",
  EMOTE_RAIN: "Emote rain",
  CHAT_SPOTLIGHT: "Chat spotlight",
  STREAM_EVENTS_SCHEDULE: "جدول فعاليات البث",
  TIKTOK_TAPPERS: "Top tappers overlay",
  TIKTOK_TAP_GOAL: "TikTok tap goal overlay",
};



export type BaseStyle = {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  accentColor: string;
};

export type GoalConfig = BaseStyle & {
  label: string;
  showPercent: boolean;
  goalType: "DONATION" | "FOLLOWER" | "SUBSCRIBER" | "CUSTOM";
};

export type AlertConfig = BaseStyle & { holdMs: number; showAmount: boolean; soundUrl: string | null };
export type ChatLayout = "transparent" | "glass" | "island" | "bubble";

export const CHAT_LAYOUTS: {
  value: ChatLayout;
  label: string;
    hint: string;
  }[] = [
  {
    value: "transparent",
    label: "👻 Pure Transparent",
    hint: "No container, text straight over video",
  },
  {
    value: "glass",
    label: "🧊 Full Glass Container",
    hint: "Continuous chat panel window",
  },
  {
    value: "island",
    label: "🏝️ Dynamic Island Messages",
    hint: "Each message a floating capsule",
  },
  {
    value: "bubble",
    label: "💬 Speech Bubbles",
    hint: "Rounded bubbles with offset corner",
  },
];

export type ChatConfig = BaseStyle & {
  maxMessages: number;
  showPlatform: boolean;
  showBadges: boolean;
  chatLayout: ChatLayout;
  /** Vertical gap between messages, in px. */
  messageGap: number;
};
export type SpinPrize = { label: string; weight: number };

export type SpinConfig = BaseStyle & { entries: string[]; prizes: SpinPrize[]; title: string };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const hex = (value: unknown, fallback: string) =>
  typeof value === "string" && HEX.test(value.trim()) ? value.trim() : fallback;

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const text = (value: unknown, fallback: string, max = 60) =>
  typeof value === "string" && value.trim().length > 0 ? value.slice(0, max) : fallback;

export const DEFAULT_STYLE: BaseStyle = {
  fontFamily: DEFAULT_OVERLAY_THEME.fontFamily,
  fontSize: 40,
  textColor: "#FFFFFF",
  backgroundColor: "#1A1B23",
  backgroundOpacity: 80,
  accentColor: "#7C3AED",
};

function parseStyle(source: Record<string, unknown>, defaults: BaseStyle): BaseStyle {
  const fontFamily =
    typeof source["fontFamily"] === "string" && source["fontFamily"].trim().length > 0
      ? source["fontFamily"]
      : (OVERLAY_FONTS.find((entry) => entry.label === source["font"])?.value ??
        defaults.fontFamily);
  return {
    fontFamily,
    fontSize: num(source["fontSize"], defaults.fontSize, 12, 200),
    textColor: hex(source["textColor"], defaults.textColor),
    backgroundColor: hex(source["backgroundColor"], defaults.backgroundColor),
    backgroundOpacity: num(source["backgroundOpacity"], defaults.backgroundOpacity, 0, 100),
    accentColor: hex(source["accent"] ?? source["accentColor"], defaults.accentColor),
  };
}

const asRecord = (raw: unknown) =>
  (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

export function parseGoalConfig(raw: unknown): GoalConfig {
  const source = asRecord(raw);
  const goalType = typeof source["goalType"] === "string" ? source["goalType"] : "DONATION";
  return {
    ...parseStyle(source, DEFAULT_STYLE),
    goalType: (["DONATION", "FOLLOWER", "SUBSCRIBER", "CUSTOM"].includes(goalType)
      ? goalType
      : "DONATION") as GoalConfig["goalType"],
    label: text(source["label"], "DONATION GOAL", 40),
    showPercent: bool(source["showPercent"], true),
  };

}

export function parseAlertConfig(raw: unknown): AlertConfig {
  const source = asRecord(raw);
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 34 }),
    holdMs: num(source["holdMs"], 6000, 1500, 30_000),
    showAmount: bool(source["showAmount"], true),
    soundUrl: text(source["soundUrl"], "", 500) || null,
  };
}

export function parseChatConfig(raw: unknown): ChatConfig {
  const source = asRecord(raw);
  const layout = source["chatLayout"];
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 22 }),
    maxMessages: num(source["maxMessages"], 8, 3, 25),
    showPlatform: bool(source["showPlatform"], true),
    showBadges: bool(source["showBadges"], true),
    chatLayout: (CHAT_LAYOUTS.some((entry) => entry.value === layout)
      ? layout
      : "glass") as ChatLayout,
    messageGap: num(source["messageGap"], 8, 4, 20),
  };
}

function prizeWeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

/** Saved prizes win. Legacy string entries become equal slices. */
export function parseSpinPrizes(raw: unknown): SpinPrize[] {
  const source = asRecord(raw);
  const rawPrizes = Array.isArray(source["prizes"]) ? source["prizes"] : [];
  const prizes = rawPrizes
    .map((item) => asRecord(item))
    .map((item) => ({
      label: typeof item["label"] === "string" ? item["label"].trim().slice(0, 40) : "",
      weight: prizeWeight(item["weight"]),
    }))
    .filter((item) => item.label.length > 0)
    .slice(0, 24);
  if (prizes.length > 0) return prizes;
  const rawEntries = Array.isArray(source["entries"]) ? source["entries"] : [];
  const entries = rawEntries
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => ({ label: entry.trim().slice(0, 40), weight: 1 }))
    .slice(0, 24);
  return entries;
}

export function pickWeightedPrize(prizes: SpinPrize[]): string | null {
  const pool = prizes.filter((prize) => prize.label.trim().length > 0 && prize.weight > 0);
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, prize) => sum + prize.weight, 0);
  let roll = Math.random() * total;
  for (const prize of pool) {
    roll -= prize.weight;
    if (roll <= 0) return prize.label;
  }
  return pool[pool.length - 1]?.label ?? null;
}

export function parseSpinConfig(raw: unknown): SpinConfig {
  const source = asRecord(raw);
  const prizes = parseSpinPrizes(raw);
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 28 }),
    title: typeof source["title"] === "string" ? source["title"].trim().slice(0, 40) : "",
    prizes,
    entries: prizes.map((prize) => prize.label),
  };
}

export type EmoteRainConfig = BaseStyle & {
  emotes: string[];
  /** Emotes spawned per incoming event. */
  burst: number;
  /** Fall duration in ms. */
  fallMs: number;
  emoteSize: number;
};

export function parseEmoteRainConfig(raw: unknown): EmoteRainConfig {
  const source = asRecord(raw);
  const rawEmotes = Array.isArray(source["emotes"]) ? source["emotes"] : [];
  const emotes = rawEmotes
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, 8))
    .slice(0, 20);
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 48, backgroundOpacity: 0 }),
    emotes: emotes.length > 0 ? emotes : ["🎉", "💜", "🔥", "😂", "⭐"],
    burst: num(source["burst"], 12, 1, 60),
    fallMs: num(source["fallMs"], 4000, 1000, 15_000),
    emoteSize: num(source["emoteSize"], 48, 16, 160),
  };
}



/* ---------------------------- Chat spotlight ---------------------------- */

export type SpotlightConfig = BaseStyle & {
  /** 0 keeps the card pinned until the creator clears it manually. */
  autoHideMs: number;
  showBadges: boolean;
  showPlatform: boolean;
};

export const SPOTLIGHT_AUTO_HIDE: { value: number; label: string }[] = [
  { value: 0, label: "Stay until cleared" },
  { value: 10_000, label: "Hide after 10s" },
  { value: 15_000, label: "Hide after 15s" },
  { value: 30_000, label: "Hide after 30s" },
];

export function parseSpotlightConfig(raw: unknown): SpotlightConfig {
  const source = asRecord(raw);
  const autoHide = Number(source["autoHideMs"]);
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 26 }),
    autoHideMs: Number.isFinite(autoHide) ? Math.min(120_000, Math.max(0, Math.round(autoHide))) : 0,
    showBadges: bool(source["showBadges"], true),
    showPlatform: bool(source["showPlatform"], true),
  };
}

export type SpotlightBadge = { label: string; imageUrl: string | null };

export type SpotlightMessage = {
  id: string;
  platform: string;
  author: string;
  color: string | null;
  text: string;
  badges: string[];
  badgeImages: SpotlightBadge[];
  pinnedAt: string;
  /** Monotonic counter so the overlay replays the entry animation. */
  nonce: number;
  isReply?: boolean;
  replyQuote?: string | null;
  /** Original message time, used when the pin itself is a reply. */
  appearedAt?: string;
};

export function parseSpotlightState(raw: unknown): SpotlightMessage | null {
  const source = asRecord(raw);
  const pinned = source["spotlight"];
  if (!pinned || typeof pinned !== "object") return null;
  const entry = pinned as Record<string, unknown>;
  if (typeof entry["text"] !== "string" || entry["text"].trim().length === 0) return null;
  const badges = Array.isArray(entry["badges"])
    ? (entry["badges"] as unknown[]).filter((b): b is string => typeof b === "string").slice(0, 12)
    : [];
  const badgeImages = Array.isArray(entry["badgeImages"])
    ? (entry["badgeImages"] as unknown[])
        .map((item) => asRecord(item))
        .map((item) => ({
          label: typeof item["label"] === "string" ? item["label"] : "badge",
          imageUrl: typeof item["imageUrl"] === "string" ? item["imageUrl"] : null,
        }))
        .slice(0, 12)
    : [];
  return {
    id: typeof entry["id"] === "string" ? entry["id"] : "pinned",
    platform: typeof entry["platform"] === "string" ? entry["platform"] : "TWITCH",
    author: typeof entry["author"] === "string" ? entry["author"] : "Viewer",
    color: typeof entry["color"] === "string" ? entry["color"] : null,
    text: entry["text"].slice(0, 400),
    badges,
    badgeImages,
    pinnedAt: typeof entry["pinnedAt"] === "string" ? entry["pinnedAt"] : new Date().toISOString(),
    nonce: typeof entry["nonce"] === "number" ? entry["nonce"] : 0,
    isReply: entry["isReply"] === true,
    replyQuote: typeof entry["replyQuote"] === "string" ? entry["replyQuote"].slice(0, 160) : null,
    appearedAt: typeof entry["appearedAt"] === "string" ? entry["appearedAt"] : undefined,
  };
}

/* ----------------------- Stream events schedule ----------------------- */

export type StreamEventsScheduleConfig = BaseStyle & {
  events: StreamScheduleEvent[];
  showUptime: boolean;
  title: string;
};

export function parseStreamEventsScheduleConfig(raw: unknown): StreamEventsScheduleConfig {
  const source = asRecord(raw);
  const title =
    typeof source["title"] === "string" && source["title"].trim()
      ? source["title"].trim().slice(0, 60)
      : "جدول فعاليات البث";
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 22, accentColor: "#bee1fc" }),
    events: normalizeScheduleEvents(source["events"]),
    showUptime: bool(source["showUptime"], true),
    title,
  };
}

export function parseStreamEventsScheduleState(raw: unknown): StreamEventsRuntime {
  return parseStreamEventsRuntime(raw);
}

export { defaultScheduleEvents };

export type OverlayEvent = {
  id: string;
  platform: string;
  eventType: string;
  actorName: string | null;
  amount: number | null;
  currency: string | null;
  quantity: number;
  secondsAdded: number;
  createdAt: string;
  /** Set when the stored payload is a reply to an earlier message or alert. */
  isReply?: boolean;
  replyQuote?: string | null;
  /** When the reply appeared. Falls back to createdAt for the 10-minute clock. */
  appearedAt?: string;
  /** Preview alert. Visible on the overlay, ignored by timer and goal counters. */
  isTest?: boolean;
};

const DYNAMIC_GOAL_TYPES = ["DONATION_GOAL", "FOLLOWER_GOAL", "SUBSCRIBER_GOAL", "KICKS_GOAL"] as const;

export function isDynamicGoalWidget(type: string): boolean {
  return (DYNAMIC_GOAL_TYPES as readonly string[]).includes(type);
}

/** How much one stored event adds. Test alerts add nothing. Each event id counts once. */
export function dynamicGoalDelta(type: string, event: OverlayEvent): number {
  if (event.isTest || event.eventType === "test" || !isDynamicGoalWidget(type)) return 0;
  const kind = event.eventType;
  const platform = event.platform.toUpperCase();
  if (type === "DONATION_GOAL") {
    if (kind !== "DONATION") return 0;
    const amount = Number(event.amount ?? 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  if (type === "FOLLOWER_GOAL") return kind === "FOLLOW" ? 1 : 0;
  if (type === "SUBSCRIBER_GOAL") {
    if (kind === "GIFT_SUB") return Math.max(1, Math.round(Number(event.quantity) || 1));
    if (kind === "SUBSCRIPTION") return 1;
    return 0;
  }
  if (kind !== "BITS" || platform !== "KICK") return 0;
  const kicks = Number(event.amount ?? 0);
  return Number.isFinite(kicks) && kicks > 0 ? kicks : 0;
}

/** Saved baseline plus each non-test event once. Do not add a goal-row total on top of this. */
export function dynamicGoalAdded(type: string, events: readonly OverlayEvent[]): number {
  if (!isDynamicGoalWidget(type)) return 0;
  const seen = new Set<string>();
  let total = 0;
  for (const event of events) {
    if (!event.id || seen.has(event.id)) continue;
    seen.add(event.id);
    total += dynamicGoalDelta(type, event);
  }
  return total;
}

export type GoalSnapshot = {
  title: string;
  unit: string;
  target: number;
  current: number;
};

export type SpinState = {
  result: string | null;
  spunAt: string | null;
  /** Monotonic counter so the overlay can replay the wheel animation. */
  nonce: number;
};

export function parseSpinState(raw: unknown): SpinState {
  const source = asRecord(raw);
  const spin = asRecord(source["spin"]);
  return {
    result: typeof spin["result"] === "string" ? spin["result"] : null,
    spunAt: typeof spin["spunAt"] === "string" ? spin["spunAt"] : null,
    nonce: typeof spin["nonce"] === "number" ? spin["nonce"] : 0,
  };
}

export const EVENT_LABEL: Record<string, string> = {
  FOLLOW: "followed",
  SUBSCRIPTION: "subscribed",
  GIFT_SUB: "gifted subs",
  BITS: "cheered",
  DONATION: "tipped",
};

export function describeEvent(event: OverlayEvent): string {
  const who = event.actorName ?? "Someone";
  const verb = EVENT_LABEL[event.eventType] ?? "sent an event";
  if (event.eventType === "DONATION" && event.amount) {
    return `${who} tipped ${event.amount.toFixed(2)} ${event.currency ?? ""}`.trim();
  }
  if (event.eventType === "BITS" && event.amount) {
    return `${who} cheered ${Math.round(event.amount)} bits`;
  }
  if (event.eventType === "GIFT_SUB" && event.quantity > 1) {
    return `${who} gifted ${event.quantity} subs`;
  }
  return `${who} ${verb}`;
}

/* --------------------------- TikTok top tappers -------------------------- */

export type TappersLayout = "vertical" | "horizontal" | "podium" | "grid" | "ticker";

export const TAPPERS_LAYOUTS: {
  value: TappersLayout;
  label: string;
  }[] = [
  { value: "vertical", label: "Vertical list" },
  { value: "horizontal", label: "Horizontal shelf" },
  { value: "podium", label: "Podium showcase (Top 3)" },
  { value: "grid", label: "Minimal grid" },
  { value: "ticker", label: "Ticker / marquee banner" },
];

export const TAPPERS_LIMITS = [3, 5, 10] as const;


export type TappersConfig = BaseStyle & {
  layout: TappersLayout;
  /** Number of leaderboard slots rendered (Top 3 / 5 / 10). */
  topLimit: number;
  title: string;
  showAvatars: boolean;
};

export function parseTappersConfig(raw: unknown): TappersConfig {
  const source = asRecord(raw);
  const layout = source["layout"];
  const limit = Number(source["topLimit"]);
  return {
    ...parseStyle(source, {
      ...DEFAULT_STYLE,
      fontSize: 22,
      accentColor: "#FE2C55",
      backgroundOpacity: 70,
    }),
    layout: (TAPPERS_LAYOUTS.some((entry) => entry.value === layout)
      ? layout
      : "vertical") as TappersLayout,

    topLimit: (TAPPERS_LIMITS as readonly number[]).includes(limit) ? limit : 5,
    title: text(source["title"], "TOP TAPPERS", 30),
    showAvatars: bool(source["showAvatars"], true),
  };
}

export type TapperEntry = {
  key: string;
  name: string;
  avatarUrl: string | null;
  taps: number;
};

export function parseTappers(raw: unknown): TapperEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .map((item) => ({
      key: String(item["actor_key"] ?? item["key"] ?? item["actor_name"] ?? ""),
      name: String(item["actor_name"] ?? item["name"] ?? "Anonymous"),
      avatarUrl:
        typeof item["avatar_url"] === "string" && item["avatar_url"].length > 0
          ? item["avatar_url"]
          : typeof item["avatarUrl"] === "string" && item["avatarUrl"].length > 0
            ? (item["avatarUrl"] as string)
            : null,
      taps: Number(item["taps"] ?? 0) || 0,
    }))
    .filter((entry) => entry.key.length > 0);
}

/* --------------------------- TikTok tap goal ---------------------------- */

export type TapGoalDesign = "bar" | "pill" | "pillar" | "glass";

export const TAPGOAL_DESIGNS: {
  value: TapGoalDesign;
  label: string;
  }[] = [
  { value: "bar", label: "Standard bar" },
  { value: "pill", label: "Compact floating pill" },
  { value: "pillar", label: "Vertical pillar" },
  { value: "glass", label: "Glassmorphic card" },
];

export type TapGoalConfig = BaseStyle & {
  /** Total taps the streamer is aiming for. */
  target: number;
  title: string;
  gradientFrom: string;
  gradientTo: string;
  showPercent: boolean;
  design: TapGoalDesign;
};

export function parseTapGoalConfig(raw: unknown): TapGoalConfig {
  const source = asRecord(raw);
  const target = Number(source["target"]);
  const design = source["design"];
  return {
    ...parseStyle(source, {
      ...DEFAULT_STYLE,
      fontSize: 26,
      accentColor: "#FE2C55",
      backgroundOpacity: 70,
    }),
    target: Number.isFinite(target) ? Math.min(100_000_000, Math.max(1, Math.round(target))) : 10_000,
    title: text(source["title"], "TAP GOAL", 60),
    gradientFrom: hex(source["gradientFrom"], "#00F2FE"),
    gradientTo: hex(source["gradientTo"], "#FE2C55"),
    showPercent: bool(source["showPercent"], true),
    design: (TAPGOAL_DESIGNS.some((entry) => entry.value === design)
      ? design
      : "bar") as TapGoalDesign,
  };
}

/* ------------------------------ Kicks goal ------------------------------ */

export type KicksGoalConfig = BaseStyle & {
  title: string;
  target: number;
  current: number;
};

export const SPLIT_GOAL_KINDS = ["DONATION_GOAL", "FOLLOWER_GOAL", "SUBSCRIBER_GOAL", "CUSTOM_GOAL"] as const;
export type SplitGoalKind = (typeof SPLIT_GOAL_KINDS)[number];

export function isSplitGoalKind(type: string): type is SplitGoalKind {
  return (SPLIT_GOAL_KINDS as readonly string[]).includes(type);
}

export type SplitGoalConfig = BaseStyle & {
  title: string;
  target: number;
  current: number;
  /** Donation currency or the custom unit. Follower and subscriber goals ignore it. */
  unit: string;
};

const SPLIT_GOAL_DEFAULTS: Record<SplitGoalKind, { title: string; unit: string; target: number; accent: string }> = {
  DONATION_GOAL: { title: "هدف التبرعات", unit: "USD", target: 500, accent: "#7C3AED" },
  FOLLOWER_GOAL: { title: "هدف المتابعين", unit: "", target: 1000, accent: "#22D3EE" },
  SUBSCRIBER_GOAL: { title: "هدف المشتركين", unit: "", target: 50, accent: "#F59E0B" },
  CUSTOM_GOAL: { title: "هدف مخصص", unit: "نقطة", target: 100, accent: "#34D399" },
};

export function parseSplitGoalConfig(kind: SplitGoalKind, raw: unknown): SplitGoalConfig {
  const source = asRecord(raw);
  const defaults = SPLIT_GOAL_DEFAULTS[kind];
  const target = Number(source["target"]);
  const current = Number(source["current"]);
  const unitSource = typeof source["unit"] === "string" ? source["unit"].trim().slice(0, 16) : "";
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 36, accentColor: defaults.accent }),
    title: text(source["title"] ?? source["label"], defaults.title, 40),
    target: Number.isFinite(target) ? Math.min(100_000_000, Math.max(1, Math.round(target))) : defaults.target,
    current: Number.isFinite(current) ? Math.min(100_000_000, Math.max(0, Math.round(current))) : 0,
    unit: kind === "DONATION_GOAL" || kind === "CUSTOM_GOAL" ? unitSource || defaults.unit : "",
  };
}

export function parseKicksGoalConfig(raw: unknown): KicksGoalConfig {
  const source = asRecord(raw);
  const target = Number(source["target"]);
  const current = Number(source["current"]);
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 36, accentColor: "#67E8F9" }),
    title: text(source["title"] ?? source["label"], "هدف الكيكس", 40),
    target: Number.isFinite(target) ? Math.min(100_000_000, Math.max(1, Math.round(target))) : 1000,
    current: Number.isFinite(current) ? Math.min(100_000_000, Math.max(0, Math.round(current))) : 0,
  };
}

/** Saved current/target plus stored non-test progress. Callers must not add the event sum again. */
export function dynamicGoalSnapshot(
  type: string,
  config: unknown,
  events: readonly OverlayEvent[],
): GoalSnapshot | null {
  if (!isDynamicGoalWidget(type)) return null;
  const added = dynamicGoalAdded(type, events);
  if (type === "KICKS_GOAL") {
    const kicks = parseKicksGoalConfig(config);
    return { title: kicks.title, unit: "Kicks", target: kicks.target, current: kicks.current + added };
  }
  if (type !== "DONATION_GOAL" && type !== "FOLLOWER_GOAL" && type !== "SUBSCRIBER_GOAL") return null;
  const parsed = parseSplitGoalConfig(type, config);
  return {
    title: parsed.title,
    unit: type === "DONATION_GOAL" ? parsed.unit : "",
    target: parsed.target,
    current: parsed.current + added,
  };
}

/* ---------------------------- Viewer counter ---------------------------- */

export const VIEWER_PLATFORMS = ["KICK", "TWITCH", "YOUTUBE", "X", "TIKTOK"] as const;
export type ViewerPlatform = (typeof VIEWER_PLATFORMS)[number];
export type ViewerMetric = "viewers" | "followers";

export type ViewerCounterConfig = BaseStyle & {
  platform: ViewerPlatform;
  channel: string;
  metric: ViewerMetric;
};

export function parseViewerCounterConfig(raw: unknown): ViewerCounterConfig {
  const source = asRecord(raw);
  const platform = typeof source["platform"] === "string" ? source["platform"].toUpperCase() : "KICK";
  const metric = source["metric"] === "followers" ? "followers" : "viewers";
  const channel = typeof source["channel"] === "string" ? source["channel"].trim().slice(0, 80) : "";
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 64, accentColor: "#bee1fc" }),
    platform: (VIEWER_PLATFORMS as readonly string[]).includes(platform) ? (platform as ViewerPlatform) : "KICK",
    channel,
    metric,
  };
}

/* ----------------------------- Event labels ----------------------------- */

export type EventLabelsConfig = BaseStyle & {
  title: string;
  labels: EventLabelOption[];
  language: "ar" | "en" | null;
};

function eventLabelsTitle(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "تسميات الأحداث" || raw === "Event labels") return "آخر الأحداث";
  return raw.slice(0, 40);
}

export function parseEventLabelsConfig(raw: unknown): EventLabelsConfig {
  const source = asRecord(raw);
  const language = source["language"] === "ar" || source["language"] === "en" ? source["language"] : null;
  return {
    ...parseStyle(source, { ...DEFAULT_STYLE, fontSize: 28, backgroundOpacity: 70 }),
    title: eventLabelsTitle(source["title"]),
    labels: selectedEventLabelOptions(source["labels"]),
    language,
  };
}

