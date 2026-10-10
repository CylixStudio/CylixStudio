import {
  collectStreamTargets,
  normalizeLink,
  publicLinkInBioPayload,
  sanitizeCardSizeOption,
  sanitizeColSpan,
  sanitizeGalleryImages,
  sanitizeKind,
  sanitizePlatform,
  sanitizeProfile,
  sanitizeRowSpan,
  DEFAULT_THEME,
  linkInBioThemeRequiresPro,
  sanitizeTheme,
  type LinkInBioState,
  type LinkPlatform,
  type LinkTilePreview,
  type LivePlatformFlags,
  type PublicLinkInBio,
  type StreamStatus,
} from "@/lib/linkInBio";
import { supabaseAdmin } from "@/lib/supabase/client.server";

type ProfileRow = {
  user_id: string;
  slug: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  header_url?: string;
  published: boolean;
  published_at: string | null;
  setup_completed?: boolean;
  username_changed_at?: string | null;
};

type ThemeRow = {
  glass_intensity: number;
  hairline_borders: boolean;
  glow_strength: number;
  gradient_style: string;
  font_family: string;
  font_custom_name?: string;
  font_custom_href?: string;
  palette_bg: string;
  palette_fg: string;
  palette_accent: string;
  palette_muted: string;
  surface_style: string;
  layout: string;
  default_card_size: string;
  ambient_enabled?: boolean;
  ambient_preset?: string;
  schedule_enabled?: boolean;
  widget_banner_url?: string;
  countdown_enabled?: boolean;
  countdown_label?: string;
  countdown_ends_at?: string | null;
  bento_color_mode?: string;
  bento_custom_fill?: string;
  bento_custom_accent?: string;
};

type LinkRow = {
  id: string;
  title: string;
  url: string;
  platform: string;
  card_size: string;
  sort_order: number;
  featured: boolean;
  enabled: boolean;
  kind?: string;
  grid_x?: number;
  grid_y?: number;
  col_span?: number;
  row_span?: number;
  gallery_images?: unknown;
  created_at: string;
  updated_at: string;
};

function mapState(
  profile: ProfileRow,
  theme: ThemeRow,
  links: LinkRow[],
  kickUsername: string | null,
  twitchUsername: string | null,
): LinkInBioState {
  return {
    profile: sanitizeProfile({
      slug: profile.slug,
      displayName: profile.display_name,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      headerUrl: profile.header_url ?? "",
      published: profile.published,
      publishedAt: profile.published_at,
      setupCompleted: Boolean(profile.setup_completed),
      usernameChangedAt: profile.username_changed_at ?? null,
    }),
    theme: sanitizeTheme({
      glassIntensity: theme.glass_intensity,
      hairlineBorders: theme.hairline_borders,
      glowStrength: theme.glow_strength,
      gradientStyle: theme.gradient_style as LinkInBioState["theme"]["gradientStyle"],
      fontFamily: theme.font_family,
      fontCustomName: theme.font_custom_name ?? "",
      fontCustomHref: theme.font_custom_href ?? "",
      paletteBg: theme.palette_bg,
      paletteFg: theme.palette_fg,
      paletteAccent: theme.palette_accent,
      paletteMuted: theme.palette_muted,
      surfaceStyle: theme.surface_style as LinkInBioState["theme"]["surfaceStyle"],
      layout: theme.layout as LinkInBioState["theme"]["layout"],
      defaultCardSize: theme.default_card_size as LinkInBioState["theme"]["defaultCardSize"],
      ambientEnabled: theme.ambient_enabled !== false,
      ambientPreset: theme.ambient_preset as LinkInBioState["theme"]["ambientPreset"],
      scheduleEnabled: Boolean(theme.schedule_enabled),
      widgetBannerUrl: theme.widget_banner_url ?? "",
      countdownEnabled: Boolean(theme.countdown_enabled),
      countdownLabel: theme.countdown_label ?? "",
      countdownEndsAt: theme.countdown_ends_at ?? null,
      bentoColorMode: theme.bento_color_mode as LinkInBioState["theme"]["bentoColorMode"],
      bentoCustomFill: theme.bento_custom_fill ?? "",
      bentoCustomAccent: theme.bento_custom_accent ?? "",
    }),
    links: links.map((row, index) =>
      normalizeLink({
        id: row.id,
        title: row.title,
        url: row.url,
        platform: sanitizePlatform(row.platform),
        cardSize: sanitizeCardSizeOption(row.card_size),
        sortOrder: row.sort_order,
        featured: row.featured,
        enabled: row.enabled,
        kind: sanitizeKind(row.kind ?? "link"),
        gridX: row.grid_x,
        gridY: row.grid_y,
        colSpan: sanitizeColSpan(row.col_span),
        rowSpan: sanitizeRowSpan(row.row_span),
        galleryImages: sanitizeGalleryImages(row.gallery_images),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }, index),
    ),
    kickUsername,
    twitchUsername,
    scheduleShareToken: null,
    scheduleTitle: null,
  };
}

const STATUS_TTL_MS = 60_000;
const statusCache = new Map<string, { at: number; value: unknown }>();

async function cachedStatus<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = statusCache.get(key);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.value as T;
  const value = await fn();
  statusCache.set(key, { at: Date.now(), value });
  return value;
}

function kickThumbnailUrl(raw: { url?: string } | string | null | undefined): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw.startsWith("http") ? raw : null;
  return raw.url?.startsWith("http") ? raw.url : null;
}

async function jsonGet<T>(url: string, headers?: HeadersInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function twitchAppToken(): Promise<string | null> {
  const id = process.env["TWITCH_CLIENT_ID"];
  const secret = process.env["TWITCH_CLIENT_SECRET"];
  if (!id || !secret) return null;
  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { access_token?: string };
    return body.access_token ?? null;
  } catch {
    return null;
  }
}

type LiveHit = Extract<StreamStatus, { kind: "live" }>;
type OfflineHit = Extract<StreamStatus, { kind: "offline" }>;

/** Official Helix: users + streams (+ latest archive VOD when offline). */
export async function twitchStatus(
  username: string,
  channelUrl: string,
): Promise<{ live: LiveHit | null; offline: OfflineHit | null; thumbnailUrl: string | null }> {
  return cachedStatus(`twitch:${username.toLowerCase()}`, () => twitchStatusUncached(username, channelUrl));
}

async function twitchStatusUncached(
  username: string,
  channelUrl: string,
): Promise<{ live: LiveHit | null; offline: OfflineHit | null; thumbnailUrl: string | null }> {
  const clientId = process.env["TWITCH_CLIENT_ID"];
  const token = await twitchAppToken();
  if (!clientId || !token) {
    return { live: null, offline: { kind: "offline", platform: "twitch", latest: null, channelUrl }, thumbnailUrl: null };
  }
  const headers = { Authorization: `Bearer ${token}`, "Client-Id": clientId };
  const users = await jsonGet<{ data?: { id: string; login: string }[] }>(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`,
    headers,
  );
  const user = users?.data?.[0];
  if (!user) {
    return { live: null, offline: { kind: "offline", platform: "twitch", latest: null, channelUrl }, thumbnailUrl: null };
  }
  const streams = await jsonGet<{ data?: { viewer_count?: number; title?: string }[] }>(
    `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(user.id)}`,
    headers,
  );
  const stream = streams?.data?.[0];
  if (stream) {
    return {
      live: {
        kind: "live",
        platform: "twitch",
        title: stream.title ?? null,
        viewers: typeof stream.viewer_count === "number" ? stream.viewer_count : null,
        watchUrl: `https://www.twitch.tv/${encodeURIComponent(user.login)}`,
      },
      offline: null,
      thumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.login}-440x248.jpg`,
    };
  }
  const videos = await jsonGet<{ data?: { title?: string; url?: string; thumbnail_url?: string }[] }>(
    `https://api.twitch.tv/helix/videos?user_id=${encodeURIComponent(user.id)}&first=1&type=archive`,
    headers,
  );
  const vod = videos?.data?.[0];
  const thumbnailUrl = vod?.thumbnail_url?.replace("%{width}", "480").replace("%{height}", "270") ?? null;
  return {
    live: null,
    offline: {
      kind: "offline",
      platform: "twitch",
      latest: vod?.url
        ? {
            title: vod.title ?? "Latest stream",
            url: vod.url,
            thumbnailUrl,
          }
        : null,
      channelUrl,
    },
    thumbnailUrl,
  };
}

type PlatformHit = { live: LiveHit | null; offline: OfflineHit | null; thumbnailUrl: string | null };

/** Official YouTube Data API v3 — skipped honestly when YOUTUBE_API_KEY is unset. */
export async function youtubeStatus(
  target: { handle: string | null; channelId: string | null },
  channelUrl: string | null,
): Promise<PlatformHit> {
  const cacheKey = `youtube:${(target.channelId ?? target.handle ?? "").toLowerCase()}`;
  return cachedStatus(cacheKey, () => youtubeStatusUncached(target, channelUrl));
}

async function youtubeStatusUncached(
  target: { handle: string | null; channelId: string | null },
  channelUrl: string | null,
): Promise<PlatformHit> {
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key) {
    return { live: null, offline: { kind: "offline", platform: "youtube", latest: null, channelUrl }, thumbnailUrl: null };
  }
  let channelId = target.channelId;
  if (!channelId && target.handle) {
    const qs = new URLSearchParams({ part: "id", forHandle: target.handle.replace(/^@/, ""), key });
    const channels = await jsonGet<{ items?: { id?: string }[] }>(
      `https://www.googleapis.com/youtube/v3/channels?${qs.toString()}`,
    );
    channelId = channels?.items?.[0]?.id ?? null;
  }
  if (!channelId) {
    return { live: null, offline: { kind: "offline", platform: "youtube", latest: null, channelUrl }, thumbnailUrl: null };
  }
  const liveQs = new URLSearchParams({
    part: "snippet",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "1",
    key,
  });
  const liveSearch = await jsonGet<{ items?: { id?: { videoId?: string }; snippet?: { title?: string } }[] }>(
    `https://www.googleapis.com/youtube/v3/search?${liveQs.toString()}`,
  );
  const liveId = liveSearch?.items?.[0]?.id?.videoId;
  if (liveId) {
    const details = await jsonGet<{
      items?: { snippet?: { title?: string }; liveStreamingDetails?: { concurrentViewers?: string } }[];
    }>(
      `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({
        part: "snippet,liveStreamingDetails",
        id: liveId,
        key,
      }).toString()}`,
    );
    const item = details?.items?.[0];
    const viewers = item?.liveStreamingDetails?.concurrentViewers
      ? Number(item.liveStreamingDetails.concurrentViewers)
      : null;
    return {
      live: {
        kind: "live",
        platform: "youtube",
        title: item?.snippet?.title ?? liveSearch.items?.[0]?.snippet?.title ?? null,
        viewers: Number.isFinite(viewers) ? viewers : null,
        watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(liveId)}`,
      },
      offline: null,
      thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(liveId)}/hqdefault.jpg`,
    };
  }
  const latestQs = new URLSearchParams({
    part: "snippet",
    channelId,
    order: "date",
    type: "video",
    maxResults: "1",
    key,
  });
  const latest = await jsonGet<{
    items?: { id?: { videoId?: string }; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> } }[];
  }>(`https://www.googleapis.com/youtube/v3/search?${latestQs.toString()}`);
  const video = latest?.items?.[0];
  const videoId = video?.id?.videoId;
  const thumbs = video?.snippet?.thumbnails ?? {};
  const thumbnailUrl = thumbs["high"]?.url ?? thumbs["medium"]?.url ?? thumbs["default"]?.url ?? null;
  return {
    live: null,
    offline: {
      kind: "offline",
      platform: "youtube",
      latest: videoId
        ? {
            title: video?.snippet?.title ?? "Latest video",
            url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
            thumbnailUrl,
          }
        : null,
      channelUrl,
    },
    thumbnailUrl,
  };
}

/** Same Kick channel payload already used by mark-points / live counter. */
export async function kickStatus(username: string, channelUrl: string): Promise<PlatformHit> {
  return cachedStatus(`kick:${username.toLowerCase()}`, () => kickStatusUncached(username, channelUrl));
}

async function kickStatusUncached(username: string, channelUrl: string): Promise<PlatformHit> {
  const slug = encodeURIComponent(username.toLowerCase());
  const payload = await jsonGet<{
    slug?: string;
    livestream?: {
      is_live?: boolean;
      viewer_count?: number;
      session_title?: string;
      thumbnail?: { url?: string } | string | null;
    } | null;
    previous_livestreams?: {
      session_title?: string;
      thumbnail?: { url?: string } | string | null;
    }[];
  }>(`https://kick.com/api/v2/channels/${slug}`, {
    "accept-language": "en-US,en;q=0.9",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    referer: "https://kick.com/",
  });
  if (!payload) {
    return { live: null, offline: { kind: "offline", platform: "kick", latest: null, channelUrl }, thumbnailUrl: null };
  }
  if (payload.livestream?.is_live) {
    const thumbnailUrl = kickThumbnailUrl(payload.livestream.thumbnail);
    return {
      live: {
        kind: "live",
        platform: "kick",
        title: payload.livestream.session_title ?? null,
        viewers: payload.livestream.viewer_count ?? null,
        watchUrl: `https://kick.com/${encodeURIComponent(payload.slug ?? username)}`,
      },
      offline: null,
      thumbnailUrl,
    };
  }
  const previous = payload.previous_livestreams?.[0];
  const thumbnailUrl = kickThumbnailUrl(previous?.thumbnail);
  return {
    live: null,
    offline: {
      kind: "offline",
      platform: "kick",
      latest: previous
        ? {
            title: previous.session_title ?? "Last stream",
            url: channelUrl,
            thumbnailUrl,
          }
        : null,
      channelUrl,
    },
    thumbnailUrl,
  };
}

function streamTilePreview(hit: PlatformHit): LinkTilePreview | null {
  if (!hit.live && !hit.thumbnailUrl) return null;
  return { live: Boolean(hit.live), thumbnailUrl: hit.thumbnailUrl };
}

export async function resolveLinkInBioStream(state: LinkInBioState): Promise<{
  stream: StreamStatus | null;
  livePlatforms: LivePlatformFlags;
  tilePreviews: Partial<Record<LinkPlatform, LinkTilePreview>>;
}> {
  const targets = collectStreamTargets(state);
  const livePlatforms: LivePlatformFlags = { kick: false, twitch: false, youtube: false };
  const tilePreviews: Partial<Record<LinkPlatform, LinkTilePreview>> = {};
  if (!targets.kickUsername && !targets.twitchUsername && !targets.youtube) {
    return { stream: null, livePlatforms, tilePreviews };
  }

  const emptyHit: PlatformHit = { live: null, offline: null, thumbnailUrl: null };
  const [twitch, youtube, kick] = await Promise.all([
    targets.twitchUsername
      ? twitchStatus(targets.twitchUsername, targets.twitchUrl ?? `https://www.twitch.tv/${targets.twitchUsername}`)
      : Promise.resolve(emptyHit),
    targets.youtube ? youtubeStatus(targets.youtube, targets.youtubeUrl) : Promise.resolve(emptyHit),
    targets.kickUsername
      ? kickStatus(targets.kickUsername, targets.kickUrl ?? `https://kick.com/${targets.kickUsername}`)
      : Promise.resolve(emptyHit),
  ]);

  livePlatforms.twitch = Boolean(twitch.live);
  livePlatforms.youtube = Boolean(youtube.live);
  livePlatforms.kick = Boolean(kick.live);

  const twitchTile = streamTilePreview(twitch);
  const youtubeTile = streamTilePreview(youtube);
  const kickTile = streamTilePreview(kick);
  if (twitchTile) tilePreviews.twitch = twitchTile;
  if (youtubeTile) tilePreviews.youtube = youtubeTile;
  if (kickTile) tilePreviews.kick = kickTile;

  const live = twitch.live ?? youtube.live ?? kick.live;
  if (live) return { stream: live, livePlatforms, tilePreviews };

  if (youtube.offline?.latest) return { stream: youtube.offline, livePlatforms, tilePreviews };
  if (twitch.offline?.latest) return { stream: twitch.offline, livePlatforms, tilePreviews };
  const offline = twitch.offline ?? kick.offline ?? youtube.offline;
  if (offline) return { stream: offline, livePlatforms, tilePreviews };
  return {
    stream: { kind: "offline", platform: "profile", latest: null, channelUrl: null },
    livePlatforms,
    tilePreviews,
  };
}

export async function publicLinkInBioJson(slug: string): Promise<PublicLinkInBio | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const { data: profile } = await supabaseAdmin
    .from("link_in_bio_profiles")
    .select("user_id, slug, display_name, bio, avatar_url, header_url, published, published_at")
    .eq("slug", normalized)
    .eq("published", true)
    .maybeSingle();
  if (!profile) return null;
  const [{ data: theme }, { data: links }, { data: connections }, { data: schedule }] = await Promise.all([
    supabaseAdmin
      .from("link_in_bio_themes")
      .select(
        "glass_intensity, hairline_borders, glow_strength, gradient_style, font_family, font_custom_name, font_custom_href, palette_bg, palette_fg, palette_accent, palette_muted, surface_style, layout, default_card_size, ambient_enabled, ambient_preset, schedule_enabled, widget_banner_url, countdown_enabled, countdown_label, countdown_ends_at, bento_color_mode, bento_custom_fill, bento_custom_accent",
      )
      .eq("user_id", profile.user_id)
      .maybeSingle(),
    supabaseAdmin
      .from("link_in_bio_links")
      .select("id, title, url, platform, card_size, sort_order, featured, enabled, kind, grid_x, grid_y, col_span, row_span, gallery_images, created_at, updated_at")
      .eq("user_id", profile.user_id)
      .eq("enabled", true)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("platform_connections")
      .select("platform, username")
      .eq("user_id", profile.user_id)
      .eq("is_active", true),
    supabaseAdmin
      .from("stream_schedule_settings")
      .select("share_token, title")
      .eq("user_id", profile.user_id)
      .maybeSingle(),
  ]);
  if (!theme) return null;
  const kickUsername = connections?.find((row) => row.platform === "KICK")?.username?.trim().toLowerCase() ?? null;
  const twitchUsername = connections?.find((row) => row.platform === "TWITCH")?.username?.trim().toLowerCase() ?? null;
  const mapped = mapState(profile as ProfileRow, theme as ThemeRow, (links ?? []) as LinkRow[], kickUsername, twitchUsername);
  const { userHasActivePro } = await import("@/lib/subscription.server");
  const ownerPro = await userHasActivePro(supabaseAdmin, profile.user_id);
  const state = {
    ...mapped,
    theme: ownerPro || !linkInBioThemeRequiresPro(mapped.theme) ? mapped.theme : { ...DEFAULT_THEME },
    scheduleShareToken: schedule?.share_token ?? null,
    scheduleTitle: schedule?.title ?? null,
  };
  const extras = await resolveLinkInBioStream(state);
  const { enrichLinkTilePreviews } = await import("@/lib/linkInBioLive.server");
  const tilePreviews = await enrichLinkTilePreviews(state, extras.tilePreviews);
  return publicLinkInBioPayload(state, { ...extras, tilePreviews });
}
