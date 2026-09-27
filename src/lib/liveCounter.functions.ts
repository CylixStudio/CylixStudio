import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export type CounterPlatform = "KICK" | "TWITCH" | "X" | "TIKTOK" | "YOUTUBE" | "ALL";

export type ChannelSnapshot = {
  platform: "KICK" | "TWITCH" | "X" | "TIKTOK" | "YOUTUBE";
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followers: number | null;
  isLive: boolean;
  viewers: number | null;
  /** Present when the platform can be reached but the count is unavailable. */
  note: string | null;
  fetchedAt: string;
};

type KickPayload = {
  slug?: string;
  followers_count?: number;
  followersCount?: number;
  user?: { username?: string; profile_pic?: string | null };
  livestream?: { is_live?: boolean; viewer_count?: number } | null;
};

/** Accepts a slug, @handle, or kick.com URL. */
function kickSlug(raw: string): string {
  const trimmed = raw.trim().replace(/^@/, "");
  const fromUrl = trimmed.match(/kick\.com\/([A-Za-z0-9_]+)/i)?.[1];
  const slug = (fromUrl ?? trimmed).toLowerCase();
  return slug.replace(/[^a-z0-9_]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numField(source: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

/** Slug or handle from a raw name, @handle, or platform profile URL. */
export function channelHandle(raw: string): string {
  const trimmed = raw.trim();
  const asUrl = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("www.")
      ? `https://${trimmed}`
      : null;
  if (asUrl) {
    try {
      const url = new URL(asUrl);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      const parts = url.pathname.split("/").filter(Boolean);
      if (host.endsWith("kick.com") || host.endsWith("twitch.tv")) {
        const slug = parts[0] ?? "";
        if (slug && !["videos", "directory", "settings"].includes(slug)) return slug.replace(/^@/, "");
      }
      if (host.endsWith("youtube.com") || host === "youtu.be" || host === "m.youtube.com") {
        if (parts[0] === "channel" && parts[1]) return parts[1];
        if ((parts[0] === "c" || parts[0] === "user") && parts[1]) return parts[1];
        const at = parts.find((part) => part.startsWith("@"));
        if (at) return at.slice(1);
        return (parts[0] ?? "").replace(/^@/, "");
      }
      if (host === "x.com" || host === "twitter.com" || host.endsWith("tiktok.com")) {
        return (parts[0] ?? "").replace(/^@/, "");
      }
    } catch {
      /* not a URL */
    }
  }
  return trimmed.replace(/^@/, "").split(/[/?#\s]/)[0] ?? "";
}

/** Server-side Kick fetch. The browser never calls Kick (CORS and IP blocks). */
async function kickFetch(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        referer: "https://kick.com/",
        origin: "https://kick.com",
      },
    });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function snapshotFromKickV2(payload: KickPayload, fallback: string): ChannelSnapshot | null {
  const record = payload as unknown as Record<string, unknown>;
  const user = asRecord(record["user"]);
  const slug =
    (typeof payload.slug === "string" && payload.slug) ||
    (typeof user?.["username"] === "string" && user["username"]) ||
    null;
  if (!slug && !payload.user) return null;
  const followers =
    numField(record, "followers_count", "followersCount", "follower_count") ??
    numField(user, "followers_count", "followersCount", "follower_count");
  return {
    platform: "KICK",
    username: payload.slug ?? fallback,
    displayName: payload.user?.username ?? payload.slug ?? fallback,
    avatarUrl: payload.user?.profile_pic ?? null,
    followers,
    isLive: Boolean(payload.livestream?.is_live),
    viewers: payload.livestream?.viewer_count ?? null,
    note: followers === null ? "Kick did not return a follower total for this channel." : null,
    fetchedAt: new Date().toISOString(),
  };
}

/** Official public channels endpoint — works when kick.com/api is blocked. */
async function kickOfficialChannel(slug: string): Promise<ChannelSnapshot | null> {
  const payload =
    (await kickFetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`)) ??
    (await kickFetch(
      `https://api.kick.com/public/v1/channels?${new URLSearchParams([["slug[]", slug]]).toString()}`,
    ));
  const root = asRecord(payload);
  const rows = Array.isArray(root?.["data"]) ? root["data"] : Array.isArray(payload) ? payload : [];
  const row = asRecord(rows[0]);
  if (!row) return null;
  const channelSlug = typeof row["slug"] === "string" ? row["slug"] : slug;
  const stream = asRecord(row["stream"]) ?? asRecord(row["livestream"]);
  const user = asRecord(row["user"]);
  const followers = numField(row, "followers_count", "follower_count", "followersCount");
  const viewers = numField(stream, "viewer_count", "viewers");
  const isLive =
    stream?.["is_live"] === true ||
    row["is_live"] === true ||
    (typeof viewers === "number" && viewers > 0);
  const avatar =
    (typeof user?.["profile_pic"] === "string" && user["profile_pic"]) ||
    (typeof row["profile_picture"] === "string" && row["profile_picture"]) ||
    null;
  const display =
    (typeof user?.["username"] === "string" && user["username"]) ||
    (typeof row["username"] === "string" && row["username"]) ||
    channelSlug;
  return {
    platform: "KICK",
    username: channelSlug,
    displayName: display,
    avatarUrl: avatar,
    followers,
    isLive,
    viewers,
    note: followers === null ? "Kick did not return a follower total for this channel." : null,
    fetchedAt: new Date().toISOString(),
  };
}

/** Kick exposes public channel data — followers, avatar and live state. */
async function kickChannel(username: string): Promise<ChannelSnapshot | null> {
  const slug = kickSlug(channelHandle(username));
  if (!slug) return null;
  const encoded = encodeURIComponent(slug);
  const legacy =
    (await kickFetch(`https://kick.com/api/v2/channels/${encoded}`)) ??
    (await kickFetch(`https://kick.com/api/v1/channels/${encoded}`));
  const record = asRecord(legacy);
  const nested = asRecord(record?.["data"]);
  const v2 = (nested?.["slug"] || nested?.["user"] ? nested : record) as KickPayload | null;
  if (v2) {
    const mapped = snapshotFromKickV2(v2, slug);
    if (mapped) return mapped;
  }
  return kickOfficialChannel(slug);
}


/** Twitch app token — enough for profile + live state on any channel. */
async function twitchAppToken(): Promise<string | null> {
  const id = process.env["TWITCH_CLIENT_ID"];
  const secret = process.env["TWITCH_CLIENT_SECRET"];
  if (!id || !secret) return null;
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { access_token?: string };
  return payload.access_token ?? null;
}

async function twitchChannel(
  username: string,
  userToken: string | null,
  ownBroadcasterId: string | null,
): Promise<ChannelSnapshot | null> {
  const clientId = process.env["TWITCH_CLIENT_ID"];
  const appToken = await twitchAppToken();
  if (!clientId || !appToken) return null;

  const login = channelHandle(username).toLowerCase();
  if (!login) return null;

  const headers = { Authorization: `Bearer ${appToken}`, "Client-Id": clientId };
  const userRes = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    { headers },
  );
  if (!userRes.ok) return null;
  const users = (await userRes.json()) as {
    data?: { id: string; display_name: string; login: string; profile_image_url: string }[];
  };
  const profile = users.data?.[0];
  if (!profile) return null;

  const streamRes = await fetch(
    `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(profile.id)}`,
    { headers },
  );
  const streams = streamRes.ok
    ? ((await streamRes.json()) as { data?: { viewer_count?: number }[] })
    : { data: [] };
  const stream = streams.data?.[0];

  // Twitch only returns the follower total to the broadcaster's own token.
  let followers: number | null = null;
  let note: string | null =
    "Twitch only shares follower totals with the channel owner — connect this account to see the count.";
  if (userToken && ownBroadcasterId === profile.id) {
    const followRes = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${profile.id}&first=1`,
      { headers: { Authorization: `Bearer ${userToken}`, "Client-Id": clientId } },
    );
    if (followRes.ok) {
      const payload = (await followRes.json()) as { total?: number };
      if (typeof payload.total === "number") {
        followers = payload.total;
        note = null;
      }
    }
  }

  return {
    platform: "TWITCH",
    username: profile.login,
    displayName: profile.display_name,
    avatarUrl: profile.profile_image_url,
    followers,
    isLive: Boolean(stream),
    viewers: stream?.viewer_count ?? null,
    note,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * X (Twitter) public metrics via the official API v2 app-only bearer token.
 */
async function xAccount(username: string): Promise<ChannelSnapshot | null> {
  const bearer = process.env["X_BEARER_TOKEN"];
  if (!bearer) return null;

  const handle = encodeURIComponent(channelHandle(username).replace(/^@/, ""));
  const response = await fetch(
    `https://api.twitter.com/2/users/by/username/${handle}?user.fields=name,username,profile_image_url,public_metrics`,
    {
      headers: {
        Authorization: `Bearer ${bearer}`,
      },
    },
  );
  if (!response.ok) {
    const body = await response.text();
    console.error(`X lookup failed [${response.status}]: ${body}`);
    return null;
  }
  const payload = (await response.json()) as {
    data?: {
      name?: string;
      username?: string;
      profile_image_url?: string;
      public_metrics?: { followers_count?: number };
    };
  };
  const profile = payload.data;
  if (!profile?.username) return null;

  const followers = profile.public_metrics?.followers_count ?? null;
  return {
    platform: "X",
    username: profile.username,
    displayName: profile.name ?? profile.username,
    avatarUrl: profile.profile_image_url?.replace("_normal", "_400x400") ?? null,
    followers,
    isLive: false,
    viewers: null,
    note: followers === null ? "X did not return a follower total for this account." : null,
    fetchedAt: new Date().toISOString(),
  };
}

/** TikTok only exposes stats for the connected (authorised) account. Kept for when Login Kit ships. */
async function tiktokAccount(
  accessToken: string,
  fallbackName: string,
): Promise<ChannelSnapshot | null> {
  const fields = "open_id,display_name,avatar_url,follower_count";
  const response = await fetch(
    `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok) {
    console.error(`TikTok lookup failed [${response.status}]: ${await response.text()}`);
    return null;
  }
  const payload = (await response.json()) as {
    data?: {
      user?: { display_name?: string; avatar_url?: string; follower_count?: number };
    };
  };
  const user = payload.data?.user;
  if (!user) return null;
  const followers = typeof user.follower_count === "number" ? user.follower_count : null;
  return {
    platform: "TIKTOK",
    username: user.display_name ?? fallbackName,
    displayName: user.display_name ?? fallbackName,
    avatarUrl: user.avatar_url ?? null,
    followers,
    isLive: false,
    viewers: null,
    note: followers === null ? "TikTok did not return a follower total." : null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * YouTube Data API v3 subscriber + live check. Server-only; needs YOUTUBE_API_KEY.
 */
async function youtubeChannel(username: string): Promise<ChannelSnapshot | null> {
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key) return null;
  const handle = channelHandle(username);
  if (!handle) return null;

  const byId = handle.startsWith("UC") && handle.length >= 20;
  const qs = new URLSearchParams({
    part: "snippet,statistics",
    key,
    ...(byId ? { id: handle } : { forHandle: handle.replace(/^@/, "") }),
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${qs.toString()}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    items?: {
      id?: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
      statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
    }[];
  };
  const item = payload.items?.[0];
  if (!item?.id) return null;
  const hidden = item.statistics?.hiddenSubscriberCount === true;
  const followers = hidden ? null : Number(item.statistics?.subscriberCount ?? NaN);
  const count = Number.isFinite(followers) ? followers : null;

  let viewers: number | null = null;
  let isLive = false;
  const liveQs = new URLSearchParams({
    part: "id",
    channelId: item.id,
    eventType: "live",
    type: "video",
    maxResults: "1",
    key,
  });
  const liveRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${liveQs.toString()}`);
  if (liveRes.ok) {
    const live = (await liveRes.json()) as { items?: { id?: { videoId?: string } }[] };
    const videoId = live.items?.[0]?.id?.videoId;
    if (videoId) {
      isLive = true;
      const videoQs = new URLSearchParams({
        part: "liveStreamingDetails",
        id: videoId,
        key,
      });
      const videoRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videoQs.toString()}`);
      if (videoRes.ok) {
        const videos = (await videoRes.json()) as {
          items?: { liveStreamingDetails?: { concurrentViewers?: string } }[];
        };
        const raw = Number(videos.items?.[0]?.liveStreamingDetails?.concurrentViewers ?? NaN);
        viewers = Number.isFinite(raw) ? raw : null;
      }
    }
  }

  return {
    platform: "YOUTUBE",
    username: handle.replace(/^@/, ""),
    displayName: item.snippet?.title ?? handle,
    avatarUrl: item.snippet?.thumbnails?.default?.url ?? null,
    followers: count,
    isLive,
    viewers,
    note: count === null ? "YouTube hid the subscriber total for this channel." : null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Live follower lookup for the Live Counter page. All platform calls run on
 * the server (this function and POST /api/live-counter/lookup) so the browser
 * never hits Kick, Twitch, or YouTube directly.
 */
export async function resolveChannelSnapshot(input: {
  userId: string;
  platform: CounterPlatform;
  username: string;
}): Promise<ChannelSnapshot> {
  const username = channelHandle(input.username);
  if (!username) throw new Error("Enter a channel name");

  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data: connections } = await supabaseAdmin
    .from("platform_connections")
    .select("platform, platform_user_id, access_token, username, metadata")
    .eq("user_id", input.userId)
    .eq("is_active", true);
  const twitchConn = connections?.find((row) => row.platform === "TWITCH") ?? null;
  const tiktokReady = false;

  const order: ("KICK" | "TWITCH" | "X" | "TIKTOK" | "YOUTUBE")[] =
    input.platform === "ALL"
      ? ["KICK", "TWITCH", "YOUTUBE", "X"]
      : [input.platform as "KICK" | "TWITCH" | "X" | "TIKTOK" | "YOUTUBE"];

  for (const platform of order) {
    if (platform === "KICK") {
      const snapshot = await kickChannel(username);
      if (snapshot) return snapshot;
    }
    if (platform === "TWITCH") {
      const snapshot = await twitchChannel(
        username,
        twitchConn?.access_token ?? null,
        twitchConn?.platform_user_id ?? null,
      );
      if (snapshot) return snapshot;
    }
    if (platform === "YOUTUBE") {
      const snapshot = await youtubeChannel(username);
      if (snapshot) return snapshot;
      if (input.platform === "YOUTUBE" && !process.env["YOUTUBE_API_KEY"]) {
        throw new Error("Set YOUTUBE_API_KEY to read live YouTube subscriber counts.");
      }
    }
    if (platform === "X") {
      const snapshot = await xAccount(username);
      if (snapshot) return snapshot;
      if (input.platform === "X") {
        throw new Error(
          process.env["X_BEARER_TOKEN"]
            ? `Channel Not Found: "${username}"`
            : "Set X_BEARER_TOKEN to read live follower counts for X handles.",
        );
      }
    }
    if (platform === "TIKTOK") {
      if (!tiktokReady) {
        throw new Error("TikTok live counters are Coming Soon until TikTok OAuth is ready.");
      }
      const snapshot = await tiktokAccount("", username);
      if (snapshot) return snapshot;
    }
  }

  throw new Error(`Channel Not Found: "${username}"`);
}

/**
 * Live follower lookup for the Live Counter page. Kick is fully public;
 * Twitch needs the owner's connection for follower totals. TikTok and
 * YouTube do not expose a public counter API, so they report clearly
 * instead of returning invented numbers.
 */
export const lookupChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { platform: CounterPlatform; username: string }) => input)
  .handler(async ({ data, context }) =>
    resolveChannelSnapshot({
      userId: context.userId,
      platform: data.platform,
      username: data.username,
    }),
  );

export type ChannelSearchHit = {
  platform: "TWITCH";
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isLive: boolean;
};

/**
 * Official Twitch Helix channel search. Kick has no documented search helper
 * in this codebase — do not scrape Kick for autocomplete.
 */
export const searchTwitchChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<ChannelSearchHit[]> => {
    const query = data.query.trim().replace(/^@/, "");
    if (query.length < 2) return [];

    const clientId = process.env["TWITCH_CLIENT_ID"];
    const token = await twitchAppToken();
    if (!clientId || !token) return [];

    const response = await fetch(
      `https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=8`,
      { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } },
    );
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      data?: {
        broadcaster_login?: string;
        display_name?: string;
        thumbnail_url?: string;
        is_live?: boolean;
      }[];
    };

    const hits: ChannelSearchHit[] = [];
    for (const row of payload.data ?? []) {
      const username = row.broadcaster_login?.trim();
      if (!username) continue;
      hits.push({
        platform: "TWITCH",
        username,
        displayName: row.display_name?.trim() || username,
        avatarUrl: row.thumbnail_url ?? null,
        isLive: Boolean(row.is_live),
      });
    }
    return hits;
  });
