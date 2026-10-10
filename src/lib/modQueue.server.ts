import { supabaseAdmin } from "@/lib/supabase/client.server";

export type ModAction = "APPROVE" | "REJECT" | "SKIP" | "DELETE" | "PLAY" | "PAUSE" | "RESUME" | "SET_MODE";
export type RequestMode = "AUTO" | "MANUAL" | "PAUSED";

export const isRequestMode = (value: unknown): value is RequestMode =>
  value === "AUTO" || value === "MANUAL" || value === "PAUSED";

/** Resolves the streamer that owns a shared moderator token. */
export async function resolveModOwner(token: string) {
  if (!token || token.length < 16) return null;
  const { data } = await supabaseAdmin.from("media_request_settings")
    .select("user_id,request_mode,require_approval").eq("mod_token", token).maybeSingle();
  return data;
}

/** Queue snapshot exposed to moderators — no PII beyond the public chat name. */
export async function loadModQueue(userId: string) {
  const [{ data: requests }, { data: playback }] = await Promise.all([
    supabaseAdmin.from("media_requests")
      .select("id,title,status,position,requester_username,platform,artist,youtube_video_id,youtube_url,thumbnail_url,duration_seconds,created_at")
      .eq("user_id", userId).in("status", ["PENDING", "QUEUED", "PLAYING"])
      .order("position", { ascending: true }).limit(100),
    supabaseAdmin.from("media_playback_state")
      .select("current_request_id,playback_status").eq("user_id", userId).maybeSingle(),
  ]);
  const { data: settings } = await supabaseAdmin.from("media_request_settings")
    .select("request_mode").eq("user_id", userId).maybeSingle();
  return { requests: requests ?? [], playback, requestMode: (settings?.request_mode ?? "MANUAL") as RequestMode };
}

/** Applies a moderator action using the same rules as the owner dashboard. */
export async function runModAction(
  userId: string,
  input: { action: ModAction; requestId?: string | null; mode?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { userHasActivePro } = await import("@/lib/subscription.server");
  if (!(await userHasActivePro(supabaseAdmin, userId))) return { ok: false, error: "pro_required" };
  const { acceptKickRedemption, rejectKickRedemption, advanceQueue, startIfIdle } = await import("@/lib/mediaRequests.server");

  if (input.action === "SET_MODE") {
    if (!isRequestMode(input.mode)) return { ok: false, error: "invalid_mode" };
    await supabaseAdmin.from("media_request_settings")
      .update({ request_mode: input.mode, require_approval: input.mode !== "AUTO" })
      .eq("user_id", userId);
    return { ok: true };
  }

  if (input.action === "PAUSE" || input.action === "RESUME") {
    await supabaseAdmin.from("media_playback_state").upsert({
      user_id: userId, playback_status: input.action === "PAUSE" ? "PAUSED" : "PLAYING", revision: Date.now(),
    }, { onConflict: "user_id" });
    return { ok: true };
  }

  if (!input.requestId) return { ok: false, error: "request_required" };
  const { data: request } = await supabaseAdmin.from("media_requests")
    .select("id,reward_redemption_id").eq("id", input.requestId).eq("user_id", userId).maybeSingle();
  if (!request) return { ok: false, error: "request_not_found" };

  if (input.action === "APPROVE") {
    await supabaseAdmin.from("media_requests")
      .update({ status: "QUEUED", approved_at: new Date().toISOString() }).eq("id", request.id);
    if (request.reward_redemption_id) await acceptKickRedemption(userId, request.reward_redemption_id);
    await startIfIdle(userId, request.id);
  } else if (input.action === "REJECT") {
    const refunded = request.reward_redemption_id ? await rejectKickRedemption(userId, request.reward_redemption_id) : false;
    await supabaseAdmin.from("media_requests").update({
      status: "REJECTED", rejection_reason: "Rejected by moderator",
      refunded_at: refunded ? new Date().toISOString() : null,
    }).eq("id", request.id);
  } else if (input.action === "SKIP") {
    await supabaseAdmin.from("media_requests")
      .update({ status: "SKIPPED", played_at: new Date().toISOString() }).eq("id", request.id);
    await advanceQueue(userId, null);
  } else if (input.action === "PLAY") {
    await supabaseAdmin.from("media_requests").update({ status: "PLAYING" }).eq("id", request.id);
    await supabaseAdmin.from("media_requests").update({ status: "SKIPPED" })
      .eq("user_id", userId).eq("status", "PLAYING").neq("id", request.id);
    await supabaseAdmin.from("media_playback_state").upsert({
      user_id: userId, current_request_id: request.id, playback_status: "PLAYING",
      position_seconds: 0, started_at: new Date().toISOString(), revision: Date.now(),
    }, { onConflict: "user_id" });
  } else if (input.action === "DELETE") {
    await supabaseAdmin.from("media_requests").delete().eq("id", request.id);
  }
  return { ok: true };
}
