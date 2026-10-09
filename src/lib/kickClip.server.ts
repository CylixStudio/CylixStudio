import { liveEdgeWindow, liveStateFromLivestream, type KickLivestreamShape } from "@/lib/kickClipLive";

/**
 * One channel read, then one Kick clip create. On failure the caller may
 * capture the live edge once. No buffer fill, no cooldown, no second host.
 */

/**
 * A long Chrome UA plus Referer gets HTTP 403 on kick.com/api/v2/channels.
 * `okhttp/4.12.0`, then a short `Mozilla/5.0`, gets 200. No Referer.
 * Channel reads and live-edge playlist/segment fetches use this same pair.
 */
const KICK_READ_AGENTS = ["okhttp/4.12.0", "Mozilla/5.0"] as const;

function kickReadHeaders(agent: string, accept: string): Headers {
  const headers = new Headers();
  headers.set("Accept", accept);
  headers.set("User-Agent", agent);
  return headers;
}

type KickLivestream = KickLivestreamShape & {
  session_title?: string;
  slug?: string;
  vod_id?: string | number | null;
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
  /** Livestream slug Kick uses in `/api/internal/v1/livestreams/{slug}/clips`. */
  livestreamSlug: string | null;
  /** VOD id used by `POST https://web.kick.com/api/v1/clips`. */
  vodId: string | null;
};

async function readKick(
  url: string,
  accept: string,
): Promise<{ status: number; buffer: ArrayBuffer }> {
  let last = { status: 0, buffer: new ArrayBuffer(0) };
  for (const agent of KICK_READ_AGENTS) {
    const res = await fetch(url, {
      headers: kickReadHeaders(agent, accept),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const buffer = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    last = { status: res.status, buffer };
    if (res.status !== 403) return last;
  }
  return last;
}

async function readKickJson(url: string): Promise<{ status: number; json: unknown; text: string }> {
  const res = await readKick(url, "application/json");
  const text = new TextDecoder().decode(res.buffer);
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text };
}

export async function fetchKickChannel(slug: string): Promise<ChannelInfo | null> {
  const channelSlug = slug.trim().replace(/^@+/, "").toLowerCase();
  try {
    const res = await readKickJson(
      `https://kick.com/api/v2/channels/${encodeURIComponent(channelSlug)}`,
    );
    if (res.status < 200 || res.status >= 300) {
      console.warn("[clip-capture] channel lookup failed", res.status, channelSlug);
      return null;
    }
    const json = (res.json ?? {}) as {
      id?: number;
      slug?: string;
      playback_url?: string | null;
      livestream?: (KickLivestream & { playback_url?: string | null }) | null;
    };
    const liveState = liveStateFromLivestream(json.livestream);
    const playback =
      (typeof json.playback_url === "string" && json.playback_url.trim()) ||
      (typeof json.livestream?.playback_url === "string" && json.livestream.playback_url.trim()) ||
      "";
    const channelId = typeof json.id === "number" && Number.isSafeInteger(json.id) ? json.id : null;
    const vod = json.livestream?.vod_id;
    const vodId = typeof vod === "string" && vod.trim() ? vod.trim() : typeof vod === "number" ? String(vod) : null;
    const livestreamSlug =
      typeof json.livestream?.slug === "string" && json.livestream.slug.trim()
        ? json.livestream.slug.trim()
        : null;
    return {
      slug: (json.slug ?? channelSlug).toLowerCase(),
      channelId,
      playbackUrl: playback || null,
      liveState,
      isLive: liveState === true,
      title: json.livestream?.session_title ?? null,
      thumbnail: json.livestream?.thumbnail?.url ?? null,
      livestreamSlug,
      vodId,
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

type KickHttpResult = { status: number; json: unknown; text: string; retryAfter: string | null };

/** One POST. A 403 is not retried with another user-agent. 404/405 are not repeated. */
async function postKickOnce(url: string, token: string, body: Record<string, unknown>): Promise<KickHttpResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "okhttp/4.12.0",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text, retryAfter: res.headers.get("retry-after") };
}


function clipIdFrom(payload: unknown): string | null {
  return textField(clipRecord(payload), "id", "clip_id", "uuid");
}

function publishedClip(slug: string, id: string, payload: unknown, duration: number): NativeKickClip {
  return (
    parseNativeClip(slug, payload, duration) ?? {
      externalId: id,
      url: kickClipPage(slug, id),
      title: textField(clipRecord(payload), "title"),
      thumbnail: null,
      duration,
    }
  );
}

/**
 * One clip create. When `vodId` exists that attempt is
 * `POST https://web.kick.com/api/v1/clips` then finalize on the same host.
 * A failure, including 429, returns immediately and does not continue to the
 * internal livestream route. When `vodId` is missing, one internal create is
 * the attempt itself:
 * `POST https://kick.com/api/internal/v1/livestreams/{livestreamSlug}/clips`,
 * then finalize on that same URL. A 429 is not retried.
 * Does not log the token. Does not POST the channel clip list or `/clips/init`.
 */
export type NativeKickClipResult =
  | NativeKickClip
  | { error: string; rateLimited?: boolean; retryAfter?: string | null };

export async function createNativeKickClip(input: {
  token: string;
  slug: string;
  duration: number;
  livestreamSlug: string | null;
  vodId: string | null;
}): Promise<NativeKickClipResult> {
  const slug = input.slug.trim().replace(/^@+/, "").toLowerCase();
  const { token, duration, livestreamSlug, vodId } = input;
  const title = "Clip";
  const finalizeBody = { duration, start_time: 0, title };

  const finish = async (
    opened: KickHttpResult,
    finalizeUrl: (id: string) => string,
  ): Promise<NativeKickClipResult> => {
    if (opened.status === 429) {
      console.warn("[clip-capture] kick clip rate limited", { status: opened.status });
      return { error: "clip_api_429", rateLimited: true, retryAfter: opened.retryAfter };
    }
    if (opened.status < 200 || opened.status >= 300) {
      if (responseSaysOffline(opened.status, opened.text)) return { error: "stream_offline" };
      console.warn("[clip-capture] kick clip create declined", { status: opened.status });
      return { error: `clip_api_${opened.status || "failed"}` };
    }
    const id = clipIdFrom(opened.json);
    if (!id) return { error: "clip_api_unparsed" };
    const finalized = await postKickOnce(finalizeUrl(id), token, finalizeBody);
    if (finalized.status === 429) {
      console.warn("[clip-capture] kick clip rate limited", { status: finalized.status });
      return { error: "clip_api_429", rateLimited: true, retryAfter: finalized.retryAfter };
    }
    if (finalized.status >= 200 && finalized.status < 300) {
      console.log("[clip-capture] kick clip finalized", { slug, status: finalized.status });
      return publishedClip(slug, clipIdFrom(finalized.json) ?? id, finalized.json, duration);
    }
    if (finalized.status === 404 || finalized.status === 405) {
      console.warn("[clip-capture] kick clip finalize declined", { status: finalized.status });
      return publishedClip(slug, id, opened.json, duration);
    }
    if (responseSaysOffline(finalized.status, finalized.text)) return { error: "stream_offline" };
    console.warn("[clip-capture] kick clip finalize declined", { status: finalized.status });
    return { error: `clip_api_${finalized.status || "failed"}` };
  };

  try {
    if (vodId) {
      const opened = await postKickOnce("https://web.kick.com/api/v1/clips", token, { video_id: vodId });
      if (opened.status < 200 || opened.status >= 300) {
        console.warn("[clip-capture] kick clip create", { status: opened.status, via: "web" });
      }
      return finish(opened, (id) => `https://web.kick.com/api/v1/clips/${encodeURIComponent(id)}/finalize`);
    }

    if (livestreamSlug) {
      const opened = await postKickOnce(
        `https://kick.com/api/internal/v1/livestreams/${encodeURIComponent(livestreamSlug)}/clips`,
        token,
        { duration },
      );
      if (opened.status < 200 || opened.status >= 300) {
        console.warn("[clip-capture] kick clip create", { status: opened.status, via: "internal" });
      }
      return finish(
        opened,
        (id) =>
          `https://kick.com/api/internal/v1/livestreams/${encodeURIComponent(livestreamSlug)}/clips/${encodeURIComponent(id)}/finalize`,
      );
    }
  } catch (error) {
    console.error("[clip-capture] kick clip request error", error);
    return { error: "clip_api_failed" };
  }

  return { error: "clip_api_unavailable" };
}

type MediaSegment = { url: string; duration: number };
type Variant = { url: string; bandwidth: number };

function absoluteMediaUrl(base: string, value: string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

/** One playlist body. A master playlist yields variants; a media playlist yields segments. */
function parseHlsPlaylist(body: string, baseUrl: string): { variants: Variant[]; segments: MediaSegment[] } {
  const variants: Variant[] = [];
  const segments: MediaSegment[] = [];
  let bandwidth = 0;
  let expectVariant = false;
  let duration = 0;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#EXT-X-I-FRAME-STREAM-INF") || line.startsWith("#EXT-X-MEDIA:")) continue;
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const match = /BANDWIDTH=(\d+)/.exec(line);
      bandwidth = match ? Number(match[1]) : 0;
      expectVariant = true;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      const parsed = Number(line.slice("#EXTINF:".length).split(",")[0]);
      duration = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      continue;
    }
    if (line.startsWith("#")) continue;
    const url = absoluteMediaUrl(baseUrl, line);
    if (!url) continue;
    if (expectVariant) {
      variants.push({ url, bandwidth });
      expectVariant = false;
      bandwidth = 0;
      continue;
    }
    segments.push({ url, duration: duration > 0 ? duration : 2 });
    duration = 0;
  }
  return { variants, segments };
}

function lowestVariant(variants: Variant[]): string | null {
  if (variants.length === 0) return null;
  const ranked = [...variants].sort((left, right) => {
    if (left.bandwidth <= 0 && right.bandwidth <= 0) return 0;
    if (left.bandwidth <= 0) return 1;
    if (right.bandwidth <= 0) return -1;
    return left.bandwidth - right.bandwidth;
  });
  return ranked[0]?.url ?? null;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export type LiveEdgeCapture = {
  bytes: Uint8Array;
  duration: number;
};

/**
 * One read of the current live playlist, then the segments already listed,
 * capped to `durationSeconds`. A master playlist gets one follow to its
 * lowest variant. No sleep, no second playlist poll, no forward-fill.
 * Returns null when the playlist has no segments or a download fails.
 */
export async function captureKickLiveEdge(
  playbackUrl: string,
  durationSeconds: number,
): Promise<LiveEdgeCapture | null> {
  const root = playbackUrl.trim();
  if (!root) return null;
  try {
    const first = await readKick(root, "*/*");
    if (first.status < 200 || first.status >= 300 || first.buffer.byteLength === 0) {
      console.warn("[clip-capture] live playlist declined", { status: first.status });
      return null;
    }
    let parsed = parseHlsPlaylist(new TextDecoder().decode(first.buffer), root);
    if (parsed.segments.length === 0) {
      const variant = lowestVariant(parsed.variants);
      if (!variant) {
        console.warn("[clip-capture] live playlist had no segments");
        return null;
      }
      const media = await readKick(variant, "*/*");
      if (media.status < 200 || media.status >= 300 || media.buffer.byteLength === 0) {
        console.warn("[clip-capture] live variant declined", { status: media.status });
        return null;
      }
      parsed = parseHlsPlaylist(new TextDecoder().decode(media.buffer), variant);
    }
    const chosen = liveEdgeWindow(parsed.segments, durationSeconds);
    if (chosen.length === 0) {
      console.warn("[clip-capture] live playlist had no segments");
      return null;
    }
    const parts = await Promise.all(
      chosen.map(async (segment) => {
        const file = await readKick(segment.url, "*/*");
        if (file.status < 200 || file.status >= 300 || file.buffer.byteLength === 0) return null;
        return new Uint8Array(file.buffer);
      }),
    );
    if (parts.some((part) => part == null)) {
      console.warn("[clip-capture] live segment download failed", { segments: chosen.length });
      return null;
    }
    const bytes = concatBytes(parts as Uint8Array[]);
    if (bytes.byteLength === 0) return null;
    const duration = Math.max(1, Math.round(chosen.reduce((sum, segment) => sum + segment.duration, 0)));
    console.log("[clip-capture] live edge captured", { segments: chosen.length, bytes: bytes.byteLength, duration });
    return { bytes, duration };
  } catch (error) {
    console.error("[clip-capture] live edge capture error", error instanceof Error ? error.message : "failed");
    return null;
  }
}
