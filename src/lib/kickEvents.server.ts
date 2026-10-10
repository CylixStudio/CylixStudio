/**
 * Kick EventSub-style webhook events required for Studio features.
 * Poll and prediction events are not in Kick's public catalog, so they are
 * not requested here. The webhook still applies them when Kick delivers one.
 */
const REQUIRED_KICK_EVENTS = [
  { name: "chat.message.sent", version: 1 },
  { name: "channel.reward.redemption.updated", version: 1 },
  // Subathon / activity ingest (handled in api/public/webhooks/kick.ts)
  { name: "channel.followed", version: 1 },
  { name: "channel.subscription.new", version: 1 },
  { name: "channel.subscription.renewal", version: 1 },
  { name: "channel.subscription.gifts", version: 1 },
  { name: "kicks.gifted", version: 1 },
] as const;

type KickSubscription = {
  id?: string;
  event?: string;
  broadcaster_user_id?: number;
};

export type KickEventSubscriptionResult = {
  ok: boolean;
  subscribed: string[];
  errors: string[];
};

/**
 * Ensures Kick delivers chat, rewards, follows, and subscription events to the
 * app webhook. Safe to call on every Kick OAuth connect.
 */
export async function ensureKickEventSubscriptions(
  accessToken: string,
  broadcasterUserId: string,
): Promise<KickEventSubscriptionResult> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const broadcasterId = Number(broadcasterUserId);
  const query = Number.isSafeInteger(broadcasterId)
    ? `?broadcaster_user_id=${encodeURIComponent(String(broadcasterId))}`
    : "";
  const existingResponse = await fetch(`https://api.kick.com/public/v1/events/subscriptions${query}`, {
    headers,
  });
  const existingJson = existingResponse.ok
    ? ((await existingResponse.json()) as { data?: KickSubscription[] })
    : { data: [] as KickSubscription[] };
  const existing = new Set((existingJson.data ?? []).map((item) => item.event));
  const missing = REQUIRED_KICK_EVENTS.filter((event) => !existing.has(event.name));
  if (!missing.length) return { ok: true, subscribed: [], errors: [] };

  const response = await fetch("https://api.kick.com/public/v1/events/subscriptions", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      events: missing,
      method: "webhook",
      ...(Number.isSafeInteger(broadcasterId) ? { broadcaster_user_id: broadcasterId } : {}),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ name?: string; error?: string }>;
    message?: string;
  };
  const rows = payload.data ?? [];
  const subscribed = rows.filter((row) => !row.error && row.name).map((row) => String(row.name));
  const errors = rows.filter((row) => row.error).map((row) => `${row.name ?? "event"}: ${row.error}`);
  if (!response.ok && payload.message) errors.push(payload.message);
  return { ok: response.ok && errors.length === 0, subscribed, errors };
}

/** @deprecated Prefer ensureKickEventSubscriptions — kept for existing imports. */
export const ensureKickMediaSubscriptions = ensureKickEventSubscriptions;
