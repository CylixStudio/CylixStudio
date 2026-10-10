import { supabaseAdmin } from "@/lib/supabase/client.server";
import {
  extractMediaUrl,
  extractYouTubeId,
  MEDIA_URL_PATTERN,
  parseMediaUrl,
  type MediaPlatform,
  type ParsedMediaUrl,
} from "./mediaRequests";

export { extractYouTubeId, extractMediaUrl, parseMediaUrl, MEDIA_URL_PATTERN };

export type YouTubeMetadata = {
  videoId: string; url: string; title: string; thumbnailUrl: string | null;
  durationSeconds: number; viewCount: number | null; embeddable: boolean; source: "api" | "oembed";
  artist: string | null;
};

export type MediaMetadata = {
  platform: MediaPlatform;
  sourceId: string;
  url: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  viewCount: number | null;
  embeddable: boolean;
  source: "api" | "oembed" | "opengraph" | "fallback";
};

const INPUT_KEYS = new Set([
  "user_input", "userinput", "rawinput", "raw_input", "%rawinput%", "input",
  "optional_input", "user_message", "message", "text", "content", "prompt", "value",
]);


function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeRewardTitle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase() : "";
}

/** Deep-scans a Kick redemption payload for the viewer-submitted text. */
export function extractRedemptionInput(payload: unknown, depth = 0): string | null {
  if (depth > 5 || !payload) return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractRedemptionInput(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload === "string") return extractMediaUrl(payload);
  if (typeof payload !== "object") return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (typeof value === "string" && value.trim() && INPUT_KEYS.has(key.toLowerCase())) return value.trim();
  }
  for (const [, value] of entries) {
    if (value && typeof value === "object") {
      const found = extractRedemptionInput(value, depth + 1);
      if (found) return found;
    }
  }
  // Kick has changed the nesting of channel-point input between webhook
  // versions. A final serialized scan keeps URL extraction resilient without
  // treating unrelated text as the viewer's request.
  try { return extractMediaUrl(JSON.stringify(payload)); }
  catch { return null; }
}


function isoDurationSeconds(value: string): number {
  const m = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

export async function fetchYouTubeOEmbed(videoId: string): Promise<YouTubeMetadata> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("youtube_video_not_found");
  const json = await response.json() as { title?: string; thumbnail_url?: string; author_name?: string };
  if (!json.title) throw new Error("youtube_video_not_found");
  return {
    videoId, url: watchUrl, title: json.title, thumbnailUrl: json.thumbnail_url ?? null,
    durationSeconds: 0, viewCount: null, embeddable: true, source: "oembed",
    artist: json.author_name ?? null,
  };
}

export async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata> {
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key) {
    console.warn("YouTube API Key 403 — Bypassing strict metadata checks using oEmbed fallback");
    return fetchYouTubeOEmbed(videoId);
  }
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({ part: "snippet,contentDetails,statistics,status", id: videoId, key }).toString();
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`youtube_api_${response.status}`);
    const json = await response.json() as { items?: Array<{ snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string,{url?:string}> }; contentDetails?: { duration?: string }; statistics?: { viewCount?: string }; status?: { embeddable?: boolean; privacyStatus?: string } }> };
    const item = json.items?.[0];
    if (!item?.snippet?.title || !item.contentDetails?.duration) throw new Error("youtube_video_not_found");
    const thumbnails = item.snippet.thumbnails ?? {};
    const thumbnailUrl = thumbnails["maxres"]?.url ?? thumbnails["standard"]?.url ?? thumbnails["high"]?.url ?? null;
    return {
      videoId, url: `https://www.youtube.com/watch?v=${videoId}`, title: item.snippet.title,
      thumbnailUrl, durationSeconds: isoDurationSeconds(item.contentDetails.duration),
      viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
      embeddable: item.status?.embeddable === true && item.status?.privacyStatus === "public",
      source: "api",
      artist: item.snippet.channelTitle ?? null,
    };
  } catch (error) {
    console.warn("YouTube API Key 403 — Bypassing strict metadata checks using oEmbed fallback", error instanceof Error ? error.message : error);
    return fetchYouTubeOEmbed(videoId);
  }
}

export async function checkYouTubeApiHealth(): Promise<"api" | "oembed"> {
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key) return "oembed";
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({ part: "status", id: "dQw4w9WgXcQ", key }).toString();
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    return response.ok ? "api" : "oembed";
  } catch { return "oembed"; }
}

function titleFromSlug(sourceId: string): string {
  const last = sourceId.includes(":") ? sourceId.split(":").pop() ?? sourceId : sourceId.split("/").pop() ?? sourceId;
  return decodeURIComponent(last).replace(/[-_]+/g, " ").trim() || "Requested track";
}

function asOEmbed(json: unknown): { title?: string; author_name?: string; thumbnail_url?: string } {
  return json && typeof json === "object" ? json as { title?: string; author_name?: string; thumbnail_url?: string } : {};
}

async function fetchOEmbedJson(endpoint: string): Promise<{ title?: string; author_name?: string; thumbnail_url?: string } | null> {
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return asOEmbed(await response.json());
  } catch {
    return null;
  }
}

function ogContent(html: string, prop: string): string | null {
  const property = html.match(new RegExp(`property=["']og:${prop}["'][^>]*content=["']([^"']+)`, "i"))?.[1]
    ?? html.match(new RegExp(`content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, "i"))?.[1];
  return property?.trim() || null;
}

async function fetchOpenGraph(url: string): Promise<{ title: string | null; artist: string | null; thumbnailUrl: string | null }> {
  try {
    const response = await fetch(url, { headers: { Accept: "text/html", "User-Agent": "CylixStudio/1.0" } });
    if (!response.ok) return { title: null, artist: null, thumbnailUrl: null };
    const html = (await response.text()).slice(0, 80_000);
    const rawTitle = ogContent(html, "title") ?? ogContent(html, "site_name");
    const title = rawTitle?.replace(/\s*[|·]\s*Anghami.*$/i, "").trim() ?? null;
    const description = ogContent(html, "description");
    const artist = description?.split(/[-–—|·]/)[0]?.trim() || null;
    return { title, artist, thumbnailUrl: ogContent(html, "image") };
  } catch {
    return { title: null, artist: null, thumbnailUrl: null };
  }
}

async function resolveRedirect(url: string): Promise<string> {
  try {
    const response = await fetch(url, { redirect: "follow", headers: { Accept: "text/html" } });
    return response.url || url;
  } catch {
    return url;
  }
}

function fallbackMeta(parsed: ParsedMediaUrl): MediaMetadata {
  return {
    platform: parsed.platform, sourceId: parsed.sourceId, url: parsed.url,
    title: titleFromSlug(parsed.sourceId), artist: null, thumbnailUrl: null,
    durationSeconds: 0, viewCount: null, embeddable: parsed.platform !== "YOUTUBE", source: "fallback",
  };
}

export async function fetchMediaMetadata(parsed: ParsedMediaUrl): Promise<MediaMetadata> {
  if (parsed.platform === "YOUTUBE") {
    const yt = await fetchYouTubeMetadata(parsed.sourceId);
    return {
      platform: "YOUTUBE", sourceId: yt.videoId, url: yt.url, title: yt.title, artist: yt.artist,
      thumbnailUrl: yt.thumbnailUrl, durationSeconds: yt.durationSeconds, viewCount: yt.viewCount,
      embeddable: yt.embeddable, source: yt.source,
    };
  }

  let resolved = parsed;
  if (parsed.platform === "SPOTIFY" && parsed.sourceId.startsWith("link:")) {
    const dest = await resolveRedirect(parsed.url);
    resolved = parseMediaUrl(dest) ?? parsed;
  }

  const oembedUrl = resolved.platform === "SPOTIFY"
    ? `https://open.spotify.com/oembed?url=${encodeURIComponent(resolved.url)}`
    : resolved.platform === "SOUNDCLOUD"
      ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(resolved.url)}`
      : `https://api.anghami.com/rest/v1/oembed.view?url=${encodeURIComponent(resolved.url)}`;
  const oembed = await fetchOEmbedJson(oembedUrl);
  if (oembed?.title) {
    return {
      platform: resolved.platform, sourceId: resolved.sourceId, url: resolved.url,
      title: oembed.title.replace(/\s*[|·]\s*Anghami.*$/i, "").trim() || oembed.title,
      artist: oembed.author_name ?? null, thumbnailUrl: oembed.thumbnail_url ?? null,
      durationSeconds: 0, viewCount: null, embeddable: true, source: "oembed",
    };
  }

  const og = await fetchOpenGraph(resolved.url);
  if (og.title) {
    return {
      platform: resolved.platform, sourceId: resolved.sourceId, url: resolved.url,
      title: og.title, artist: og.artist, thumbnailUrl: og.thumbnailUrl,
      durationSeconds: 0, viewCount: null, embeddable: true, source: "opengraph",
    };
  }
  return { ...fallbackMeta(resolved) };
}


export type KickReward = { id: string; title: string; cost: number };

async function kickAccessToken(userId: string): Promise<string | null> {
  const { getKickAccessToken } = await import("@/lib/platformTokens.server");
  return getKickAccessToken(userId);
}

function parseRewards(json: unknown): KickReward[] {
  const items = (json as { data?: unknown })?.data;
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const id = item["id"];
    const title = item["title"] ?? item["name"];
    if (id === undefined || id === null || typeof title !== "string") return [];
    return [{ id: String(id), title, cost: Number(item["cost"] ?? item["amount"] ?? 0) || 0 }];
  });
}

export async function listKickRewards(userId: string): Promise<{ rewards: KickReward[] } | { error: string }> {
  const token = await kickAccessToken(userId);
  if (!token) return { error: "kick_not_connected" };
  const response = await fetch("https://api.kick.com/public/v1/channels/rewards", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (response.status === 401 || response.status === 403) return { error: "kick_token_expired" };
  if (!response.ok) return { error: `kick_api_${response.status}` };
  return { rewards: parseRewards(await response.json()) };
}

export async function createKickMediaReward(userId: string, input: { title: string; cost: number }): Promise<{ reward: KickReward } | { error: string }> {
  const token = await kickAccessToken(userId);
  if (!token) return { error: "kick_not_connected" };
  const response = await fetch("https://api.kick.com/public/v1/channels/rewards", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      title: input.title, cost: input.cost, description: "Paste a YouTube, Spotify, Anghami, or SoundCloud link to request a track.",
      is_enabled: true, is_user_input_required: true, prompt: "Paste a YouTube, Spotify, Anghami, or SoundCloud link",
      should_redemptions_skip_request_queue: false,
    }),
  });
  if (response.status === 401 || response.status === 403) return { error: "kick_token_expired" };
  if (!response.ok) return { error: `kick_api_${response.status}` };
  const json = await response.json() as { data?: unknown };
  const single = Array.isArray(json.data) ? json.data[0] : json.data;
  const item = (single ?? {}) as Record<string, unknown>;
  const id = item["id"];
  if (id === undefined || id === null) return { error: "kick_reward_create_failed" };
  return { reward: { id: String(id), title: String(item["title"] ?? input.title), cost: Number(item["cost"] ?? input.cost) || input.cost } };
}

export async function rejectKickRedemption(userId: string, effectiveRedemptionId: string): Promise<boolean> {
  const token = await kickAccessToken(userId);
  if (!token) return false;
  const response = await fetch("https://api.kick.com/public/v1/channels/rewards/redemptions/reject", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: [effectiveRedemptionId] }),
  });
  return response.ok;
}

export async function acceptKickRedemption(userId: string, effectiveRedemptionId: string): Promise<boolean> {
  const token = await kickAccessToken(userId);
  if (!token) return false;
  const response = await fetch("https://api.kick.com/public/v1/channels/rewards/redemptions/accept", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: [effectiveRedemptionId] }),
  });
  return response.ok;
}

export async function ingestKickMediaRedemption(input: { messageId: string; body: Record<string, unknown> }) {
  const { body, messageId } = input;
  console.log("Kick Redemption Received:", JSON.stringify({ messageId, payload: body }));
  const envelope = firstRecord(body["event"], body["data"], body) ?? body;
  const nestedData = firstRecord(envelope["data"]);
  const redemption = firstRecord(envelope["redemption"], nestedData?.["redemption"], envelope) ?? envelope;
  const broadcaster = firstRecord(redemption["broadcaster"], envelope["broadcaster"], nestedData?.["broadcaster"]);
  const reward = firstRecord(redemption["reward"], envelope["reward"], nestedData?.["reward"]);
  const redeemer = firstRecord(
    redemption["redeemer"], redemption["user"],
    envelope["redeemer"], envelope["user"], nestedData?.["redeemer"], nestedData?.["user"],
  );
  const broadcasterId = firstString(
    broadcaster?.["user_id"], broadcaster?.["id"], broadcaster?.["channel_id"],
    redemption["broadcaster_user_id"], redemption["broadcaster_id"], redemption["channel_id"],
  );
  const rewardId = firstString(
    reward?.["id"], reward?.["reward_id"], redemption["reward_id"], envelope["reward_id"],
  );
  const rewardTitle = firstString(reward?.["title"], reward?.["name"], redemption["reward_title"]);
  const redemptionId = firstString(redemption["id"], redemption["redemption_id"], envelope["redemption_id"], messageId);
  const providerEventId = messageId || `kick-redemption-${redemptionId || crypto.randomUUID()}`;
  const redemptionStatus = firstString(redemption["status"], envelope["status"]);
  if (!broadcasterId) {
    console.log("Media Request DB Insert Result:", null, "missing_broadcaster_identity");
    return { status: "ignored" as const, reason: "missing_broadcaster_identity" };
  }
  // Identity beyond the broadcaster is optional: a valid media link is enough.
  const effectiveRedemptionId = redemptionId || `kick-chat-${providerEventId}`;
  // Reward identity is optional: fall back to a stable title-derived id so a
  // valid media link from a connected Kick account is never blocked solely
  // because Kick omitted (or remapped) the reward id. A valid media URL is enough.
  const effectiveRewardId = rewardId ?? `kick-reward-${normalizeRewardTitle(rewardTitle ?? "media-request") || "unmapped"}`;
  if (redemptionStatus && !["pending", "unfulfilled", "requested"].includes(redemptionStatus.toLowerCase())) {
    return { status: "ignored" as const, reason: "redemption_not_pending" };
  }
  const { data: connection } = await supabaseAdmin.from("platform_connections").select("user_id")
    .eq("platform", "KICK").eq("platform_user_id", broadcasterId).eq("is_active", true).maybeSingle();
  if (!connection) return { status: "ignored" as const, reason: "kick_connection_not_found" };
  const { userHasActivePro } = await import("@/lib/subscription.server");
  if (!(await userHasActivePro(supabaseAdmin, connection.user_id))) {
    return { status: "ignored" as const, reason: "pro_required" };
  }
  const { data: settings } = await supabaseAdmin.from("media_request_settings").select(
    "user_id,kick_reward_id,request_mode,require_approval,keyword_blacklist,user_blacklist,max_duration_seconds,min_view_count",
  )
    .eq("user_id", connection.user_id).maybeSingle();
  if (!settings) return { status: "ignored" as const, reason: "media_request_settings_not_found" };
  // Prefer the immutable reward id. If Kick recreated the reward and changed
  // its id, allow the same normalized title to continue working.
  if (rewardId && settings.kick_reward_id && settings.kick_reward_id !== rewardId) {
    const selectedRewards = await listKickRewards(connection.user_id);
    const selectedTitle = "rewards" in selectedRewards
      ? selectedRewards.rewards.find((item) => item.id === settings.kick_reward_id)?.title
      : null;
    if (!selectedTitle || normalizeRewardTitle(selectedTitle) !== normalizeRewardTitle(rewardTitle)) {
      return { status: "ignored" as const, reason: "reward_mismatch" };
    }
  }
  const username = firstString(redeemer?.["username"], redeemer?.["name"], redemption["username"]) || "Unknown";
  const reject = async (reason: string) => {
    const refunded = await rejectKickRedemption(connection.user_id, effectiveRedemptionId);
    console.log("Media Request DB Insert Result:", null, JSON.stringify({ reason, refunded, effectiveRedemptionId, rewardId }));
    return { status: "rejected" as const, reason, refunded };
  };
  if (settings.user_blacklist.some((v) => v.toLowerCase() === username.toLowerCase())) return reject("user_blacklisted");
  const directInput = firstString(
    redemption["user_input"], redemption["userInput"], redemption["message"],
    nestedData?.["user_input"], envelope["user_input"], envelope["userInput"], envelope["message"],
  );
  let serializedUrl: string | null = null;
  try { serializedUrl = extractMediaUrl(JSON.stringify(body)); } catch { /* malformed objects are rejected below */ }
  const deepInput = extractRedemptionInput(body);
  const extractedUrl = extractMediaUrl(directInput)
    ?? serializedUrl
    ?? (deepInput ? extractMediaUrl(deepInput) : null)
    ?? directInput
    ?? deepInput;
  console.log("Extracted Media Link:", extractedUrl);
  const parsed = parseMediaUrl(String(extractedUrl ?? ""));

  if (!parsed) return reject("invalid_media_url");
  const { data: priorRedemption } = await supabaseAdmin.from("media_requests").select("id")
    .eq("user_id", connection.user_id).eq("reward_redemption_id", effectiveRedemptionId).maybeSingle();
  if (priorRedemption) return { status: "duplicate" as const, requestId: priorRedemption.id };
  let meta: MediaMetadata;
  try { meta = await fetchMediaMetadata(parsed); } catch (error) { return reject(error instanceof Error ? error.message : "media_validation_failed"); }

  const title = meta.title.toLowerCase();
  if (settings.keyword_blacklist.some((word) => word.trim() && title.includes(word.trim().toLowerCase()))) return reject("keyword_blacklisted");
  const { data: duplicate } = await supabaseAdmin.from("media_requests").select("id").eq("user_id", connection.user_id)
    .eq("youtube_video_id", meta.sourceId).in("status", ["PENDING", "QUEUED", "PLAYING"]).maybeSingle();
  // A reward can surface through both chat.message.sent and the dedicated
  // redemption webhook. Treat the second delivery as successful deduplication
  // instead of rejecting/refunding a valid request.
  if (duplicate) return { status: "duplicate" as const, requestId: duplicate.id };
  if (resolveRequestMode(settings) === "PAUSED") return reject("requests_paused");
  const status = resolveRequestMode(settings) === "MANUAL" ? "PENDING" : "QUEUED";
  const { data: tail } = await supabaseAdmin.from("media_requests").select("position").eq("user_id", connection.user_id)
    .in("status", ["PENDING", "QUEUED"]).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data: result, error } = await supabaseAdmin.from("media_requests").insert({
    user_id: connection.user_id, provider_event_id: providerEventId, reward_redemption_id: effectiveRedemptionId, reward_id: effectiveRewardId,
    requester_platform_id: firstString(redeemer?.["user_id"], redeemer?.["id"]), requester_username: username,
    requester_avatar_url: firstString(redeemer?.["profile_picture"], redeemer?.["profile_picture_url"], redeemer?.["avatar"]) || null,
    platform: meta.platform, artist: meta.artist,
    youtube_video_id: meta.sourceId, youtube_url: meta.url, title: meta.title, thumbnail_url: meta.thumbnailUrl,
    duration_seconds: meta.durationSeconds, view_count: meta.viewCount, status, position: Number(tail?.position ?? 0) + 1,
    approved_at: status === "QUEUED" ? new Date().toISOString() : null,
  }).select("id,status,position,youtube_url,requester_username").single();
  console.log("Media Request DB Insert Result:", result, error);
  if (error) return error.code === "23505" ? reject("duplicate_video") : { status: "error" as const, reason: error.message };
  if (status === "QUEUED") await acceptKickRedemption(connection.user_id, effectiveRedemptionId);
  return { status: status.toLowerCase() };
}

/** Resolves the effective acceptance mode, falling back to the legacy flag. */
function resolveRequestMode(settings: { request_mode?: string | null; require_approval: boolean }): "AUTO" | "MANUAL" | "PAUSED" {
  const mode = settings.request_mode;
  if (mode === "AUTO" || mode === "MANUAL" || mode === "PAUSED") return mode;
  return settings.require_approval ? "MANUAL" : "AUTO";
}

/**
 * Kick surfaces channel-point redemptions as chat messages such as
 * "<user> has redeemed Media Request https://youtu.be/...". This ingests those
 * directly from the chat stream so the queue never depends on reward webhooks.
 */
export async function ingestChatMediaRequest(input: {
  userId: string; messageId: string; username: string; text: string;
}): Promise<{ ok: true; status: "pending" | "queued"; title: string } | { ok: false; reason: string }> {
  const { userId, messageId, username, text } = input;
  const { userHasActivePro } = await import("@/lib/subscription.server");
  if (!(await userHasActivePro(supabaseAdmin, userId))) return { ok: false, reason: "pro_required" };
  const { data: settings } = await supabaseAdmin.from("media_request_settings").select(
    "user_id,kick_reward_id,request_mode,require_approval,keyword_blacklist,user_blacklist,max_duration_seconds,min_view_count",
  ).eq("user_id", userId).maybeSingle();
  if (!settings) return { ok: false, reason: "media_request_settings_not_found" };

  const url = extractMediaUrl(text);
  if (!url) return { ok: false, reason: "no_media_link" };
  if (resolveRequestMode(settings) === "PAUSED") return { ok: false, reason: "requests_paused" };

  // Any chat message carrying a supported media link becomes a request: Kick
  // surfaces redemptions inconsistently, so trigger text is treated as optional.

  if (settings.user_blacklist.some((v) => v.toLowerCase() === username.toLowerCase())) {
    return { ok: false, reason: "user_blacklisted" };
  }
  const parsed = parseMediaUrl(url);
  if (!parsed) return { ok: false, reason: "invalid_media_url" };

  const providerEventId = `kick-chat-${messageId}`;
  const { data: prior } = await supabaseAdmin.from("media_requests").select("id")
    .eq("user_id", userId).eq("provider_event_id", providerEventId).maybeSingle();
  if (prior) return { ok: false, reason: "duplicate_message" };

  let meta: MediaMetadata;
  try { meta = await fetchMediaMetadata(parsed); }
  catch { return { ok: false, reason: "media_validation_failed" }; }
  const title = meta.title.toLowerCase();
  if (settings.keyword_blacklist.some((word) => word.trim() && title.includes(word.trim().toLowerCase()))) {
    return { ok: false, reason: "keyword_blacklisted" };
  }
  const { data: duplicate } = await supabaseAdmin.from("media_requests").select("id").eq("user_id", userId)
    .eq("youtube_video_id", meta.sourceId).in("status", ["PENDING", "QUEUED", "PLAYING"]).maybeSingle();
  if (duplicate) return { ok: false, reason: "duplicate_video" };

  const status = resolveRequestMode(settings) === "MANUAL" ? "PENDING" : "QUEUED";
  const { data: tail } = await supabaseAdmin.from("media_requests").select("position").eq("user_id", userId)
    .in("status", ["PENDING", "QUEUED"]).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data: inserted, error } = await supabaseAdmin.from("media_requests").insert({
    user_id: userId, provider_event_id: providerEventId, requester_username: username || "Kick viewer",
    platform: meta.platform, artist: meta.artist,
    youtube_video_id: meta.sourceId, youtube_url: meta.url, title: meta.title, thumbnail_url: meta.thumbnailUrl,
    duration_seconds: meta.durationSeconds, view_count: meta.viewCount, status,
    position: Number(tail?.position ?? 0) + 1, approved_at: status === "QUEUED" ? new Date().toISOString() : null,
  }).select("id").single();
  if (error || !inserted) return { ok: false, reason: error?.message ?? "insert_failed" };
  if (status === "QUEUED") await startIfIdle(userId, inserted.id);
  return { ok: true, status: status === "QUEUED" ? "queued" : "pending", title: meta.title };
}

/** Starts playback when the player is idle so approved videos play immediately. */
export async function startIfIdle(userId: string, requestId: string): Promise<void> {
  const { data: playback } = await supabaseAdmin.from("media_playback_state")
    .select("current_request_id,playback_status").eq("user_id", userId).maybeSingle();
  if (playback?.current_request_id && playback.playback_status !== "IDLE") return;
  await supabaseAdmin.from("media_requests").update({ status: "PLAYING" }).eq("id", requestId);
  await supabaseAdmin.from("media_playback_state").upsert({
    user_id: userId, current_request_id: requestId, playback_status: "PLAYING",
    position_seconds: 0, started_at: new Date().toISOString(), revision: Date.now(),
  }, { onConflict: "user_id" });
}

/**
 * Marks the finished video as played and immediately promotes the next
 * approved request so the queue keeps rolling without manual clicks.
 */
export async function advanceQueue(userId: string, finishedRequestId?: string | null): Promise<{ nextId: string | null }> {
  const { data: playback } = await supabaseAdmin.from("media_playback_state")
    .select("current_request_id").eq("user_id", userId).maybeSingle();
  const finished = finishedRequestId ?? playback?.current_request_id ?? null;
  if (finished) {
    await supabaseAdmin.from("media_requests")
      .update({ status: "PLAYED", played_at: new Date().toISOString() }).eq("id", finished).eq("user_id", userId);
  }
  const { data: next } = await supabaseAdmin.from("media_requests").select("id")
    .eq("user_id", userId).eq("status", "QUEUED")
    .order("position", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!next) {
    await supabaseAdmin.from("media_playback_state").upsert({
      user_id: userId, current_request_id: null, playback_status: "IDLE",
      position_seconds: 0, started_at: null, revision: Date.now(),
    }, { onConflict: "user_id" });
    return { nextId: null };
  }
  await supabaseAdmin.from("media_requests").update({ status: "PLAYING" }).eq("id", next.id);
  await supabaseAdmin.from("media_playback_state").upsert({
    user_id: userId, current_request_id: next.id, playback_status: "PLAYING",
    position_seconds: 0, started_at: new Date().toISOString(), revision: Date.now(),
  }, { onConflict: "user_id" });
  return { nextId: next.id };
}
