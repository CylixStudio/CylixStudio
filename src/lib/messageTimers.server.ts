import { sendKickChatMessage } from "@/lib/kickChat.server";
import {
  claimMessageTimerSlot,
  classifyKickLivestream,
  planCronRotation,
  runMessageTimerPass,
  slotMovesBackward,
  timerLogLine,
  type LiveFact,
  type SlotClaimInput,
  type SlotStore,
  type TimerCandidate,
  type TimerPassRecord,
} from "@/lib/messageTimerSchedule";
import { getKickAccessToken } from "@/lib/platformTokens.server";
import { supabaseAdmin } from "@/lib/supabase/client.server";

/**
 * Repeating Kick chat timers. Only `runScheduledMessageTimers` sends.
 * The commands page can edit timers and does not post. Chat webhooks do not
 * scan timers. The Worker does not keep its own timer loop.
 *
 * The claim update sets last_sent_slot and last_sent_at only when the row is
 * enabled, owned by that user, and still on the slot this isolate read
 * (last_sent_slot IS DISTINCT FROM the new claim). A missing column fails
 * closed. A Kick error after a successful claim does not clear the slot.
 *
 * Live status is Kick GET /public/v1/livestreams for this user's active Kick
 * broadcaster id. Empty data is OFFLINE. Errors and mismatched ids are UNKNOWN.
 * UNKNOWN and OFFLINE do not send.
 */

const LIVE_URL = "https://api.kick.com/public/v1/livestreams";

type TimerRow = {
  id: string;
  user_id: string;
  message: string;
  interval_minutes: number;
  enabled: boolean;
  platforms: string[] | null;
  updated_at: string;
  last_sent_slot: string | null;
};

function toCandidate(row: TimerRow): TimerCandidate {
  return {
    id: row.id,
    message: row.message,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled,
    platforms: row.platforms ?? [],
    updatedAtMs: Date.parse(row.updated_at),
  };
}

function logRecords(records: TimerPassRecord[]) {
  for (const record of records) console.log(timerLogLine(record));
}

async function writeSlotClaim(input: SlotClaimInput) {
  // A lower index for the same stream is not sent as an UPDATE. PostgREST cannot
  // compare the index inside the text key. A stale expected value still cannot
  // overwrite a newer committed slot, because that match is inside this UPDATE.
  if (slotMovesBackward(input.expectedSlot, input.claimKey) || input.expectedSlot === input.claimKey) {
    return { data: [], error: null };
  }
  // One UPDATE. The list SELECT only chooses the next key. Postgres rechecks this
  // WHERE after taking the row lock, so two callers with the same expected slot
  // cannot both get a returned row.
  //
  // last_sent_slot IS NOT DISTINCT FROM expected
  // AND last_sent_slot IS DISTINCT FROM claim
  // AND enabled
  //
  // NULL IS DISTINCT FROM a claim key, so the first claim is `.is null` only.
  // `.neq` does not match NULL and must not be combined with that branch.
  const base = supabaseAdmin
    .from("message_timers")
    .update({
      last_sent_slot: input.claimKey,
      last_sent_at: input.dueAtIso,
    })
    .eq("id", input.timerId)
    .eq("user_id", input.userId)
    .eq("enabled", true);
  const filtered =
    input.expectedSlot == null
      ? base.is("last_sent_slot", null)
      : base.eq("last_sent_slot", input.expectedSlot).neq("last_sent_slot", input.claimKey);
  const { data, error } = await filtered.select("id");
  return { data: data ?? null, error };
}

function slotStore(userId: string, slots: ReadonlyMap<string, string | null>): SlotStore {
  const seen = new Map(slots);
  return {
    get(timerId) {
      return seen.get(timerId) ?? null;
    },
    claim(timerId, claimKey, dueAtMs) {
      return claimMessageTimerSlot(writeSlotClaim, {
        timerId,
        userId,
        expectedSlot: seen.get(timerId) ?? null,
        claimKey,
        dueAtIso: new Date(dueAtMs ?? Date.now()).toISOString(),
      });
    },
  };
}

async function resolveKickLive(userId: string): Promise<LiveFact> {
  const { data, error } = await supabaseAdmin
    .from("platform_connections")
    .select("platform_user_id")
    .eq("user_id", userId)
    .eq("platform", "KICK")
    .eq("is_active", true);

  if (error) return { phase: "UNKNOWN", channelId: null, reason: "kick_channel_query_failed" };
  if (!data || data.length !== 1) return { phase: "UNKNOWN", channelId: null, reason: "kick_channel_unresolved" };
  const channelId = data[0]?.platform_user_id ?? null;
  if (!channelId || !/^\d{1,20}$/.test(channelId)) {
    return { phase: "UNKNOWN", channelId: null, reason: "kick_channel_unresolved" };
  }

  const token = await getKickAccessToken(userId);
  if (!token) return { phase: "UNKNOWN", channelId, reason: "no_kick_token" };

  try {
    const response = await fetch(`${LIVE_URL}?broadcaster_user_id=${encodeURIComponent(channelId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => null);
    return classifyKickLivestream(response.status, body, channelId);
  } catch {
    return { phase: "UNKNOWN", channelId, reason: "live_check_failed" };
  }
}

async function passForUser(userId: string, rows: TimerRow[], nowMs: number): Promise<TimerPassRecord[]> {
  const live = await resolveKickLive(userId);
  const slots = new Map(rows.map((row) => [row.id, row.last_sent_slot]));
  return runMessageTimerPass({
    timers: rows.map(toCandidate),
    nowMs,
    liveFor: () => live,
    slots: slotStore(userId, slots),
    send: async ({ channelId, message }) =>
      sendKickChatMessage(userId, channelId, message, null, { userOnly: true }),
  });
}

function queryFailure(): TimerPassRecord {
  return {
    timerId: "none",
    channelId: null,
    streamSessionId: null,
    live: "UNKNOWN",
    dueAt: null,
    result: "skipped",
    skipReason: "timer_query_failed",
    dedupe: "not_attempted",
    intervalIndex: null,
  };
}

export async function runScheduledMessageTimers(now = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("message_timers")
    .select("id, user_id, message, interval_minutes, enabled, platforms, updated_at, last_sent_slot")
    .eq("enabled", true);

  if (error) {
    const missing = error.code === "42703" || error.code === "PGRST204" || error.message.includes("last_sent_slot");
    console.log(
      timerLogLine({
        ...queryFailure(),
        skipReason: missing ? "last_sent_slot_missing" : "timer_query_failed",
        dedupe: missing ? "blocked" : "not_attempted",
      }),
    );
    return 0;
  }

  const rows = (data ?? []) as TimerRow[];
  const byUser = new Map<string, TimerRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const plan = planCronRotation(
    [...byUser.entries()].map(([userId, timers]) => ({ userId, timerIds: timers.map((timer) => timer.id) })),
    now.getTime(),
  );
  console.log(
    timerLogLine({
      timerId: "schedule",
      channelId: null,
      streamSessionId: null,
      live: "UNKNOWN",
      dueAt: null,
      result: "skipped",
      skipReason: plan.deferredUserIds.length ? "cron_rotation_deferred" : "cron_rotation",
      dedupe: "not_attempted",
      intervalIndex: plan.cycleMinutes,
    }),
  );

  const dueIds = new Set(plan.run.flatMap((piece) => piece.timerIds));
  let sent = 0;
  for (const piece of plan.run) {
    const pieceRows = (byUser.get(piece.userId) ?? []).filter((row) => dueIds.has(row.id) && piece.timerIds.includes(row.id));
    const records = await passForUser(piece.userId, pieceRows, now.getTime());
    logRecords(records);
    sent += records.filter((record) => record.result === "sent").length;
  }
  return sent;
}
