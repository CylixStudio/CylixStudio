/** Dashboard overview metrics derived from activity `events` (same rules as MetricAnalyticsModal). */

export const ANALYTICS_RANGE_DAYS = 7;
export const ANALYTICS_FETCH_DAYS = 90;

export type MetricKey = "followers" | "subs" | "tips" | "bits";

export type AnalyticsEvent = {
  id: string;
  event_type: string;
  amount: number | null;
  quantity: number;
  created_at: string;
  /** Preview rows already stored with `isTest` or `type: "test"` add nothing. */
  isTest?: boolean;
};

export type AnalyticsDayPoint = {
  date: string;
  followers: number;
  subs: number;
  tips: number;
  bits: number;
};

export type DateRange = {
  start: Date;
  end: Date;
};

export type DashboardOverview = {
  source: "demo" | "live";
  rangeDays: number;
  followers: number;
  messages: number;
  commandsUsed: number;
  chatTracked: boolean;
  subscribers: number;
  tips: number;
  bits: number;
  series: AnalyticsDayPoint[];
  events: AnalyticsEvent[];
};

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayKey(iso: string) {
  return localDayKey(new Date(iso));
}

export function isoDay(date: Date) {
  return localDayKey(date);
}

export function parseLocalDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

export function rangeStart(days = ANALYTICS_RANGE_DAYS) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export function presetRange(days: number): DateRange {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: rangeStart(days), end };
}

export function customRange(from: string, to: string): DateRange {
  const a = parseLocalDay(from);
  const b = parseLocalDay(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(23, 59, 59, 999);
  return a.getTime() <= b.getTime() ? { start: a, end: b } : { start: b, end: a };
}

export function resolveRange(
  daysOrRange: number | DateRange = ANALYTICS_RANGE_DAYS,
): DateRange {
  return typeof daysOrRange === "number" ? presetRange(daysOrRange) : daysOrRange;
}

function emptySeriesRange(range: DateRange): AnalyticsDayPoint[] {
  const points: AnalyticsDayPoint[] = [];
  const cursor = new Date(range.start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(range.end);
  last.setHours(0, 0, 0, 0);
  let n = 0;
  while (cursor.getTime() <= last.getTime() && n < 366) {
    points.push({ date: localDayKey(cursor), followers: 0, subs: 0, tips: 0, bits: 0 });
    cursor.setDate(cursor.getDate() + 1);
    n += 1;
  }
  return points;
}

function emptySeries(days = ANALYTICS_RANGE_DAYS): AnalyticsDayPoint[] {
  return emptySeriesRange(presetRange(days));
}

function qty(event: AnalyticsEvent) {
  return event.quantity > 0 ? event.quantity : 1;
}

/** Same contribution rules as the activity feed totals and MetricAnalyticsModal. */
export function metricContribution(metric: MetricKey, event: AnalyticsEvent): number {
  if (event.isTest || event.event_type === "test") return 0;
  const count = qty(event);
  const amount = Number(event.amount ?? 0);
  const type = event.event_type;

  if (metric === "followers") return type === "FOLLOW" ? count : 0;
  if (metric === "subs") return type === "SUBSCRIPTION" || type === "GIFT_SUB" ? count : 0;
  if (metric === "tips") return type === "DONATION" && Number.isFinite(amount) ? amount : 0;
  if (type !== "BITS") return 0;
  return Number.isFinite(amount) && amount > 0 ? amount : count;
}

export function summarizeEvents(
  events: AnalyticsEvent[],
  daysOrRange: number | DateRange = ANALYTICS_RANGE_DAYS,
): Omit<DashboardOverview, "source" | "messages" | "commandsUsed" | "chatTracked" | "events"> {
  const range = resolveRange(daysOrRange);
  const series = emptySeriesRange(range);
  const byDate = new Map(series.map((point) => [point.date, point]));
  const cutoff = range.start.getTime();
  const until = range.end.getTime();

  let followers = 0;
  let subscribers = 0;
  let tips = 0;
  let bits = 0;

  for (const event of events) {
    const time = new Date(event.created_at).getTime();
    if (time < cutoff || time > until) continue;
    const point = byDate.get(dayKey(event.created_at));
    if (!point) continue;

    const follow = metricContribution("followers", event);
    const sub = metricContribution("subs", event);
    const tip = metricContribution("tips", event);
    const cheer = metricContribution("bits", event);

    point.followers += follow;
    point.subs += sub;
    point.tips += tip;
    point.bits += cheer;

    followers += follow;
    subscribers += sub;
    tips += tip;
    bits += cheer;
  }

  for (const point of series) {
    point.tips = Number(point.tips.toFixed(2));
  }

  return {
    rangeDays: series.length || ANALYTICS_RANGE_DAYS,
    followers,
    subscribers,
    tips: Number(tips.toFixed(2)),
    bits,
    series,
  };
}

function isoOnDay(dateKey: string, minute: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, minute, 0).toISOString();
}

/** Repeating weekly pattern so 7-day and 30-day test views stay populated. */
export function buildDemoEvents(days = 30): AnalyticsEvent[] {
  const series = emptySeries(days);
  const follows = [4, 6, 5, 8, 3, 9, 7];
  const subCounts = [1, 2, 0, 1, 2, 1, 2];
  const tipAmounts = [10, 0, 15.5, 0, 20, 5, 14];
  const bitAmounts = [200, 350, 0, 400, 150, 440, 300];
  const events: AnalyticsEvent[] = [];
  let n = 0;

  series.forEach((point, index) => {
    const slot = index % 7;
    for (let i = 0; i < (follows[slot] ?? 0); i++) {
      events.push({
        id: `demo-follow-${n++}`,
        event_type: "FOLLOW",
        amount: null,
        quantity: 1,
        created_at: isoOnDay(point.date, i),
      });
    }

    const subs = subCounts[slot] ?? 0;
    for (let i = 0; i < subs; i++) {
      events.push({
        id: `demo-sub-${n++}`,
        event_type: i === 0 && slot % 2 === 1 ? "GIFT_SUB" : "SUBSCRIPTION",
        amount: null,
        quantity: 1,
        created_at: isoOnDay(point.date, 20 + i),
      });
    }

    const tip = tipAmounts[slot] ?? 0;
    if (tip > 0) {
      events.push({
        id: `demo-tip-${n++}`,
        event_type: "DONATION",
        amount: tip,
        quantity: 1,
        created_at: isoOnDay(point.date, 40),
      });
    }

    const bits = bitAmounts[slot] ?? 0;
    if (bits > 0) {
      events.push({
        id: `demo-bits-${n++}`,
        event_type: "BITS",
        amount: bits,
        quantity: 1,
        created_at: isoOnDay(point.date, 50),
      });
    }
  });

  return events;
}

/** Stable demo series so test mode never renders an empty analytics page. */
export function buildDemoOverview(): DashboardOverview {
  const events = buildDemoEvents(30);
  return {
    ...emptyLiveOverview(),
    ...summarizeEvents(events, ANALYTICS_RANGE_DAYS),
    source: "demo",
    messages: 1286,
    commandsUsed: 38,
    chatTracked: true,
    events,
  };
}

export function emptyLiveOverview(): DashboardOverview {
  return {
    source: "live",
    rangeDays: ANALYTICS_RANGE_DAYS,
    followers: 0,
    messages: 0,
    commandsUsed: 0,
    chatTracked: false,
    subscribers: 0,
    tips: 0,
    bits: 0,
    series: emptySeries(),
    events: [],
  };
}
