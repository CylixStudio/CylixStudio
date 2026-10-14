import {
  discordInviteCode,
  googleFaviconUrl,
  hostnameFromLink,
  instagramPostUrl,
  kickUsernameFromUrl,
  sanitizeHandle,
  sanitizePlatform,
  tiktokVideoUrl,
  twitchUsernameFromUrl,
  twitterStatusUrl,
  urlFromHandle,
  youtubeTargetFromUrl,
  type LinkInBioState,
  type LinkPlatform,
  type LinkTilePreview,
} from "@/lib/linkInBio";
import type { PlatformLivePreviewData } from "@/lib/linkInBioLive";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function jsonGet<T>(url: string, headers?: HeadersInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": BROWSER_UA, ...headers },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function youtubeApiConfigured(): boolean {
  return Boolean(process.env["YOUTUBE_API_KEY"]);
}

async function previewKickTwitchYoutube(
  platform: "kick" | "twitch" | "youtube",
  value: string,
  options?: { includeLatest?: boolean },
): Promise<PlatformLivePreviewData> {
  const href = urlFromHandle(platform, value);
  const { kickStatus, twitchStatus, youtubeStatus } = await import("@/lib/linkInBio.server");
  if (platform === "kick") {
    const username = kickUsernameFromUrl(href) ?? sanitizeHandle(value).toLowerCase();
    if (!username) return { kind: "quiet", message: "Not live" };
    const hit = await kickStatus(username, href || `https://kick.com/${username}`);
    if (hit.live) {
      return {
        kind: "live",
        platform: "kick",
        title: hit.live.title,
        viewers: hit.live.viewers,
        thumbnailUrl: hit.thumbnailUrl,
        watchUrl: hit.live.watchUrl,
      };
    }
    return {
      kind: "offline",
      message: hit.offline?.latest ? "Last stream" : "Not live",
      title: hit.offline?.latest?.title ?? null,
      thumbnailUrl: hit.thumbnailUrl,
      watchUrl: hit.offline?.latest?.url ?? hit.offline?.channelUrl ?? href,
    };
  }
  if (platform === "twitch") {
    const username = twitchUsernameFromUrl(href) ?? sanitizeHandle(value).toLowerCase();
    if (!username) return { kind: "quiet", message: "Not live" };
    const hit = await twitchStatus(username, href || `https://www.twitch.tv/${username}`);
    if (hit.live) {
      return {
        kind: "live",
        platform: "twitch",
        title: hit.live.title,
        viewers: hit.live.viewers,
        thumbnailUrl: hit.thumbnailUrl,
        watchUrl: hit.live.watchUrl,
      };
    }
    return {
      kind: "offline",
      message: hit.offline?.latest ? "Last VOD" : "Not live",
      title: hit.offline?.latest?.title ?? null,
      thumbnailUrl: hit.thumbnailUrl,
      watchUrl: hit.offline?.latest?.url ?? hit.offline?.channelUrl ?? href,
    };
  }
  if (!youtubeApiConfigured()) {
    return { kind: "need_key", message: "Connect YouTube API to show the latest video." };
  }
  const target = youtubeTargetFromUrl(href) ?? { handle: sanitizeHandle(value), channelId: null };
  if (!target.handle && !target.channelId) return { kind: "quiet", message: "No video yet" };
  const hit = await youtubeStatus(target, href || null, { includeLatest: options?.includeLatest !== false });
  if (hit.live) {
    return {
      kind: "live",
      platform: "youtube",
      title: hit.live.title,
      viewers: hit.live.viewers,
      thumbnailUrl: hit.thumbnailUrl,
      watchUrl: hit.live.watchUrl,
    };
  }
  if (hit.offline?.latest) {
    return {
      kind: "offline",
      message: "Latest video",
      title: hit.offline.latest.title,
      thumbnailUrl: hit.offline.latest.thumbnailUrl,
      watchUrl: hit.offline.latest.url,
    };
  }
  return { kind: "quiet", message: "No video yet" };
}

async function previewTikTok(value: string): Promise<PlatformLivePreviewData> {
  const video = tiktokVideoUrl(value);
  if (video) {
    const data = await cached(`tiktok:${video}`, () =>
      jsonGet<{ title?: string; author_name?: string; thumbnail_url?: string; author_url?: string }>(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(video)}`,
      ),
    );
    if (!data) return { kind: "quiet", message: "Can't preview this video" };
    return {
      kind: "media",
      title: data.title ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
      author: data.author_name ?? null,
      watchUrl: video,
    };
  }
  const href = urlFromHandle("tiktok", value);
  if (!href) return { kind: "empty" };
  const handle = sanitizeHandle(value) || hostnameFromLink(href);
  return {
    kind: "profile",
    label: handle ? `@${handle.replace(/^@/, "")}` : "TikTok",
    href,
    message: "Paste a video URL to preview a clip.",
  };
}

async function previewInstagram(value: string): Promise<PlatformLivePreviewData> {
  const post = instagramPostUrl(value);
  if (post) {
    const token = process.env["INSTAGRAM_OEMBED_TOKEN"] ?? process.env["FACEBOOK_ACCESS_TOKEN"];
    const data = await cached(`ig:${post}`, async () => {
      if (token) {
        const graph = await jsonGet<{ thumbnail_url?: string; title?: string; author_name?: string }>(
          `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(post)}&access_token=${encodeURIComponent(token)}`,
        );
        if (graph) return graph;
      }
      return jsonGet<{ thumbnail_url?: string; title?: string; author_name?: string }>(
        `https://www.instagram.com/oembed/?url=${encodeURIComponent(post)}`,
      );
    });
    if (!data) return { kind: "quiet", message: "Can't preview this post" };
    return {
      kind: "media",
      title: data.title ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
      author: data.author_name ?? null,
      watchUrl: post,
    };
  }
  const href = urlFromHandle("instagram", value);
  if (!href) return { kind: "empty" };
  return {
    kind: "profile",
    label: sanitizeHandle(value) ? `@${sanitizeHandle(value)}` : "Instagram",
    href,
    message: "Paste a post or reel URL for a preview.",
  };
}

async function previewX(value: string): Promise<PlatformLivePreviewData> {
  const status = twitterStatusUrl(value);
  if (status) {
    const data = await cached(`x:${status}`, () =>
      jsonGet<{ author_name?: string; html?: string; url?: string; thumbnail_url?: string }>(
        `https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(status)}`,
      ),
    );
    if (!data) return { kind: "quiet", message: "Can't preview this post" };
    return {
      kind: "media",
      title: data.author_name ? `Post by ${data.author_name}` : "Post on X",
      thumbnailUrl: data.thumbnail_url ?? null,
      author: data.author_name ?? null,
      watchUrl: data.url ?? status,
    };
  }
  const href = urlFromHandle("x", value);
  if (!href) return { kind: "empty" };
  const handle = sanitizeHandle(value);
  return {
    kind: "profile",
    label: handle ? `@${handle}` : "X",
    href: handle ? `https://x.com/intent/user?screen_name=${encodeURIComponent(handle)}` : href,
    message: "Paste a post URL to preview it.",
  };
}

async function previewDiscord(value: string): Promise<PlatformLivePreviewData> {
  const code = discordInviteCode(value);
  if (!code) return { kind: "quiet", message: "Paste a Discord invite" };
  const data = await cached(`discord:${code.toLowerCase()}`, () =>
    jsonGet<{
      guild?: { name?: string };
      approximate_member_count?: number;
      approximate_presence_count?: number;
    }>(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`),
  );
  if (!data) return { kind: "quiet", message: "Invite not found" };
  return {
    kind: "discord",
    name: data.guild?.name ?? null,
    members: typeof data.approximate_member_count === "number" ? data.approximate_member_count : null,
    online: typeof data.approximate_presence_count === "number" ? data.approximate_presence_count : null,
    inviteUrl: `https://discord.gg/${encodeURIComponent(code)}`,
  };
}

function previewCustom(value: string): PlatformLivePreviewData {
  const href = urlFromHandle("custom", value);
  const host = hostnameFromLink(href || value);
  if (!href || !host) return { kind: "empty" };
  return { kind: "favicon", host, faviconUrl: googleFaviconUrl(host), href };
}

export async function previewPlatformLive(
  platformRaw: string,
  valueRaw: string,
  options?: { includeLatest?: boolean },
): Promise<PlatformLivePreviewData> {
  const platform = sanitizePlatform(platformRaw);
  const value = valueRaw.trim().slice(0, 2048);
  if (!value || platform === "whatsapp" || platform === "snapchat") return { kind: "empty" };
  if (platform === "custom") return previewCustom(value);
  if (platform === "kick" || platform === "twitch" || platform === "youtube") {
    return previewKickTwitchYoutube(platform, value, options);
  }
  if (platform === "tiktok") return previewTikTok(value);
  if (platform === "instagram") return previewInstagram(value);
  if (platform === "x") return previewX(value);
  if (platform === "discord") return previewDiscord(value);
  return { kind: "empty" };
}

export async function enrichLinkTilePreviews(
  state: LinkInBioState,
  base: Partial<Record<LinkPlatform, LinkTilePreview>>,
): Promise<Partial<Record<LinkPlatform, LinkTilePreview>>> {
  const next = { ...base };
  const jobs: Promise<void>[] = [];
  for (const link of state.links) {
    if (!link.enabled || link.kind === "gallery") continue;
    if (link.platform === "tiktok" || link.platform === "instagram" || link.platform === "x") {
      const platform = link.platform;
      jobs.push(
        (async () => {
          const preview = await previewPlatformLive(platform, link.url);
          if (preview.kind === "media" && preview.thumbnailUrl) {
            next[platform] = { live: false, thumbnailUrl: preview.thumbnailUrl };
          }
        })(),
      );
    }
  }
  await Promise.all(jobs);
  return next;
}
