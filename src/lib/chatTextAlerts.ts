export const CHAT_ALERT_IDS = [
  "follow",
  "kicks",
  "subscription",
  "resubscription",
  "gift",
  "raid",
  "welcome",
] as const;

export type ChatAlertId = (typeof CHAT_ALERT_IDS)[number];

export type ChatTextAlert = {
  id: ChatAlertId;
  enabled: boolean;
  template: string;
  /** Kicks amount, or raid viewer count. Unused alerts stay at 0. */
  minimum: number;
};

export type ChatAlertSignal = {
  alertId: ChatAlertId;
  name: string;
  amount: number;
  viewers: number;
  months: number;
};

const TEMPLATES: Record<ChatAlertId, string> = {
  follow: "@$(name) شكراً على الفولو",
  kicks: "شكراً @$(name) على $(amount) KICKS!",
  subscription: "Thank you for the subscription $(name)",
  resubscription: "Thank you for renewing your subscription for $(months) months, $(name)!",
  gift: "Thank you for gifting a subscription @$(name)",
  raid: "@$(name) thank you for raiding me with $(viewers) spectators!",
  welcome: "Welcome to the stream, $(name)!",
};

export function isChatAlertId(value: string): value is ChatAlertId {
  return (CHAT_ALERT_IDS as readonly string[]).includes(value);
}

export function catalogChatAlerts(): ChatTextAlert[] {
  return CHAT_ALERT_IDS.map((id) => ({
    id,
    enabled: false,
    template: TEMPLATES[id],
    minimum: 0,
  }));
}

export function sanitizeAlertMinimum(raw: number | undefined): number {
  const value = Math.round(Number(raw) || 0);
  return Math.min(Math.max(value, 0), 1_000_000_000);
}

export function sanitizeAlertTemplate(raw: string, fallback: string): string {
  const text = raw.normalize("NFC").trim().slice(0, 480);
  return text || fallback;
}

export function mergeChatAlerts(
  saved: Array<Partial<ChatTextAlert> & { id: string }>,
): ChatTextAlert[] {
  const byId = new Map(saved.map((row) => [row.id, row]));
  return catalogChatAlerts().map((item) => {
    const row = byId.get(item.id);
    if (!row) return item;
    return {
      ...item,
      enabled: row.enabled ?? item.enabled,
      template: sanitizeAlertTemplate(row.template ?? "", item.template),
      minimum: sanitizeAlertMinimum(row.minimum ?? item.minimum),
    };
  });
}

export function renderChatAlert(
  template: string,
  vars: { name?: string; amount?: number | string; viewers?: number | string; months?: number | string },
): string {
  const text = (value: number | string | undefined) => (value == null ? "" : String(value));
  return template
    .replaceAll("$(name)", text(vars.name))
    .replaceAll("$(amount)", text(vars.amount))
    .replaceAll("$(viewers)", text(vars.viewers))
    .replaceAll("$(months)", text(vars.months))
    .trim()
    .slice(0, 480);
}

/** Kicks use amount. Raids use viewer count. Other alerts ignore the minimum. */
export function alertClearsMinimum(alertId: ChatAlertId, value: number, minimum: number): boolean {
  if (alertId !== "kicks" && alertId !== "raid") return true;
  const amount = Number.isFinite(value) ? value : 0;
  return amount >= sanitizeAlertMinimum(minimum);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textAt(source: Record<string, unknown> | null, key: string, nested?: string): string {
  if (!source) return "";
  const value = nested ? asRecord(source[key])?.[nested] : source[key];
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function numberAt(source: Record<string, unknown> | null, ...keys: string[]): number {
  if (!source) return 0;
  for (const key of keys) {
    const value = source[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function monthsOf(value: unknown): number {
  const months = Number(value ?? 1);
  if (!Number.isFinite(months) || months < 1 || months > 120) return 1;
  return Math.round(months);
}

export function classifyKickChatAlert(type: string, body: Record<string, unknown>): ChatAlertSignal | null {
  const kind = type.toLowerCase().replace(/_/g, ".");
  const gift = asRecord(body["gift"]);
  const name =
    textAt(body, "follower", "username") ||
    textAt(body, "subscriber", "username") ||
    textAt(body, "gifter", "username") ||
    textAt(body, "sender", "username") ||
    textAt(body, "raider", "username") ||
    textAt(body, "user", "username");
  switch (kind) {
    case "channel.followed":
    case "follow":
      return { alertId: "follow", name, amount: 0, viewers: 0, months: 0 };
    case "kicks.gifted":
    case "channel.kicks.gifted":
      return {
        alertId: "kicks",
        name,
        amount: numberAt(gift, "amount") || numberAt(body, "amount"),
        viewers: 0,
        months: 0,
      };
    case "channel.subscription.new":
      return { alertId: "subscription", name, amount: 0, viewers: 0, months: monthsOf(body["duration"]) };
    case "channel.subscription.renewal":
      return { alertId: "resubscription", name, amount: 0, viewers: 0, months: monthsOf(body["duration"]) };
    case "channel.subscription.gifts":
    case "gifted.subscriptions":
      return { alertId: "gift", name: name || "Anonymous", amount: 0, viewers: 0, months: 0 };
    case "channel.raid":
    case "livestream.raid":
    case "raid":
      return {
        alertId: "raid",
        name,
        amount: 0,
        viewers:
          numberAt(body, "viewers", "viewer_count", "viewerCount") ||
          numberAt(asRecord(body["raider"]), "viewers", "viewer_count"),
        months: 0,
      };
    default:
      return null;
  }
}

export function classifyTwitchChatAlert(type: string, event: Record<string, unknown>): ChatAlertSignal | null {
  const nameOf = (...keys: string[]) => {
    for (const key of keys) {
      const value = event[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  switch (type) {
    case "channel.follow":
      return { alertId: "follow", name: nameOf("user_name", "user_login"), amount: 0, viewers: 0, months: 0 };
    case "channel.subscribe":
      if (event["is_gift"] === true) return null;
      return { alertId: "subscription", name: nameOf("user_name"), amount: 0, viewers: 0, months: 1 };
    case "channel.subscription.message": {
      const months = monthsOf(event["cumulative_months"] ?? event["duration_months"]);
      if (months <= 1) return null;
      return { alertId: "resubscription", name: nameOf("user_name"), amount: 0, viewers: 0, months };
    }
    case "channel.subscription.gift":
      return {
        alertId: "gift",
        name: event["is_anonymous"] === true ? "Anonymous" : nameOf("user_name"),
        amount: 0,
        viewers: 0,
        months: 0,
      };
    case "channel.raid":
      return {
        alertId: "raid",
        name: nameOf("from_broadcaster_user_name"),
        amount: 0,
        viewers: numberAt(event, "viewers"),
        months: 0,
      };
    default:
      return null;
  }
}
