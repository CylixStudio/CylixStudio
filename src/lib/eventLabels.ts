import type { TranslationKey } from "@/lib/i18n";

/**
 * Fixed lines for the EVENT_LABELS widget.
 * Kicks are Kick currency stored as BITS. Bits are Twitch BITS. Donations stay DONATION.
 */
export const EVENT_LABEL_OPTIONS = [
  "lastKicks",
  "lastRaid",
  "lastFollow",
  "lastDonation",
  "lastSub",
  "lastGift",
  "topKicks",
  "topRaid",
  "topBits",
  "topGift",
] as const;

export type EventLabelOption = (typeof EVENT_LABEL_OPTIONS)[number];

export const EVENT_LABEL_I18N: Record<EventLabelOption, TranslationKey> = {
  lastKicks: "widget.eventLabel.lastKicks",
  lastRaid: "widget.eventLabel.lastRaid",
  lastFollow: "widget.eventLabel.lastFollow",
  lastDonation: "widget.eventLabel.lastDonation",
  lastSub: "widget.eventLabel.lastSub",
  lastGift: "widget.eventLabel.lastGift",
  topKicks: "widget.eventLabel.topKicks",
  topRaid: "widget.eventLabel.topRaid",
  topBits: "widget.eventLabel.topBits",
  topGift: "widget.eventLabel.topGift",
};

type LabelKind = "kicks" | "raid" | "follow" | "donation" | "sub" | "gift" | "bits";

const OPTION_KIND: Record<EventLabelOption, LabelKind> = {
  lastKicks: "kicks",
  lastRaid: "raid",
  lastFollow: "follow",
  lastDonation: "donation",
  lastSub: "sub",
  lastGift: "gift",
  topKicks: "kicks",
  topRaid: "raid",
  topBits: "bits",
  topGift: "gift",
};

const TOP_TODAY = new Set<EventLabelOption>(["topKicks", "topRaid", "topBits", "topGift"]);

export type StoredEventInput = {
  eventType: string;
  actorName: string | null;
  platform?: string | null;
  amount?: number | null;
  currency?: string | null;
  quantity?: number | null;
  isTest?: boolean;
  type?: string | null;
  createdAt?: string;
};

export type EventLabelLine = {
  option: EventLabelOption;
  username: string;
  amount: string | null;
};

function isOptionId(value: string): value is EventLabelOption {
  return (EVENT_LABEL_OPTIONS as readonly string[]).includes(value);
}

/** Known option ids, in checklist order. Legacy free text falls back to every line. */
export function selectedEventLabelOptions(raw: unknown): EventLabelOption[] {
  if (!Array.isArray(raw)) return [...EVENT_LABEL_OPTIONS];
  const known = new Set(raw.filter((entry): entry is EventLabelOption => typeof entry === "string" && isOptionId(entry)));
  if (raw.length > 0 && known.size === 0) return [...EVENT_LABEL_OPTIONS];
  return EVENT_LABEL_OPTIONS.filter((option) => known.has(option));
}

function isIgnored(event: StoredEventInput): boolean {
  if (event.isTest) return true;
  const eventType = typeof event.eventType === "string" ? event.eventType.toLowerCase() : "";
  const type = typeof event.type === "string" ? event.type.toLowerCase() : "";
  return eventType === "test" || type === "test";
}

function kindOf(event: StoredEventInput): LabelKind | null {
  const platform = (event.platform ?? "").toUpperCase();
  switch (event.eventType) {
    case "RAID":
      return "raid";
    case "FOLLOW":
      return "follow";
    case "DONATION":
      return "donation";
    case "SUBSCRIPTION":
      return "sub";
    case "GIFT_SUB":
      return "gift";
    case "BITS":
      if (platform === "KICK") return "kicks";
      if (platform === "TWITCH") return "bits";
      return null;
    default:
      return null;
  }
}

function timeOf(event: StoredEventInput): number {
  const value = Date.parse(event.createdAt ?? "");
  return Number.isFinite(value) ? value : 0;
}

function startOfLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function positive(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Size used to pick the top event today. Gift subs use the gifted count. */
function magnitude(event: StoredEventInput, kind: LabelKind): number {
  if (kind === "gift") return positive(event.quantity) ?? 0;
  if (kind === "raid") return positive(event.amount) ?? positive(event.quantity) ?? 0;
  return positive(event.amount) ?? 0;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function amountText(event: StoredEventInput, kind: LabelKind): string | null {
  if (kind === "gift") {
    const quantity = positive(event.quantity);
    return quantity == null ? null : String(Math.round(quantity));
  }
  const amount = positive(event.amount);
  if (amount == null) return null;
  if (kind === "donation") {
    const currency = event.currency?.trim();
    const value = formatNumber(amount);
    return currency ? `${value} ${currency}` : value;
  }
  return formatNumber(amount);
}

function pickLatest(events: StoredEventInput[], kind: LabelKind): StoredEventInput | null {
  let best: StoredEventInput | null = null;
  let bestTime = -1;
  for (const event of events) {
    if (kindOf(event) !== kind) continue;
    const username = event.actorName?.trim() ?? "";
    if (!username) continue;
    const time = timeOf(event);
    if (time >= bestTime) {
      best = event;
      bestTime = time;
    }
  }
  return best;
}

function pickTopToday(events: StoredEventInput[], kind: LabelKind, now: Date): StoredEventInput | null {
  const start = startOfLocalDay(now);
  let best: StoredEventInput | null = null;
  let bestScore = -1;
  let bestTime = -1;
  for (const event of events) {
    if (kindOf(event) !== kind) continue;
    const username = event.actorName?.trim() ?? "";
    if (!username) continue;
    const time = timeOf(event);
    if (time < start) continue;
    const score = magnitude(event, kind);
    if (score > bestScore || (score === bestScore && time >= bestTime)) {
      best = event;
      bestScore = score;
      bestTime = time;
    }
  }
  return best;
}

/** Selected lines that have a real stored event. Missing types are omitted. */
export function resolveEventLabelLines(
  events: StoredEventInput[],
  selected: readonly EventLabelOption[],
  now = new Date(),
): EventLabelLine[] {
  const real = events.filter((event) => !isIgnored(event));
  const chosen = new Set(selected);
  const lines: EventLabelLine[] = [];
  for (const option of EVENT_LABEL_OPTIONS) {
    if (!chosen.has(option)) continue;
    const kind = OPTION_KIND[option];
    const event = TOP_TODAY.has(option) ? pickTopToday(real, kind, now) : pickLatest(real, kind);
    const username = event?.actorName?.trim() ?? "";
    if (!event || !username) continue;
    lines.push({ option, username, amount: amountText(event, kind) });
  }
  return lines;
}
