import { liveStateFromLivestream, type KickLivestreamShape } from "@/lib/kickClipLive";
import { supabaseAdmin } from "@/lib/supabase/client.server";

/**
 * Prefer Kick's own clip endpoints (public v1, then the channel clip routes the
 * site uses) with the broadcaster token. Those return a kick.com clip page.
 * The rolling HLS buffer remains the fallback when that call does not yield a URL.
 */

const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5; // 5 years
/** Keep a few minutes of the live feed so `!clip 120` has material to cut. */
const BUFFER_WINDOW_SECONDS = 240;
/** Don't hammer the CDN: at most one playlist refresh per this many ms. */
const REFRESH_THROTTLE_MS = 8_000;
/** Playback URLs are signed and rotate, so re-resolve them periodically. */
const VARIANT_TTL_MS = 10 * 60 * 1000;
/** Upper bound for waiting on new segments when the buffer is still cold. */
const FORWARD_FILL_MS = 60_000;

/**
 * Channel reads with a long Chrome UA plus referer get HTTP 403.
 * `okhttp/4.12.0`, then a short `Mozilla/5.0`, get 200 from kick.com/api/v2.
 */
const KICK_CHANNEL_AGENTS = ["okhttp/4.12.0", "Mozilla/5.0"] as const;
const UA = { "User-Agent": KICK_CHANNEL_AGENTS[0] } as const;

type KickLivestream = KickLivestreamShape & {
  session_title?: string;
  thumbnail?: { url?: string } | null;
};

export type ChannelInfo = {
  slug: string;
  channelId: number | null;
  playbackUrl: string | null;
  /** True when Kick says live, false when the livestream object says not live, null when that object is missing. */
  liveState: boolean | null;
  isLive: boolean;
  title: string | null;
  thumbnail: string | null;
};

async function readKickJson(
  url: string,
  init: RequestInit,
  agents: readonly string[],
): Promise<{ status: number; json: unknown; text: string }> {
  let last = { status: 0, json: null as unknown, text: "" };
  for (const agent of agents) {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    headers.set("User-Agent", agent);
    const res = await fetch(url, { ...init, headers });
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
    }
    last = { status: res.status, json, text };
    if (res.status !== 403) return last;
  }
  return last;
}

export async function fetchKickChannel(slug: string): Promise<ChannelInfo | null> {
  try {
    const res = await readKickJson(
      `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`,
      { headers: { Accept: "application/json" } },
      KICK_CHANNEL_AGENTS,
    );
    if (res.status < 200 || res.status >= 300) {
      console.warn("[clip-capture] channel lookup failed", res.status, slug);
      return null;
    }
    const json = (res.json ?? {}) as {
      id?: number;
      slug?: string;
      playback_url?: string | null;
      livestream?: KickLivestream | null;
    };
    const liveState = liveStateFromLivestream(json.livestream);
    const channelId = typeof json.id === "number" && Number.isSafeInteger(json.id) ? json.id : null;
    return {
      slug: json.slug ?? slug,
      channelId,
      playbackUrl: json.playback_url ?? null,
      liveState,
      isLive: liveState === true,
      title: json.livestream?.session_title ?? null,
      thumbnail: json.livestream?.thumbnail?.url ?? null,
    };
  } catch (error) {
    console.error("[clip-capture] channel lookup error", error);
    return null;
  }
}

export type NativeKickClip = {
  externalId: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  duration: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textField(source: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function kickClipPage(slug: string, id: string): string {
  return `https://kick.com/${encodeURIComponent(slug)}/clips/${encodeURIComponent(id)}`;
}

function clipRecord(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data = root["data"];
  const fromData = Array.isArray(data) ? asRecord(data[0]) : asRecord(data);
  return asRecord(root["clip"]) ?? asRecord(fromData?.["clip"]) ?? fromData ?? root;
}

function parseNativeClip(slug: string, payload: unknown, fallbackDuration: number): NativeKickClip | null {
  const nested = clipRecord(payload);
  if (!nested) return null;
  const rawId = textField(nested, "id", "clip_id", "uuid");
  const explicit = textField(nested, "share_url", "page_url", "url", "clip_url");
  const fromMedia = explicit?.match(/clip_[A-Za-z0-9]+/)?.[0] ?? null;
  const id = rawId && /^clip_/i.test(rawId) ? rawId : fromMedia ?? rawId;
  const explicitPage =
    explicit && /kick\.com\//i.test(explicit) && !/\.m3u8(\?|$)/i.test(explicit) ? explicit : null;
  const page = explicitPage ?? (id && /^clip_/i.test(id) ? kickClipPage(slug, id) : null);
  if (!page) return null;
  const durationRaw = nested["duration"];
  const thumbRecord = asRecord(nested["thumbnail"]);
  return {
    externalId: id ?? page,
    url: page,
    title: textField(nested, "title"),
    thumbnail: textField(nested, "thumbnail_url") ?? textField(thumbRecord, "url"),
    duration: typeof durationRaw === "number" && durationRaw > 0 ? durationRaw : fallbackDuration,
  };
}

function responseSaysOffline(status: number, body: string): boolean {
  if (status === 409) return true;
  return /offline|not[_\s-]?live|no active (live)?stream|livestream not found|channel is not live/i.test(body);
}

/**
 * Creates a Kick clip with the broadcaster token already stored on the
 * platform connection. Tries the official public route, then the same
 * channel clip routes Kick's site uses. Does not log the token.
 */
export async function createNativeKickClip(input: {
  token: string;
  slug: string;
  duration: number;
  broadcasterUserId: string;
  channelId: number | null;
}): Promise<NativeKickClip | { error: string }> {
  const { token, slug, duration, broadcasterUserId, channelId } = input;
  const title = "Clip";
  const broadcasterId = Number(broadcasterUserId);
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const attempts: { url: string; init: RequestInit; agents: readonly string[] }[] = [
    {
      url: "https://api.kick.com/public/v1/clips",
      init: {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          ...(Number.isSafeInteger(broadcasterId) && broadcasterId > 0
            ? { broadcaster_user_id: broadcasterId }
            : {}),
          duration,
          title,
        }),
      },
      agents: ["okhttp/4.12.0"],
    },
    {
      url: `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/clips`,
      init: {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          duration,
          title,
          ...(channelId ? { channel_id: channelId } : {}),
        }),
      },
      agents: KICK_CHANNEL_AGENTS,
    },
  ];

  let offline = false;
  let lastError = "clip_api_failed";

  for (const attempt of attempts) {
    try {
      const res = await readKickJson(attempt.url, attempt.init, attempt.agents);
      if (res.status >= 200 && res.status < 300) {
        const parsed = parseNativeClip(slug, res.json, duration);
        if (parsed) {
          console.log("[clip-capture] kick clip created", { slug, status: res.status });
          return parsed;
        }
        console.warn("[clip-capture] kick clip response had no clip id", { slug, status: res.status });
        return { error: "clip_api_unparsed" };
      }
      if (responseSaysOffline(res.status, res.text)) offline = true;
      if (res.status) lastError = `clip_api_${res.status}`;
      console.warn("[clip-capture] kick clip endpoint declined", { slug, status: res.status });
    } catch (error) {
      console.error("[clip-capture] kick clip request error", error);
      lastError = "clip_api_failed";
    }
  }

  const initUrl = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/clips/init`;
  const finalizeUrl = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/clips/finalize`;
  try {
    const init = await readKickJson(initUrl, { method: "GET", headers: authHeaders }, KICK_CHANNEL_AGENTS);
    if (responseSaysOffline(init.status, init.text)) offline = true;
    const initRecord = asRecord(init.json) ?? asRecord(asRecord(init.json)?.["clip"]);
    const finalizeBody: Record<string, unknown> = { duration, title };
    const initId = textField(initRecord, "id", "clip_id", "uuid");
    if (initId) finalizeBody["id"] = initId;
    if (channelId) finalizeBody["channel_id"] = channelId;

    if (init.status === 404 || init.status === 405 || init.status === 401 || init.status === 403) {
      lastError = `clip_api_${init.status}`;
    }

    const finalized = await readKickJson(
      finalizeUrl,
      { method: "POST", headers: authHeaders, body: JSON.stringify(finalizeBody) },
      KICK_CHANNEL_AGENTS,
    );
    if (finalized.status >= 200 && finalized.status < 300) {
      const parsed = parseNativeClip(slug, finalized.json, duration);
      if (parsed) {
        console.log("[clip-capture] kick clip finalized", { slug, status: finalized.status });
        return parsed;
      }
      return { error: "clip_api_unparsed" };
    }
    if (responseSaysOffline(finalized.status, finalized.text)) offline = true;
    if (finalized.status) lastError = `clip_api_${finalized.status}`;
    console.warn("[clip-capture] kick clip finalize failed", { slug, status: finalized.status });
  } catch (error) {
    console.error("[clip-capture] kick clip finalize error", error);
    lastError = "clip_api_failed";
  }

  return { error: offline ? "stream_offline" : lastError };
}

/** Picks a reasonable quality variant (highest bandwidth under ~4 Mbps). */
function pickVariant(master: string, masterUrl: string): string | null {
  const lines = master.split("\n").map((l) => l.trim());
  const variants: { bandwidth: number; url: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line?.startsWith("#EXT-X-STREAM-INF")) continue;
    const bandwidth = Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0);
    const target = lines[i + 1];
    if (!target || target.startsWith("#")) continue;
    variants.push({ bandwidth, url: new URL(target, masterUrl).toString() });
  }
  if (!variants.length) return null;
  variants.sort((a, b) => a.bandwidth - b.bandwidth);
  const capped = variants.filter((v) => v.bandwidth <= 4_000_000);
  return (capped.at(-1) ?? variants[0])!.url;
}

type Segment = { url: string; duration: number; seq: number; at: number };

/**
 * Segment URLs are opaque and signed, but the media sequence number plus the
 * program date time identify each segment uniquely inside the rolling window.
 */
function parseSegments(playlist: string, playlistUrl: string): Segment[] {
  const lines = playlist.split("\n").map((l) => l.trim());
  const segments: Segment[] = [];
  let sequence = Number(/#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(playlist)?.[1] ?? 0);
  let duration = 0;
  let at = 0;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      at = Date.parse(line.slice(25)) || 0;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      duration = Number.parseFloat(line.slice(8)) || 0;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    segments.push({
      url: new URL(line, playlistUrl).toString(),
      duration,
      seq: sequence,
      at: at || Date.now(),
    });
    sequence += 1;
    at = at ? at + duration * 1000 : 0;
  }
  return segments;
}

type BufferRow = {
  slug: string;
  variant_url: string | null;
  variant_refreshed_at: string | null;
  segments: Segment[];
  updated_at: string;
};

async function loadBuffer(userId: string): Promise<BufferRow | null> {
  const { data } = await supabaseAdmin
    .from("kick_stream_buffers")
    .select("slug, variant_url, variant_refreshed_at, segments, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    slug: data.slug,
    variant_url: data.variant_url,
    variant_refreshed_at: data.variant_refreshed_at,
    segments: Array.isArray(data.segments) ? (data.segments as unknown as Segment[]) : [],
    updated_at: data.updated_at,
  };
}

async function resolveVariant(slug: string): Promise<string | null> {
  const channel = await fetchKickChannel(slug);
  if (!channel?.playbackUrl) return null;
  const masterRes = await fetch(channel.playbackUrl, { headers: UA });
  if (!masterRes.ok) return null;
  const master = await masterRes.text();
  if (!master.startsWith("#EXTM3U")) return null;
  return pickVariant(master, masterRes.url || channel.playbackUrl);
}

function mergeSegments(existing: Segment[], incoming: Segment[]): Segment[] {
  const bySeq = new Map<number, Segment>();
  for (const segment of [...existing, ...incoming]) bySeq.set(segment.seq, segment);
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  // Trim to the retention window, oldest first.
  let total = 0;
  const kept: Segment[] = [];
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const segment = merged[i]!;
    if (total >= BUFFER_WINDOW_SECONDS) break;
    kept.unshift(segment);
    total += segment.duration;
  }
  return kept;
}

/**
 * Appends whatever is currently on the live edge to the creator's rolling
 * buffer. Called on every Kick chat webhook (throttled), which keeps the buffer
 * warm for as long as the channel has any chat activity.
 */
export async function refreshKickBuffer(
  userId: string,
  slug: string,
  options: { force?: boolean } = {},
): Promise<{ seconds: number; segments: number }> {
  const row = await loadBuffer(userId);
  const staleSlug = row?.slug !== slug;
  const since = row ? Date.now() - Date.parse(row.updated_at) : Infinity;
  if (!options.force && !staleSlug && since < REFRESH_THROTTLE_MS) {
    const seconds = (row?.segments ?? []).reduce((sum, s) => sum + s.duration, 0);
    return { seconds, segments: row?.segments.length ?? 0 };
  }

  let variantUrl = staleSlug ? null : row?.variant_url ?? null;
  const variantAge = row?.variant_refreshed_at ? Date.now() - Date.parse(row.variant_refreshed_at) : Infinity;
  let variantRefreshedAt = row?.variant_refreshed_at ?? null;
  if (!variantUrl || variantAge > VARIANT_TTL_MS) {
    variantUrl = await resolveVariant(slug);
    variantRefreshedAt = new Date().toISOString();
  }
  if (!variantUrl) return { seconds: 0, segments: 0 };

  let playlistRes = await fetch(variantUrl, { headers: UA });
  if (!playlistRes.ok) {
    // Signed variant expired mid-stream — resolve a fresh one once.
    variantUrl = await resolveVariant(slug);
    variantRefreshedAt = new Date().toISOString();
    if (!variantUrl) return { seconds: 0, segments: 0 };
    playlistRes = await fetch(variantUrl, { headers: UA });
    if (!playlistRes.ok) return { seconds: 0, segments: 0 };
  }

  const incoming = parseSegments(await playlistRes.text(), variantUrl);
  const segments = mergeSegments(staleSlug ? [] : row?.segments ?? [], incoming);
  const seconds = segments.reduce((sum, s) => sum + s.duration, 0);

  await supabaseAdmin.from("kick_stream_buffers").upsert(
    {
      user_id: userId,
      slug,
      variant_url: variantUrl,
      variant_refreshed_at: variantRefreshedAt,
      segments: segments as unknown as never,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return { seconds, segments: segments.length };
}

export type CapturedClip = {
  url: string;
  path: string;
  seconds: number;
  bytes: number;
};

function tail(segments: Segment[], duration: number): Segment[] {
  const picked: Segment[] = [];
  let seconds = 0;
  for (let i = segments.length - 1; i >= 0 && seconds < duration; i -= 1) {
    const segment = segments[i]!;
    picked.unshift(segment);
    seconds += segment.duration;
  }
  return picked;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cuts the last `duration` seconds out of the rolling buffer, topping it up
 * from the live edge when the buffer is still colder than the request, and
 * stores the result as a single MPEG-TS file with a long-lived signed URL.
 */
export async function captureKickClip(
  userId: string,
  slug: string,
  duration: number,
): Promise<CapturedClip | { error: string }> {
  try {
    await refreshKickBuffer(userId, slug, { force: true });
    let buffer = (await loadBuffer(userId))?.segments ?? [];
    let available = buffer.reduce((sum, s) => sum + s.duration, 0);

    // Cold buffer (first !clip of the session): keep pulling the live edge until
    // enough material exists or the fill budget runs out.
    const deadline = Date.now() + FORWARD_FILL_MS;
    while (available + 1 < duration && Date.now() < deadline) {
      await sleep(4_000);
      await refreshKickBuffer(userId, slug, { force: true });
      buffer = (await loadBuffer(userId))?.segments ?? [];
      const next = buffer.reduce((sum, s) => sum + s.duration, 0);
      if (next <= available) break; // stream ended or playlist stalled
      available = next;
    }

    const picked = tail(buffer, duration);
    if (!picked.length) return { error: "no_segments" };

    const parts: Uint8Array[] = [];
    let seconds = 0;
    for (const segment of picked) {
      const res = await fetch(segment.url, { headers: UA });
      if (!res.ok) continue;
      parts.push(new Uint8Array(await res.arrayBuffer()));
      seconds += segment.duration;
    }
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    if (!total) return { error: "download_failed" };

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }

    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ts`;
    const upload = await supabaseAdmin.storage.from("clips").upload(path, merged, {
      contentType: "video/mp2t",
      upsert: false,
    });
    if (upload.error) {
      console.error("[clip-capture] upload failed", upload.error.message);
      return { error: "upload_failed" };
    }

    const signed = await supabaseAdmin.storage.from("clips").createSignedUrl(path, SIGNED_URL_TTL);
    if (signed.error || !signed.data?.signedUrl) {
      console.error("[clip-capture] signing failed", signed.error?.message);
      return { error: "sign_failed" };
    }

    console.log("[clip-capture] captured clip", {
      requested: duration,
      seconds: Math.round(seconds),
      bytes: total,
      path,
    });
    return { url: signed.data.signedUrl, path, seconds: Math.round(seconds), bytes: total };
  } catch (error) {
    console.error("[clip-capture] capture error", error);
    return { error: "capture_failed" };
  }
}
