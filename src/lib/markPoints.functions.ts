import { createServerFn } from "@tanstack/react-start";

import {
  isMarkStatus,
  sanitizeKickUsername,
  sanitizeMarkNote,
  uptimeFromSession,
  type MarkShareSettings,
  type MarkStatus,
  type StreamMark,
  type StreamMarkPatch,
} from "@/lib/markPoints";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

type MarkRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  uptime_start_seconds: number | null;
  uptime_end_seconds: number | null;
  stream_started_at: string | null;
  offline: boolean;
  status: string;
  author: string;
  source: string;
  note: string;
  viewer_is_mod: boolean;
  created_at: string;
  updated_at: string;
};

function mapMark(row: MarkRow): StreamMark {
  const source =
    row.source === "TWITCH" || row.source === "STUDIO" || row.source === "KICK" ? row.source : "KICK";
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    uptimeStartSeconds: row.uptime_start_seconds,
    uptimeEndSeconds: row.uptime_end_seconds,
    streamStartedAt: row.stream_started_at,
    offline: row.offline,
    status: isMarkStatus(row.status) ? row.status : "pending",
    author: row.author,
    source,
    note: row.note,
    viewerIsMod: row.viewer_is_mod,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MARK_COLUMNS =
  "id, started_at, ended_at, duration_seconds, uptime_start_seconds, uptime_end_seconds, stream_started_at, offline, status, author, source, note, viewer_is_mod, created_at, updated_at";

async function kickBroadcasterId(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("platform_user_id")
    .eq("user_id", userId)
    .eq("platform", "KICK")
    .eq("is_active", true)
    .maybeSingle();
  return data?.platform_user_id ?? null;
}

async function markScope(context: { supabase: any; userId: string }) {
  const { resolveSharedFeatureSubject } = await import("@/lib/planAccess.server");
  const subject = await resolveSharedFeatureSubject(context.userId);
  if (subject.locked) return { locked: true as const };
  if (subject.viaGrant) {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    return { locked: false as const, db: supabaseAdmin, userId: subject.userId, isPro: true };
  }
  return { locked: false as const, db: context.supabase, userId: context.userId, isPro: subject.isPro };
}

export const listStreamMarks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ marks: StreamMark[]; locked: boolean }> => {
    const scope = await markScope(context);
    if (scope.locked) return { marks: [], locked: true };
    const { data } = await scope.db
      .from("stream_marks")
      .select(MARK_COLUMNS)
      .eq("user_id", scope.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    return { marks: (data ?? []).map(mapMark), locked: false };
  });

export const updateStreamMark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: StreamMarkPatch) => input)
  .handler(async ({ data, context }) => {
    const scope = await markScope(context);
    if (scope.locked) return { ok: false as const, error: "pro_required" };
    const payload: { note?: string; status?: MarkStatus } = {};
    if (data.note !== undefined) payload.note = sanitizeMarkNote(data.note);
    if (data.status && isMarkStatus(data.status)) payload.status = data.status;
    const { error } = await scope.db
      .from("stream_marks")
      .update(payload)
      .eq("id", data.id)
      .eq("user_id", scope.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteStreamMark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const scope = await markScope(context);
    if (scope.locked) return { ok: false };
    const { error } = await scope.db
      .from("stream_marks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", scope.userId);
    return { ok: !error };
  });

export const startStudioMark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { note?: string }) => input)
  .handler(async ({ data, context }) => {
    const scope = await markScope(context);
    if (scope.locked) return { ok: false as const, error: "pro_required" };
    const { assertMarkRoom, resolveKickStreamClock } = await import("@/lib/markPoints.server");
    const clock = await resolveKickStreamClock(scope.userId, await kickBroadcasterId(scope.userId));
    const room = await assertMarkRoom(scope.userId, clock.live ? clock.startedAt : null);
    if (!room.ok) return { ok: false as const, error: room.error };
    const { error } = await scope.db.from("stream_marks").insert({
      user_id: scope.userId,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: null,
      uptime_start_seconds: clock.live ? clock.uptimeSeconds : null,
      uptime_end_seconds: null,
      stream_started_at: clock.live ? clock.startedAt : null,
      offline: !clock.live,
      status: "pending",
      author: "Studio",
      source: "STUDIO",
      note: sanitizeMarkNote(data.note ?? ""),
      viewer_is_mod: true,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, offline: !clock.live };
  });

export const closeStudioMark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { note?: string }) => input)
  .handler(async ({ data, context }) => {
    const scope = await markScope(context);
    if (scope.locked) return { ok: false as const, error: "pro_required" };
    const { data: open } = await scope.db
      .from("stream_marks")
      .select("id, note, uptime_start_seconds, stream_started_at, offline")
      .eq("user_id", scope.userId)
      .is("ended_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!open) return { ok: false as const, error: "no_open_start" };

    const { resolveKickStreamClock } = await import("@/lib/markPoints.server");
    const clock = await resolveKickStreamClock(scope.userId, await kickBroadcasterId(scope.userId));
    const uptimeEnd = clock.live
      ? clock.uptimeSeconds
      : open.stream_started_at
        ? uptimeFromSession(open.stream_started_at)
        : null;
    const duration =
      open.uptime_start_seconds != null && uptimeEnd != null
        ? Math.max(0, uptimeEnd - open.uptime_start_seconds)
        : null;

    const { error } = await scope.db
      .from("stream_marks")
      .update({
        ended_at: new Date().toISOString(),
        uptime_end_seconds: uptimeEnd,
        duration_seconds: duration,
        note: sanitizeMarkNote(data.note || open.note),
        offline: open.offline || uptimeEnd == null,
      })
      .eq("id", open.id)
      .eq("user_id", scope.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const listMarkAllowlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const { data } = await context.supabase
      .from("mark_point_allowlist")
      .select("username")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    return (data ?? []).map((row) => row.username);
  });

export const addMarkAllowlistName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => input)
  .handler(async ({ data, context }) => {
    const username = sanitizeKickUsername(data.username);
    if (!username) return { ok: false as const, error: "name_required" };
    const { error } = await context.supabase.from("mark_point_allowlist").insert({
      user_id: context.userId,
      username,
    });
    if (error) {
      if (error.code === "23505") return { ok: true as const };
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

export const removeMarkAllowlistName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => input)
  .handler(async ({ data, context }) => {
    const username = sanitizeKickUsername(data.username);
    const { error } = await context.supabase
      .from("mark_point_allowlist")
      .delete()
      .eq("user_id", context.userId)
      .ilike("username", username);
    return { ok: !error };
  });

export const setStreamMarkStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: MarkStatus }) => input)
  .handler(async ({ data, context }) => {
    if (!isMarkStatus(data.status)) return { ok: false as const, error: "bad_status" };
    const scope = await markScope(context);
    if (scope.locked) return { ok: false as const, error: "pro_required" };
    const { error } = await scope.db
      .from("stream_marks")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", scope.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

async function kickUsernameFor(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("username, metadata")
    .eq("user_id", userId)
    .eq("platform", "KICK")
    .eq("is_active", true)
    .maybeSingle();
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = typeof metadata["slug"] === "string" ? metadata["slug"] : "";
  return sanitizeKickUsername(fromMeta || data?.username || "");
}

export const getMarkShareSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarkShareSettings> => {
    const kickUsername = await kickUsernameFor(context.userId);
    const { data } = await context.supabase
      .from("mark_point_settings")
      .select("share_token, kick_username")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (data) {
      if (kickUsername && data.kick_username !== kickUsername) {
        await context.supabase
          .from("mark_point_settings")
          .update({ kick_username: kickUsername })
          .eq("user_id", context.userId);
      }
      return { shareToken: data.share_token, kickUsername: kickUsername || data.kick_username };
    }
    const { data: created } = await context.supabase
      .from("mark_point_settings")
      .upsert({ user_id: context.userId, kick_username: kickUsername }, { onConflict: "user_id" })
      .select("share_token, kick_username")
      .maybeSingle();
    return {
      shareToken: created?.share_token ?? "",
      kickUsername: kickUsername || created?.kick_username || "",
    };
  });

export const rotateMarkShareToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarkShareSettings> => {
    const token = crypto.randomUUID().replaceAll("-", "");
    const kickUsername = await kickUsernameFor(context.userId);
    const { data } = await context.supabase
      .from("mark_point_settings")
      .upsert(
        { user_id: context.userId, share_token: token, kick_username: kickUsername },
        { onConflict: "user_id" },
      )
      .select("share_token, kick_username")
      .maybeSingle();
    return { shareToken: data?.share_token ?? token, kickUsername: kickUsername || data?.kick_username || "" };
  });
