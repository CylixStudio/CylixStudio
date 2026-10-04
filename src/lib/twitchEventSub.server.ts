import { publicSiteUrl } from "@/lib/siteUrl.server";
import { readOAuthEnv } from "@/lib/oauth.server";

export type TwitchEventSubResult = {
  ok: boolean;
  created: number;
  results: { type: string; status: number }[];
  error?: string;
};

type EventSubSpec = {
  type: string;
  version: string;
  condition: Record<string, string>;
};

/**
 * Registers Twitch EventSub webhook subscriptions for a broadcaster.
 * Safe to call on every Twitch OAuth connect (409 = already subscribed).
 */
export async function ensureTwitchEventSub(args: {
  broadcasterUserId: string;
  /** Used to build the public callback URL; falls back to PUBLIC_SITE_URL. */
  request?: Request;
}): Promise<TwitchEventSubResult> {
  const clientId = readOAuthEnv("TWITCH_CLIENT_ID");
  const clientSecret = readOAuthEnv("TWITCH_CLIENT_SECRET");
  const secret = readOAuthEnv("TWITCH_EVENTSUB_SECRET");
  if (!clientId || !clientSecret) {
    return { ok: false, created: 0, results: [], error: "twitch_not_configured" };
  }
  if (!secret) {
    return { ok: false, created: 0, results: [], error: "eventsub_secret_missing" };
  }

  const broadcasterId = args.broadcasterUserId.trim();
  if (!broadcasterId) {
    return { ok: false, created: 0, results: [], error: "twitch_not_connected" };
  }

  const origin = publicSiteUrl(args.request);
  const callback = `${origin}/api/public/webhooks/twitch`;

  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!tokenResponse.ok) {
    return { ok: false, created: 0, results: [], error: "twitch_token_failed" };
  }
  const { access_token: appToken } = (await tokenResponse.json()) as { access_token: string };

  const subscriptions: EventSubSpec[] = [
    {
      type: "channel.follow",
      version: "2",
      condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId },
    },
    { type: "channel.subscribe", version: "1", condition: { broadcaster_user_id: broadcasterId } },
    {
      type: "channel.subscription.gift",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
    },
    { type: "channel.cheer", version: "1", condition: { broadcaster_user_id: broadcasterId } },
    { type: "channel.raid", version: "1", condition: { to_broadcaster_user_id: broadcasterId } },
  ];

  const results: { type: string; status: number }[] = [];
  for (const subscription of subscriptions) {
    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        "client-id": clientId,
        Authorization: `Bearer ${appToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...subscription,
        transport: { method: "webhook", callback, secret },
      }),
    });
    results.push({ type: subscription.type, status: response.status });
  }

  const created = results.filter((r) => r.status === 202 || r.status === 409).length;
  return { ok: created > 0, created, results };
}
