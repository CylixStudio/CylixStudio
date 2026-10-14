/**
 * Message-timer airtime math and slot claims.
 *
 * Enable / settings rule: a slot is eligible only when its due time is strictly
 * after both this stream's start and the timer row's updated_at. updated_at
 * moves when the timer is created, enabled, or its message or interval changes.
 * Enabling mid-stream does not backfill earlier slots of this stream. The first
 * send is the next interval boundary after that change. A new stream session
 * (new id or new started_at) starts elapsed time at zero. A late run sends only
 * the single current interval index, never the missed ones. Offline time is not
 * counted because elapsed time comes only from a LIVE started_at.
 *
 * Claim key: channel id, timer id, stream session id, interval minutes, and
 * interval index. Interval length is part of the key so an interval edit cannot
 * reuse the previous index number. The claim is stored in last_sent_slot.
 * A failed Kick send keeps that slot: dedupe allows one attempt, not a retry.
 */

export type LivePhase = "LIVE" | "OFFLINE" | "UNKNOWN";

export type LiveFact =
  | { phase: "LIVE"; channelId: string; streamSessionId: string; startedAtMs: number }
  | { phase: "OFFLINE"; channelId: string | null }
  | { phase: "UNKNOWN"; channelId: string | null; reason: string };

export type TimerCandidate = {
  id: string;
  message: string;
  intervalMinutes: number;
  enabled: boolean;
  platforms: readonly string[];
  updatedAtMs: number;
};

export type TimerDecision = {
  action: "send" | "skip";
  claimKey: string | null;
  dueAtMs: number | null;
  intervalIndex: number | null;
  streamSessionId: string | null;
  live: LivePhase;
  channelId: string | null;
  skipReason: string | null;
};

export type ClaimOutcome = "claimed" | "lost" | "blocked";

export type ClaimResult = {
  ok: boolean;
  outcome: ClaimOutcome;
  reason: string;
};

export type SlotStore = {
  get(timerId: string): string | null | Promise<string | null>;
  claim(timerId: string, claimKey: string, dueAtMs: number | null): Promise<ClaimResult>;
};

export type SlotClaimInput = {
  timerId: string;
  userId: string;
  expectedSlot: string | null;
  claimKey: string;
  dueAtIso: string;
};

export type SlotClaimWrite = {
  data: { id: string }[] | null;
  error: { code?: string; message?: string } | null;
};

/** Workers Free allows 50 subrequests. Leave spare for a redirect. */
export const WORKERS_FREE_SUBREQUESTS = 50;
export const CRON_SUBREQUEST_BUDGET = 45;
/** Enabled-timer list. */
export const CRON_LIST_SUBREQUESTS = 1;
/**
 * Worst case before any send: broadcaster read, token read, token refresh,
 * token write, livestream GET.
 */
export const CRON_CHANNEL_LOOKUP_SUBREQUESTS = 5;
/** Slot UPDATE plus one chat POST. */
export const CRON_TIMER_SEND_SUBREQUESTS = 2;

export type ChannelWork = {
  userId: string;
  timerIds: string[];
};

export type TimerPassRecord = {
  timerId: string;
  channelId: string | null;
  streamSessionId: string | null;
  live: LivePhase;
  dueAt: string | null;
  result: "sent" | "skipped" | "send_failed";
  skipReason: string | null;
  dedupe: ClaimOutcome | "not_attempted";
  intervalIndex: number | null;
};

const CHANNEL_ID = /^\d{1,20}$/;

export function safeChannelId(raw: string | null | undefined): string | null {
  if (!raw || !CHANNEL_ID.test(raw)) return null;
  return raw;
}

export function timerClaimKey(parts: {
  channelId: string;
  timerId: string;
  streamSessionId: string;
  intervalMinutes: number;
  intervalIndex: number;
}): string {
  return [
    parts.channelId,
    parts.timerId,
    parts.streamSessionId,
    String(parts.intervalMinutes),
    String(parts.intervalIndex),
  ].join("|");
}

export function slotMovesBackward(current: string | null, nextKey: string): boolean {
  if (!current) return false;
  const previous = current.split("|");
  const next = nextKey.split("|");
  if (previous.length !== 5 || next.length !== 5) return false;
  const sameStream =
    previous[0] === next[0] && previous[1] === next[1] && previous[2] === next[2] && previous[3] === next[3];
  if (!sameStream) return false;
  const previousIndex = Number(previous[4]);
  const nextIndex = Number(next[4]);
  return Number.isInteger(previousIndex) && Number.isInteger(nextIndex) && nextIndex < previousIndex;
}

export function isMissingSlotColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return (error.message ?? "").includes("last_sent_slot");
}

/**
 * Mirrors the single UPDATE predicate on the row Postgres has locked.
 * A stale expected value does not match a newer committed slot, so an older
 * claim cannot overwrite it. A lower index for the same stream is also rejected.
 */
export function claimUpdateMatches(
  row: { enabled: boolean; lastSentSlot: string | null },
  input: { expectedSlot: string | null; claimKey: string },
): boolean {
  if (!row.enabled) return false;
  const expectedMatches = Object.is(row.lastSentSlot, input.expectedSlot);
  if (!expectedMatches) return false;
  if (Object.is(row.lastSentSlot, input.claimKey)) return false;
  if (slotMovesBackward(row.lastSentSlot, input.claimKey)) return false;
  return true;
}
export async function claimMessageTimerSlot(
  write: (input: SlotClaimInput) => Promise<SlotClaimWrite>,
  input: SlotClaimInput,
): Promise<ClaimResult> {
  if (input.expectedSlot === input.claimKey) {
    return { ok: false, outcome: "lost", reason: "already_claimed" };
  }
  if (slotMovesBackward(input.expectedSlot, input.claimKey)) {
    return { ok: false, outcome: "lost", reason: "slot_backward" };
  }
  const result = await write(input);
  if (result.error) {
    if (isMissingSlotColumn(result.error)) {
      return { ok: false, outcome: "blocked", reason: "last_sent_slot_missing" };
    }
    return { ok: false, outcome: "blocked", reason: "claim_failed" };
  }
  if (!result.data || result.data.length !== 1) {
    return { ok: false, outcome: "lost", reason: "already_claimed" };
  }
  return { ok: true, outcome: "claimed", reason: "claimed" };
}

export function channelWorkCost(timerCount: number): number {
  return CRON_CHANNEL_LOOKUP_SUBREQUESTS + CRON_TIMER_SEND_SUBREQUESTS * timerCount;
}

/**
 * Split channels into minutes that each stay inside the subrequest budget.
 * Every timer id appears in exactly one group, so a later minute reaches
 * channels that did not fit this minute.
 */
export function planCronRotation(
  channels: ChannelWork[],
  nowMs: number,
): {
  run: ChannelWork[];
  deferredUserIds: string[];
  estimatedSubrequests: number;
  cycleMinutes: number;
} {
  const maxTimers = Math.max(
    1,
    Math.floor(
      (CRON_SUBREQUEST_BUDGET - CRON_LIST_SUBREQUESTS - CRON_CHANNEL_LOOKUP_SUBREQUESTS) /
        CRON_TIMER_SEND_SUBREQUESTS,
    ),
  );
  const pieces: ChannelWork[] = [];
  const sorted = [...channels].sort((left, right) => left.userId.localeCompare(right.userId));
  for (const channel of sorted) {
    const timerIds = [...channel.timerIds].sort();
    if (!timerIds.length) continue;
    for (let index = 0; index < timerIds.length; index += maxTimers) {
      pieces.push({ userId: channel.userId, timerIds: timerIds.slice(index, index + maxTimers) });
    }
  }

  const groups: ChannelWork[][] = [];
  let current: ChannelWork[] = [];
  let spent = CRON_LIST_SUBREQUESTS;
  for (const piece of pieces) {
    const cost = channelWorkCost(piece.timerIds.length);
    if (spent + cost > CRON_SUBREQUEST_BUDGET && current.length) {
      groups.push(current);
      current = [];
      spent = CRON_LIST_SUBREQUESTS;
    }
    current.push(piece);
    spent += cost;
  }
  if (current.length) groups.push(current);
  if (!groups.length) {
    return { run: [], deferredUserIds: [], estimatedSubrequests: CRON_LIST_SUBREQUESTS, cycleMinutes: 1 };
  }

  const turn = Math.floor(nowMs / 60_000) % groups.length;
  const run = groups[turn] ?? [];
  const dueUsers = new Set(run.map((piece) => piece.userId));
  const deferredUserIds = sorted.map((channel) => channel.userId).filter((userId) => !dueUsers.has(userId));
  const estimatedSubrequests = run.reduce(
    (total, piece) => total + channelWorkCost(piece.timerIds.length),
    CRON_LIST_SUBREQUESTS,
  );
  return { run, deferredUserIds, estimatedSubrequests, cycleMinutes: groups.length };
}

/** In-memory row lock. Concurrent claims on one store resolve one winner. */
export function createMemorySlotStore(initial?: Record<string, string | null>): SlotStore {
  const rows = new Map<string, string | null>(Object.entries(initial ?? {}));
  let chain: Promise<void> = Promise.resolve();
  return {
    get(timerId) {
      return rows.get(timerId) ?? null;
    },
    claim(timerId, claimKey, _dueAtMs) {
      const run = chain.then(() => compareAndSet(rows, timerId, claimKey));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

function compareAndSet(
  rows: Map<string, string | null>,
  timerId: string,
  claimKey: string,
): ClaimResult {
  const current = rows.get(timerId) ?? null;
  if (current === claimKey) {
    return { ok: false, outcome: "lost", reason: "already_claimed" };
  }
  if (slotMovesBackward(current, claimKey)) {
    return { ok: false, outcome: "lost", reason: "slot_backward" };
  }
  rows.set(timerId, claimKey);
  return { ok: true, outcome: "claimed", reason: "claimed" };
}

export function decideMessageTimer(
  timer: TimerCandidate,
  live: LiveFact,
  nowMs: number,
  lastSentSlot: string | null,
): TimerDecision {
  const base = {
    claimKey: null,
    dueAtMs: null,
    intervalIndex: null,
    streamSessionId: live.phase === "LIVE" ? live.streamSessionId : null,
    live: live.phase,
    channelId: safeChannelId(live.channelId),
    skipReason: null as string | null,
  };

  if (!timer.enabled) return { ...base, action: "skip", skipReason: "disabled" };
  if (!timer.platforms.includes("KICK")) return { ...base, action: "skip", skipReason: "platform" };
  if (!timer.message.trim()) return { ...base, action: "skip", skipReason: "empty_message" };
  if (live.phase === "OFFLINE") return { ...base, action: "skip", skipReason: "offline" };
  if (live.phase === "UNKNOWN") {
    return { ...base, action: "skip", skipReason: live.reason || "unknown_live" };
  }

  const channelId = safeChannelId(live.channelId);
  if (!channelId) return { ...base, action: "skip", channelId: null, skipReason: "channel_unresolved" };
  if (!Number.isFinite(live.startedAtMs)) {
    return { ...base, action: "skip", channelId, skipReason: "started_at_missing" };
  }
  if (!Number.isInteger(timer.intervalMinutes) || timer.intervalMinutes < 1 || timer.intervalMinutes > 1440) {
    return { ...base, action: "skip", channelId, skipReason: "invalid_interval" };
  }
  if (!Number.isFinite(timer.updatedAtMs)) {
    return { ...base, action: "skip", channelId, skipReason: "schedule_floor_invalid" };
  }

  const intervalMs = timer.intervalMinutes * 60_000;
  const elapsed = nowMs - live.startedAtMs;
  if (elapsed < intervalMs) {
    return { ...base, action: "skip", channelId, skipReason: "before_first_slot" };
  }

  const intervalIndex = Math.floor(elapsed / intervalMs);
  const dueAtMs = live.startedAtMs + intervalIndex * intervalMs;
  const scheduleNotBefore = Math.max(live.startedAtMs, timer.updatedAtMs);
  const claimKey = timerClaimKey({
    channelId,
    timerId: timer.id,
    streamSessionId: live.streamSessionId,
    intervalMinutes: timer.intervalMinutes,
    intervalIndex,
  });
  const decided = {
    ...base,
    channelId,
    claimKey,
    dueAtMs,
    intervalIndex,
    streamSessionId: live.streamSessionId,
  };

  if (dueAtMs <= scheduleNotBefore) {
    return { ...decided, action: "skip", skipReason: "not_yet_forward" };
  }
  if (lastSentSlot === claimKey) {
    return { ...decided, action: "skip", skipReason: "already_claimed" };
  }
  return { ...decided, action: "send", skipReason: null };
}

export async function runMessageTimerPass(input: {
  timers: TimerCandidate[];
  nowMs: number;
  liveFor: (timer: TimerCandidate) => LiveFact | Promise<LiveFact>;
  slots: SlotStore;
  send: (send: { timerId: string; channelId: string; message: string }) => Promise<boolean>;
}): Promise<TimerPassRecord[]> {
  const records: TimerPassRecord[] = [];
  for (const timer of input.timers) {
    const live = await input.liveFor(timer);
    const decision = decideMessageTimer(timer, live, input.nowMs, await input.slots.get(timer.id));
    const dueAt = decision.dueAtMs == null ? null : new Date(decision.dueAtMs).toISOString();
    if (decision.action !== "send" || !decision.claimKey || !decision.channelId) {
      records.push({
        timerId: timer.id,
        channelId: decision.channelId,
        streamSessionId: decision.streamSessionId,
        live: decision.live,
        dueAt,
        result: "skipped",
        skipReason: decision.skipReason,
        dedupe: "not_attempted",
        intervalIndex: decision.intervalIndex,
      });
      continue;
    }

    const claim = await input.slots.claim(timer.id, decision.claimKey, decision.dueAtMs);
    if (!claim.ok) {
      records.push({
        timerId: timer.id,
        channelId: decision.channelId,
        streamSessionId: decision.streamSessionId,
        live: decision.live,
        dueAt,
        result: "skipped",
        skipReason: claim.reason,
        dedupe: claim.outcome,
        intervalIndex: decision.intervalIndex,
      });
      continue;
    }

    const sent = await input.send({
      timerId: timer.id,
      channelId: decision.channelId,
      message: timer.message.trim().slice(0, 480),
    });
    records.push({
      timerId: timer.id,
      channelId: decision.channelId,
      streamSessionId: decision.streamSessionId,
      live: decision.live,
      dueAt,
      result: sent ? "sent" : "send_failed",
      skipReason: sent ? null : "kick_send_failed",
      dedupe: "claimed",
      intervalIndex: decision.intervalIndex,
    });
  }
  return records;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickId(record: Record<string, unknown>): string | null {
  for (const key of ["id", "livestream_id", "stream_id", "session_id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  }
  return null;
}

function pickStartedAt(record: Record<string, unknown>): string | null {
  const nested = asRecord(record["livestream"]) ?? asRecord(record["stream"]);
  const sources = nested ? [nested, record] : [record];
  for (const source of sources) {
    for (const key of ["started_at", "startedAt", "start_time"]) {
      const value = source[key];
      if (typeof value !== "string" || !value) continue;
      if (!Number.isFinite(Date.parse(value))) continue;
      return value;
    }
  }
  return null;
}

function pickBroadcaster(record: Record<string, unknown>): string | null {
  const nested = asRecord(record["broadcaster"]);
  const candidates = [record["broadcaster_user_id"], record["user_id"], nested?.["user_id"], nested?.["id"]];
  for (const candidate of candidates) {
    const channelId = safeChannelId(typeof candidate === "number" ? String(candidate) : typeof candidate === "string" ? candidate : null);
    if (channelId) return channelId;
  }
  return null;
}

function explicitlyOffline(record: Record<string, unknown>): boolean {
  const nested = asRecord(record["livestream"]) ?? asRecord(record["stream"]);
  if (record["is_live"] === false) return true;
  if (nested?.["is_live"] === false) return true;
  return false;
}

/**
 * Official GET /public/v1/livestreams result.
 * HTTP 200 with an empty data array is OFFLINE. Any failed or ambiguous body is UNKNOWN.
 * A chat connection is not an input to this function.
 */
export function classifyKickLivestream(httpStatus: number, body: unknown, requestedChannelId: string): LiveFact {
  const channelId = safeChannelId(requestedChannelId);
  if (!channelId) return { phase: "UNKNOWN", channelId: null, reason: "channel_unresolved" };
  if (httpStatus !== 200) {
    return { phase: "UNKNOWN", channelId, reason: `live_http_${httpStatus}` };
  }
  const root = asRecord(body);
  if (!root || !("data" in root)) return { phase: "UNKNOWN", channelId, reason: "live_body_invalid" };
  const data = root["data"];
  if (data == null) return { phase: "UNKNOWN", channelId, reason: "live_body_invalid" };
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) return { phase: "OFFLINE", channelId };

  for (const item of list) {
    const record = asRecord(item);
    if (!record) continue;
    const broadcaster = pickBroadcaster(record);
    if (broadcaster !== channelId) continue;
    if (explicitlyOffline(record)) return { phase: "OFFLINE", channelId };
    const startedAt = pickStartedAt(record);
    if (!startedAt) return { phase: "UNKNOWN", channelId, reason: "started_at_missing" };
    const rawId = pickId(record) ?? pickId(asRecord(record["livestream"]) ?? {});
    return {
      phase: "LIVE",
      channelId,
      streamSessionId: `${rawId ?? ""}@${startedAt}`,
      startedAtMs: Date.parse(startedAt),
    };
  }

  return { phase: "UNKNOWN", channelId, reason: "broadcaster_mismatch" };
}

export function timerLogLine(record: TimerPassRecord): string {
  return JSON.stringify({
    source: "message_timer",
    timerId: record.timerId,
    channelId: record.channelId,
    streamSessionId: record.streamSessionId,
    live: record.live,
    dueAt: record.dueAt,
    result: record.result,
    skipReason: record.skipReason,
    dedupe: record.dedupe,
    intervalIndex: record.intervalIndex,
  });
}
