/**
 * Subathon timer authority.
 *
 * While the timer is running, the only source of truth is an absolute end
 * timestamp: remainingMs = max(0, endAtMs - monotonicNowMs). A React second
 * counter is not the authority. Each view may refresh its own display; none
 * of them own the end time.
 *
 * Display rounding policy (one policy, everywhere):
 *   displayedSeconds = remainingMs <= 0 ? 0 : ceil(floor(remainingMs) / 1000)
 * The shown second is the smallest whole number of seconds that still covers
 * the remaining milliseconds. It drops when the remainder crosses an exact
 * second boundary, and it stays through the partial second. A natural
 * countdown's remainingMs never increases, and ceil of a non-increasing value
 * never increases. An authorized add moves endAtMs (or the paused remainder)
 * by exactly deltaSeconds * 1000, so the displayed second changes by exactly
 * that many seconds. This is not a clamp that forces the digits to only fall.
 *
 * Server offset is a constant NTP correction, not a per-frame tweak.
 * Two timed samples give offset = serverTime - (t0 + t1) / 2, using the
 * sample with the smaller round trip. After that lock, "now" is the
 * monotonic clock plus that constant. Later SSE snapshots do not measure
 * a new offset: receive-time `serverTime - Date.now()` includes one-way
 * delay and was the +1s bounce. A device wall-clock change after the
 * anchor does not move the end.
 */

export type TimerStatus = "IDLE" | "RUNNING" | "PAUSED" | "ENDED";

export type TimerSource = "manual" | "webhook" | "realtime" | "sync";

export type TimerSnapshot = {
  status: TimerStatus;
  /** Second-bank stored in `timer_states.remaining_seconds`. Not the live display. */
  accumulatedSeconds: number;
  /** ISO timestamp of the running segment anchor, null otherwise. */
  startedAt: string | null;
  pausedAt: string | null;
  expiresAt: string | null;
  totalAddedSeconds: number;
  maxTimeSeconds: number | null;
  /** `timer_states.updated_at` in epoch ms. 0 when the row did not carry one. */
  revision: number;
};

export type TimerFrame = TimerSnapshot & {
  /** Display seconds at `serverTime`. Informational. Not the authority. */
  remainingSeconds: number;
  remainingMs: number;
  endAtMs: number | null;
  serverTime: number;
  /** Client NTP offset once locked. Frames from the server leave this 0. */
  serverOffsetMs: number;
};

export type TimerView = {
  status: TimerStatus;
  endAtMs: number | null;
  remainingMs: number;
  displayedSeconds: number;
  revision: number;
  serverOffsetMs: number;
};

export type TimerLogEntry = TimerView & {
  reason: string;
  source: TimerSource | "display";
  eventId: string | null;
  deltaMs: number;
};

export type ClockReading = { wallMs: number; perfMs: number };

/** Unlocked offset. A locked session replaces this with the NTP estimate. */
export const SERVER_OFFSET_MS = 0;

/**
 * One timed exchange with the server. `t0` is the client clock when the
 * request was sent, `t1` when the response was received, and `serverTime`
 * is the server clock on that response.
 */
export type NtpSample = {
  t0: number;
  t1: number;
  serverTime: number;
};

/** Standard NTP midpoint: serverTime minus the client time at the halfway point. */
export function ntpOffsetMs(sample: NtpSample): number {
  if (!Number.isFinite(sample.t0) || !Number.isFinite(sample.t1) || !Number.isFinite(sample.serverTime)) {
    return Number.NaN;
  }
  if (sample.t1 < sample.t0) return Number.NaN;
  return Math.round(sample.serverTime - (sample.t0 + sample.t1) / 2);
}

/**
 * Lock value from at least two samples. The tighter round trip wins so a
 * slow sample cannot drag the clock. Returns null until two finite samples exist.
 */
export function selectNtpOffset(samples: readonly NtpSample[]): number | null {
  let best: NtpSample | null = null;
  let runners = 0;
  for (const sample of samples) {
    const offset = ntpOffsetMs(sample);
    if (!Number.isFinite(offset)) continue;
    runners += 1;
    if (!best || sample.t1 - sample.t0 < best.t1 - best.t0) best = sample;
  }
  if (!best || runners < 2) return null;
  return ntpOffsetMs(best);
}

export function clampRemaining(seconds: number, maxTimeSeconds: number | null): number {
  const floored = Math.max(0, Math.floor(seconds));
  if (maxTimeSeconds == null) return floored;
  return Math.min(floored, Math.max(0, Math.floor(maxTimeSeconds)));
}

export function clampMs(ms: number, maxTimeSeconds: number | null): number {
  const safe = Math.max(0, Math.floor(ms));
  if (maxTimeSeconds == null) return safe;
  return Math.min(safe, Math.max(0, Math.floor(maxTimeSeconds)) * 1000);
}

/**
 * Whole seconds still covering `remainingMs`. See the module note.
 * Zero stays zero so the clock can finish.
 */
export function displayedSeconds(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.ceil(Math.floor(remainingMs) / 1000);
}

export function runningEndAtMs(state: TimerSnapshot): number | null {
  if (state.status !== "RUNNING" || !state.startedAt) return null;
  const started = Date.parse(state.startedAt);
  if (!Number.isFinite(started)) return null;
  return started + state.accumulatedSeconds * 1000;
}

/**
 * Paused remainder. `expires_at - paused_at` is the exact millisecond hold.
 * `remaining_seconds` is the whole-second bank. A webhook that only bumps the
 * bank (current SQL) and a webhook that also extends `expires_at` (pending
 * migration) both resolve to the same hold: bank whole seconds plus the
 * stored fractional millisecond.
 */
export function heldRemainingMs(state: TimerSnapshot): number {
  if (state.status === "ENDED") return 0;
  const bankMs = Math.max(0, Math.floor(state.accumulatedSeconds) * 1000);
  if (state.status === "PAUSED" && state.pausedAt && state.expiresAt) {
    const paused = Date.parse(state.pausedAt);
    const expires = Date.parse(state.expiresAt);
    const exact = expires - paused;
    if (Number.isFinite(exact) && exact >= 0) {
      const whole = Math.floor(exact / 1000) * 1000;
      const fraction = exact - whole;
      return bankMs + fraction > 0 ? bankMs + fraction : 0;
    }
  }
  return bankMs;
}

export function remainingMsAt(state: TimerSnapshot, nowMs: number): number {
  if (state.status === "ENDED") return 0;
  const endAt = runningEndAtMs(state);
  if (endAt != null) return Math.max(0, endAt - nowMs);
  return heldRemainingMs(state);
}

/** Display seconds for a snapshot at `nowMs`. */
export function computeRemaining(state: TimerSnapshot, nowMs: number = Date.now()): number {
  return displayedSeconds(remainingMsAt(state, nowMs));
}

export function timerTimeKey(state: TimerSnapshot): string {
  return [
    state.status,
    state.accumulatedSeconds,
    state.startedAt ?? "",
    state.pausedAt ?? "",
    state.expiresAt ?? "",
    state.maxTimeSeconds ?? "",
  ].join("|");
}

export function rowAuthorityKey(row: {
  status: string;
  remaining_seconds: number;
  started_at: string | null;
  paused_at: string | null;
  expires_at: string | null;
  total_added_seconds: number;
  updated_at?: string | null;
}): string {
  return [
    row.status,
    row.remaining_seconds,
    row.started_at ?? "",
    row.paused_at ?? "",
    row.expires_at ?? "",
    row.total_added_seconds,
    row.updated_at ?? "",
  ].join("|");
}

/** Encode an exact running remainder so `started_at + remaining_seconds` is `endAtMs`. */
export function encodeRunning(endAtMs: number, remainingMs: number): {
  remaining_seconds: number;
  started_at: string;
  expires_at: string;
} {
  const safeMs = Math.max(0, Math.floor(remainingMs));
  const bank = safeMs === 0 ? 0 : Math.ceil(safeMs / 1000);
  const startedAtMs = endAtMs - bank * 1000;
  return {
    remaining_seconds: bank,
    started_at: new Date(startedAtMs).toISOString(),
    expires_at: new Date(endAtMs).toISOString(),
  };
}

/** Encode an exact paused hold. The fraction lives in `expires_at - paused_at`. */
export function encodePaused(anchorMs: number, remainingMs: number): {
  remaining_seconds: number;
  paused_at: string;
  expires_at: string;
} {
  const safe = Math.max(0, Math.floor(remainingMs));
  return {
    remaining_seconds: Math.floor(safe / 1000),
    paused_at: new Date(anchorMs).toISOString(),
    expires_at: new Date(anchorMs + safe).toISOString(),
  };
}

export function toFrame(state: TimerSnapshot, nowMs: number = Date.now()): TimerFrame {
  const endAtMs = runningEndAtMs(state);
  const remainingMs = remainingMsAt(state, nowMs);
  return {
    ...state,
    remainingMs,
    endAtMs,
    remainingSeconds: displayedSeconds(remainingMs),
    serverTime: nowMs,
    serverOffsetMs: SERVER_OFFSET_MS,
  };
}

/** Maps a `timer_states` row (+ subathon cap) into a snapshot. */
export function snapshotFromRow(
  row: {
    status: TimerStatus;
    remaining_seconds: number;
    started_at: string | null;
    paused_at: string | null;
    expires_at: string | null;
    total_added_seconds: number;
    updated_at?: string | null;
  },
  maxTimeSeconds: number | null,
): TimerSnapshot {
  const revision = row.updated_at ? Date.parse(row.updated_at) : 0;
  return {
    status: row.status,
    accumulatedSeconds: row.remaining_seconds,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    expiresAt: row.expires_at,
    totalAddedSeconds: row.total_added_seconds,
    maxTimeSeconds,
    revision: Number.isFinite(revision) ? revision : 0,
  };
}

export function snapshotFromFrame(frame: TimerFrame): TimerSnapshot {
  return {
    status: frame.status,
    accumulatedSeconds: frame.accumulatedSeconds,
    startedAt: frame.startedAt,
    pausedAt: frame.pausedAt,
    expiresAt: frame.expiresAt,
    totalAddedSeconds: frame.totalAddedSeconds,
    maxTimeSeconds: frame.maxTimeSeconds,
    revision: frame.revision,
  };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export class MonotonicClock {
  private originWall: number;
  private originPerf: number;

  constructor(sample: ClockReading) {
    this.originWall = sample.wallMs;
    this.originPerf = sample.perfMs;
  }

  now(sample: ClockReading): number {
    return this.originWall + (sample.perfMs - this.originPerf);
  }
}

function viewOf(state: TimerSnapshot | null, nowMs: number, serverOffsetMs: number): TimerView {
  if (!state) {
    return {
      status: "IDLE",
      endAtMs: null,
      remainingMs: 0,
      displayedSeconds: 0,
      revision: 0,
      serverOffsetMs,
    };
  }
  const remainingMs = remainingMsAt(state, nowMs);
  const endAtMs = runningEndAtMs(state);
  const status: TimerStatus =
    state.status === "RUNNING" && remainingMs <= 0 ? "ENDED" : state.status;
  return {
    status,
    endAtMs,
    remainingMs,
    displayedSeconds: displayedSeconds(remainingMs),
    revision: state.revision,
    serverOffsetMs,
  };
}

/**
 * One timer. Preview, the control panel, and each OBS browser source keep
 * their own instance and their own display interval, and they all read the
 * same end timestamp out of the latest accepted snapshot.
 */
export class SubathonTimerSession {
  readonly entries: TimerLogEntry[] = [];
  private offsetMs = SERVER_OFFSET_MS;
  private offsetLocked = false;
  private snapshot: TimerSnapshot | null = null;
  private timeKey = "";
  private appliedRevision = 0;
  private readonly appliedEventIds = new Set<string>();
  private clock: MonotonicClock | null = null;
  private lastNow: number | null = null;
  private zeroLogged = false;

  get serverOffsetMs(): number {
    return this.offsetMs;
  }

  /**
   * Apply one constant correction from at least two RTT samples.
   * Further calls, including every later SSE frame, do not move it.
   */
  lockNtpOffset(samples: readonly NtpSample[]): number | null {
    if (this.offsetLocked) return this.offsetMs;
    const next = selectNtpOffset(samples);
    if (next == null) return null;
    const delta = next - this.offsetMs;
    this.offsetMs = next;
    this.offsetLocked = true;
    if (this.lastNow != null) this.lastNow += delta;
    return this.offsetMs;
  }

  now(reading: ClockReading): number {
    if (!this.clock) this.clock = new MonotonicClock(reading);
    const sample = Math.floor(this.clock.now(reading) + this.offsetMs);
    if (this.lastNow != null && sample < this.lastNow) return this.lastNow;
    this.lastNow = sample;
    return sample;
  }

  viewAt(nowMs: number): TimerView {
    return viewOf(this.snapshot, nowMs, this.offsetMs);
  }

  project(reading: ClockReading): TimerView {
    const nowMs = this.now(reading);
    const view = this.viewAt(nowMs);
    if (view.status === "ENDED" && this.snapshot?.status === "RUNNING" && !this.zeroLogged) {
      this.zeroLogged = true;
      this.entries.push({
        ...view,
        reason: "reach_zero",
        source: "display",
        eventId: null,
        deltaMs: 0,
      });
    }
    return view;
  }

  /**
   * Accept a persisted or realtime snapshot. Identical authority is ignored.
   * An older revision cannot move the end time. Derived display seconds on
   * the frame are not read.
   */
  adopt(next: TimerSnapshot, source: TimerSource, nowMs: number): TimerView {
    const key = timerTimeKey(next);
    const current = this.viewAt(nowMs);
    if (this.snapshot && key === this.timeKey) return current;
    if (
      this.snapshot &&
      next.revision > 0 &&
      next.revision <= this.appliedRevision &&
      key !== this.timeKey
    ) {
      this.entries.push({
        ...current,
        reason: "stale_snapshot",
        source,
        eventId: null,
        deltaMs: 0,
      });
      return current;
    }
    const prev = this.snapshot;
    const reason = remoteReason(prev, next, nowMs);
    return this.commit(next, reason, source, nowMs, null, true);
  }

  adoptFrame(frame: TimerFrame, source: TimerSource, nowMs: number): TimerView {
    return this.adopt(snapshotFromFrame(frame), source, nowMs);
  }

  start(seconds: number, nowMs: number, source: TimerSource = "manual"): TimerView {
    if (this.snapshot?.status === "RUNNING") return this.viewAt(nowMs);
    const held = clampMs(Math.max(0, Math.floor(seconds)) * 1000, this.snapshot?.maxTimeSeconds ?? null);
    return this.commit(this.runningFrom(held, nowMs, this.snapshot?.totalAddedSeconds ?? 0), held > 0 ? "start" : "reach_zero", source, nowMs, null);
  }

  pause(nowMs: number, source: TimerSource = "manual"): TimerView {
    const current = this.snapshot;
    if (!current || current.status !== "RUNNING") return this.viewAt(nowMs);
    const held = remainingMsAt(current, nowMs);
    const encoded = encodePaused(nowMs, held);
    return this.commit(
      {
        ...current,
        status: "PAUSED",
        accumulatedSeconds: encoded.remaining_seconds,
        startedAt: null,
        pausedAt: encoded.paused_at,
        expiresAt: encoded.expires_at,
      },
      "pause",
      source,
      nowMs,
      null,
    );
  }

  resume(nowMs: number, source: TimerSource = "manual"): TimerView {
    const current = this.snapshot;
    if (!current || current.status !== "PAUSED") return this.viewAt(nowMs);
    const held = heldRemainingMs(current);
    return this.commit(this.runningFrom(held, nowMs, current.totalAddedSeconds), "resume", source, nowMs, null);
  }

  reset(initialSeconds: number, nowMs: number, source: TimerSource = "manual"): TimerView {
    const seconds = clampRemaining(initialSeconds, this.snapshot?.maxTimeSeconds ?? null);
    const base = this.snapshot;
    return this.commit(
      {
        status: "IDLE",
        accumulatedSeconds: seconds,
        startedAt: null,
        pausedAt: null,
        expiresAt: null,
        totalAddedSeconds: 0,
        maxTimeSeconds: base?.maxTimeSeconds ?? null,
        revision: 0,
      },
      "reset",
      source,
      nowMs,
      null,
    );
  }

  adjust(deltaSeconds: number, nowMs: number, source: TimerSource = "manual", eventId: string | null = null): TimerView {
    return this.shift(deltaSeconds, nowMs, source, source === "manual" ? "manual_adjust" : "server_correction", eventId);
  }

  setSeconds(seconds: number, nowMs: number, source: TimerSource = "manual"): TimerView {
    const current = this.snapshot;
    const target = clampMs(Math.max(0, Math.floor(seconds)) * 1000, current?.maxTimeSeconds ?? null);
    return this.place(target, nowMs, source, "manual_set", null);
  }

  applyWebhook(eventId: string, deltaSeconds: number, nowMs: number): TimerView {
    if (this.appliedEventIds.has(eventId)) {
      const view = this.viewAt(nowMs);
      this.entries.push({
        ...view,
        reason: "duplicate_webhook",
        source: "webhook",
        eventId,
        deltaMs: 0,
      });
      return view;
    }
    this.appliedEventIds.add(eventId);
    return this.shift(deltaSeconds, nowMs, "webhook", "webhook_add", eventId);
  }

  correct(deltaSeconds: number, nowMs: number, eventId: string | null = null): TimerView {
    return this.shift(deltaSeconds, nowMs, "sync", "server_correction", eventId);
  }

  private place(
    nextMs: number,
    nowMs: number,
    source: TimerSource,
    reason: string,
    eventId: string | null,
  ): TimerView {
    const current = this.snapshot;
    const capped = clampMs(nextMs, current?.maxTimeSeconds ?? null);
    if (!current || current.status === "IDLE" || current.status === "ENDED") {
      return this.commit(
        {
          status: capped <= 0 ? "ENDED" : "IDLE",
          accumulatedSeconds: Math.floor(capped / 1000),
          startedAt: null,
          pausedAt: null,
          expiresAt: null,
          totalAddedSeconds: current?.totalAddedSeconds ?? 0,
          maxTimeSeconds: current?.maxTimeSeconds ?? null,
          revision: 0,
        },
        reason,
        source,
        nowMs,
        eventId,
      );
    }
    if (current.status === "PAUSED") {
      const anchor = current.pausedAt ? Date.parse(current.pausedAt) : nowMs;
      const encoded = encodePaused(Number.isFinite(anchor) ? anchor : nowMs, capped);
      return this.commit(
        {
          ...current,
          status: capped <= 0 ? "ENDED" : "PAUSED",
          accumulatedSeconds: encoded.remaining_seconds,
          startedAt: null,
          pausedAt: capped <= 0 ? null : encoded.paused_at,
          expiresAt: capped <= 0 ? null : encoded.expires_at,
        },
        reason,
        source,
        nowMs,
        eventId,
      );
    }
    if (capped <= 0) {
      return this.commit(
        { ...current, status: "ENDED", accumulatedSeconds: 0, startedAt: null, pausedAt: null, expiresAt: null },
        reason,
        source,
        nowMs,
        eventId,
      );
    }
    return this.commit(this.runningFrom(capped, nowMs, current.totalAddedSeconds), reason, source, nowMs, eventId);
  }

  private shift(
    deltaSeconds: number,
    nowMs: number,
    source: TimerSource,
    reason: string,
    eventId: string | null,
  ): TimerView {
    const current = this.snapshot;
    const baseMs = current ? remainingMsAt(current, nowMs) : 0;
    const nextMs = clampMs(baseMs + Math.trunc(deltaSeconds) * 1000, current?.maxTimeSeconds ?? null);
    if (!current || current.status === "IDLE" || current.status === "ENDED") {
      const seconds = Math.floor(nextMs / 1000);
      return this.commit(
        {
          status: nextMs <= 0 ? "ENDED" : current?.status === "ENDED" && nextMs > 0 ? "IDLE" : (current?.status ?? "IDLE"),
          accumulatedSeconds: seconds,
          startedAt: null,
          pausedAt: null,
          expiresAt: null,
          totalAddedSeconds: (current?.totalAddedSeconds ?? 0) + Math.max(0, Math.trunc(deltaSeconds)),
          maxTimeSeconds: current?.maxTimeSeconds ?? null,
          revision: 0,
        },
        reason,
        source,
        nowMs,
        eventId,
      );
    }
    if (current.status === "PAUSED") {
      const anchor = current.pausedAt ? Date.parse(current.pausedAt) : nowMs;
      const encoded = encodePaused(Number.isFinite(anchor) ? anchor : nowMs, nextMs);
      return this.commit(
        {
          ...current,
          status: nextMs <= 0 ? "ENDED" : "PAUSED",
          accumulatedSeconds: encoded.remaining_seconds,
          startedAt: null,
          pausedAt: nextMs <= 0 ? null : encoded.paused_at,
          expiresAt: nextMs <= 0 ? null : encoded.expires_at,
          totalAddedSeconds: current.totalAddedSeconds + Math.max(0, Math.trunc(deltaSeconds)),
        },
        reason,
        source,
        nowMs,
        eventId,
      );
    }
    if (nextMs <= 0) {
      return this.commit(
        {
          ...current,
          status: "ENDED",
          accumulatedSeconds: 0,
          startedAt: null,
          pausedAt: null,
          expiresAt: null,
        },
        reason,
        source,
        nowMs,
        eventId,
      );
    }
    return this.commit(this.runningFrom(nextMs, nowMs, current.totalAddedSeconds + Math.max(0, Math.trunc(deltaSeconds))), reason, source, nowMs, eventId);
  }

  private runningFrom(remainingMs: number, nowMs: number, totalAddedSeconds: number): TimerSnapshot {
    const capped = clampMs(remainingMs, this.snapshot?.maxTimeSeconds ?? null);
    const encoded = encodeRunning(nowMs + capped, capped);
    return {
      status: capped <= 0 ? "ENDED" : "RUNNING",
      accumulatedSeconds: encoded.remaining_seconds,
      startedAt: capped <= 0 ? null : encoded.started_at,
      pausedAt: null,
      expiresAt: capped <= 0 ? null : encoded.expires_at,
      totalAddedSeconds,
      maxTimeSeconds: this.snapshot?.maxTimeSeconds ?? null,
      revision: 0,
    };
  }

  private commit(
    next: TimerSnapshot,
    reason: string,
    source: TimerSource,
    nowMs: number,
    eventId: string | null,
    external = false,
  ): TimerView {
    const before = remainingMsAt(this.snapshot ?? endedSnapshot(), nowMs);
    const revision =
      external && next.revision > 0 ? next.revision : Math.max(nowMs, this.appliedRevision + 1);
    const stored: TimerSnapshot = { ...next, revision };
    this.snapshot = stored;
    this.timeKey = timerTimeKey(stored);
    this.appliedRevision = Math.max(this.appliedRevision, revision);
    if (remainingMsAt(stored, nowMs) > 0) this.zeroLogged = false;
    const view = this.viewAt(nowMs);
    this.entries.push({
      ...view,
      reason,
      source,
      eventId,
      deltaMs: view.remainingMs - before,
    });
    return view;
  }
}

function endedSnapshot(): TimerSnapshot {
  return {
    status: "ENDED",
    accumulatedSeconds: 0,
    startedAt: null,
    pausedAt: null,
    expiresAt: null,
    totalAddedSeconds: 0,
    maxTimeSeconds: null,
    revision: 0,
  };
}

function remoteReason(prev: TimerSnapshot | null, next: TimerSnapshot, nowMs: number): string {
  if (!prev) return "snapshot";
  if (prev.status === "PAUSED" && next.status === "RUNNING") return "resume";
  if (prev.status !== "RUNNING" && next.status === "RUNNING") return "start";
  if (prev.status === "RUNNING" && next.status === "PAUSED") return "pause";
  if (next.status === "IDLE") return "reset";
  const delta = remainingMsAt(next, nowMs) - remainingMsAt(prev, nowMs);
  if (delta !== 0) return "server_correction";
  return "snapshot";
}

/** Display refresh only. Does not move the authoritative end time. */
export function startDisplayLoop(
  session: SubathonTimerSession,
  readClock: () => ClockReading,
  onView: (view: TimerView) => void,
  intervalMs = 250,
): () => void {
  const id = setInterval(() => {
    onView(session.project(readClock()));
  }, intervalMs);
  return () => clearInterval(id);
}
