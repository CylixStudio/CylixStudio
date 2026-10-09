import {
  canTriggerMark,
  isMarkStaff,
  matchMarkCommand,
  sanitizeKickUsername,
  sanitizeMarkNote,
  uptimeFromSession,
  type MarkSource,
  type MarkVodInfo,
  type StreamMark,
} from "@/lib/markPoints";
import { supabaseAdmin } from "@/lib/supabase/client.server";

type ChatSender = {
  username: string;
  platformId: string | null;
  identityBadges: string[];
};

export type KickStreamClock =
  | { live: true; startedAt: string; uptimeSeconds: number }
  | { live: false };

function pickStartedAt(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const livestream =
    row["livestream"] && typeof row["livestream"] === "object"
      ? (row["livestream"] as Record<string, unknown>)
      : row;
  const candidates = [
    livestream["started_at"],
    livestream["startedAt"],
    livestream["created_at"],
    livestream["start_time"],
    row["started_at"],
    row["startedAt"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    if (!Number.isFinite(Date.parse(candidate))) continue;
    return candidate;
  }
  return null;
}

async function kickAccessToken(userId: string): Promise<string | null> {
  const { getKickAccessToken } = await import("@/lib/platformTokens.server");
  return getKickAccessToken(userId);
}

async function kickSlug(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("username, metadata")
    .eq("user_id", userId)
    .eq("platform", "KICK")
    .eq("is_active", true)
    .maybeSingle();
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = typeof metadata["slug"] === "string" ? metadata["slug"] : null;
  return fromMeta ?? data?.username ?? null;
}

async function livestreamFromOfficial(
  token: string,
  broadcasterUserId: string,
): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const urls = [
    `https://api.kick.com/public/v1/livestreams?broadcaster_user_id=${encodeURIComponent(broadcasterUserId)}`,
    `https://api.kick.com/public/v1/users/livestreams?user_id=${encodeURIComponent(broadcasterUserId)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) continue;
      const json = (await response.json().catch(() => ({}))) as { data?: unknown };
      const list = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
      for (const item of list) {
        const startedAt = pickStartedAt(item);
        if (startedAt) return startedAt;
      }
    } catch {
      /* try the next endpoint */
    }
  }
  return null;
}

async function livestreamFromPublicChannel(slug: string): Promise<string | null> {
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 CylixStudio",
      },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as Record<string, unknown>;
    const livestream = json["livestream"];
    if (!livestream || typeof livestream !== "object") return null;
    const live = (livestream as Record<string, unknown>)["is_live"];
    if (live === false) return null;
    return pickStartedAt(json);
  } catch {
    return null;
  }
}

/**
 * Stream uptime from Kick's live session `started_at`. Never invents a clock
 * from the studio machine when Kick is offline.
 */
export async function resolveKickStreamClock(
  userId: string,
  broadcasterUserId?: string | null,
): Promise<KickStreamClock> {
  const token = await kickAccessToken(userId);
  if (token && broadcasterUserId) {
    const startedAt = await livestreamFromOfficial(token, broadcasterUserId);
    if (startedAt) {
      const uptimeSeconds = uptimeFromSession(startedAt);
      if (uptimeSeconds != null) return { live: true, startedAt, uptimeSeconds };
    }
  }

  const slug = await kickSlug(userId);
  if (slug) {
    const startedAt = await livestreamFromPublicChannel(slug);
    if (startedAt) {
      const uptimeSeconds = uptimeFromSession(startedAt);
      if (uptimeSeconds != null) return { live: true, startedAt, uptimeSeconds };
    }
  }

  return { live: false };
}

async function loadAllowlist(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("mark_point_allowlist")
    .select("username")
    .eq("user_id", userId);
  return (data ?? []).map((row) => row.username);
}

/**
 * Kick chat `!mark` / `/mark` opens a pending start; `!emark` / `/emark` closes
 * the newest open start. No public chat reply — never post URLs or mark IDs.
 * Times are Kick stream uptime. Offline chat commands are refused.
 */
export async function handleMarkCommand(input: {
  userId: string;
  broadcasterUserId: string;
  platform?: MarkSource;
  text: string;
  sender: ChatSender;
}): Promise<{ status: string; reason?: string; command?: string }> {
  const matched = matchMarkCommand(input.text);
  if (!matched) return { status: "ignored", reason: "not_mark_command" };

  const allowlist = await loadAllowlist(input.userId);
  if (
    !canTriggerMark({
      badges: input.sender.identityBadges,
      username: input.sender.username,
      senderPlatformId: input.sender.platformId,
      broadcasterUserId: input.broadcasterUserId,
      allowlist,
    })
  ) {
    return { status: "ignored", reason: "not_permitted" };
  }

  const source: MarkSource = input.platform === "TWITCH" ? "TWITCH" : "KICK";
  const author = input.sender.username.trim() || "chat";
  const viewerIsMod = isMarkStaff(
    input.sender.identityBadges,
    input.sender.platformId,
    input.broadcasterUserId,
  );
  const clock = await resolveKickStreamClock(input.userId, input.broadcasterUserId);

  if (matched.kind === "mark") {
    if (!clock.live) return { status: "ignored", reason: "stream_offline", command: "mark" };
    if (viewerIsMod) {
      const { rememberMarkStaff } = await import("@/lib/markPoints.share.server");
      await rememberMarkStaff(input.userId, author);
    }
    const { error } = await supabaseAdmin.from("stream_marks").insert({
      user_id: input.userId,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: null,
      uptime_start_seconds: clock.uptimeSeconds,
      uptime_end_seconds: null,
      stream_started_at: clock.startedAt,
      offline: false,
      status: "pending",
      author,
      source,
      note: matched.note,
      viewer_is_mod: viewerIsMod,
    });
    if (error) return { status: "error", reason: error.message, command: "mark" };
    return { status: "started", command: "mark" };
  }

  const { data: open } = await supabaseAdmin
    .from("stream_marks")
    .select("id, note, uptime_start_seconds, stream_started_at, offline")
    .eq("user_id", input.userId)
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) return { status: "ignored", reason: "no_open_start", command: "emark" };

  if (viewerIsMod) {
    const { rememberMarkStaff } = await import("@/lib/markPoints.share.server");
    await rememberMarkStaff(input.userId, author);
  }

  const endedAt = new Date().toISOString();
  const uptimeEnd = clock.live
    ? clock.uptimeSeconds
    : open.stream_started_at
      ? uptimeFromSession(open.stream_started_at)
      : null;
  if (uptimeEnd == null && !open.offline) {
    return { status: "ignored", reason: "stream_offline", command: "emark" };
  }
  const duration =
    open.uptime_start_seconds != null && uptimeEnd != null
      ? Math.max(0, uptimeEnd - open.uptime_start_seconds)
      : null;

  const { error } = await supabaseAdmin
    .from("stream_marks")
    .update({
      ended_at: endedAt,
      uptime_end_seconds: uptimeEnd,
      duration_seconds: duration,
      note: sanitizeMarkNote(matched.note || open.note),
      offline: open.offline || uptimeEnd == null,
    })
    .eq("id", open.id)
    .eq("user_id", input.userId);

  if (error) return { status: "error", reason: error.message, command: "emark" };
  return { status: "closed", command: "emark" };
}

const KICK_UA = { Accept: "application/json", "User-Agent": "Mozilla/5.0 CylixStudio" } as const;

function vodDurationMs(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1_000 ? n : n * 1000;
}

function markMomentMs(mark: StreamMark): number | null {
  const session = Date.parse(mark.streamStartedAt ?? mark.startedAt);
  if (!Number.isFinite(session)) return null;
  return session + Math.max(0, mark.uptimeStartSeconds ?? 0) * 1000;
}

/**
 * Honest Kick VOD lookup: public channel videos list, then optional HLS
 * `source` from `/api/v1/video/{uuid}`. No VOD is invented when Kick has none.
 */
export async function resolveKickMarkVod(
  slug: string,
  mark: StreamMark,
): Promise<MarkVodInfo | null> {
  const channel = sanitizeKickUsername(slug);
  if (!channel || mark.offline) return null;
  const moment = markMomentMs(mark);
  if (moment == null) return null;

  type VideoRow = {
    created_at?: string;
    duration?: number;
    session_title?: string;
    thumbnail?: { url?: string } | null;
    video?: { uuid?: string; is_private?: boolean } | null;
    source?: string | null;
  };

  let rows: VideoRow[] = [];
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channel)}/videos`, {
      headers: KICK_UA,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as unknown;
    rows = Array.isArray(json) ? (json as VideoRow[]) : [];
  } catch {
    return null;
  }

  let best: { row: VideoRow; uuid: string; start: number; score: number } | null = null;
  for (const row of rows) {
    const uuid = row.video?.uuid;
    if (!uuid || row.video?.is_private) continue;
    const start = Date.parse(row.created_at ?? "");
    if (!Number.isFinite(start)) continue;
    const end = start + vodDurationMs(row.duration);
    if (moment < start - 60_000 || moment > end + 60_000) continue;
    const score = Math.abs(start - Date.parse(mark.streamStartedAt ?? mark.startedAt));
    if (!best || score < best.score) best = { row, uuid, start, score };
  }
  if (!best) return null;

  let hlsUrl: string | null = null;
  try {
    const detail = await fetch(`https://kick.com/api/v1/video/${encodeURIComponent(best.uuid)}`, {
      headers: KICK_UA,
    });
    if (detail.ok) {
      const body = (await detail.json()) as { source?: string | null };
      if (typeof body.source === "string" && body.source.includes(".m3u8")) hlsUrl = body.source;
    }
  } catch {
    /* embed still works without a direct HLS URL */
  }

  const seekSeconds = mark.uptimeStartSeconds;
  return {
    uuid: best.uuid,
    title: best.row.session_title ?? null,
    watchUrl: `https://kick.com/${channel}/videos/${best.uuid}`,
    embedUrl: `https://player.kick.com/video/${best.uuid}`,
    hlsUrl,
    thumbnail: best.row.thumbnail?.url ?? null,
    seekSeconds: seekSeconds != null && seekSeconds >= 0 ? seekSeconds : null,
    endSeconds: mark.uptimeEndSeconds,
  };
}
