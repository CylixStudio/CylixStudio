/**
 * Read-only snapshot of an official Kick poll or prediction.
 * Totals come from the Kick payload. This module does not tally chat votes.
 *
 * Kick's public Events catalog (docs.kick.com, event-types) does not list
 * these yet. The parser accepts the names Kick uses on the existing chatroom
 * socket and the names a future webhook subscription would send:
 * PollStarted, PollUpdated, PollEnded, PollUpdateEvent, PollDeleteEvent,
 * poll.begin, channel.poll.progress, channel.poll.end,
 * PredictionStarted, PredictionUpdated, PredictionEnded,
 * channel.prediction.begin, channel.prediction.lock, channel.prediction.end.
 */

export type PollStatus = "idle" | "open" | "ended";

export type PollOption = {
  id: string;
  label: string;
  votes: number;
};

export type PollRuntime = {
  status: PollStatus;
  title: string;
  options: PollOption[];
  endsAt: string | null;
  hideAt: string | null;
  winnerId: string | null;
  updatedAt: string | null;
  eventName: string | null;
  lastMessageId: string | null;
  revision: number;
};

export type PredictionStatus = "idle" | "open" | "locked" | "resolved";

export type PredictionOutcome = {
  id: string;
  label: string;
  points: number;
  voters: number;
};

export type PredictionRuntime = {
  status: PredictionStatus;
  title: string;
  outcomes: PredictionOutcome[];
  endsAt: string | null;
  hideAt: string | null;
  winnerId: string | null;
  updatedAt: string | null;
  eventName: string | null;
  lastMessageId: string | null;
  revision: number;
};

export type KickInteractiveKind = "poll" | "prediction";
export type KickInteractivePhase = "start" | "update" | "lock" | "end" | "cancel";

const asRecord = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function emptyPollRuntime(): PollRuntime {
  return {
    status: "idle",
    title: "",
    options: [],
    endsAt: null,
    hideAt: null,
    winnerId: null,
    updatedAt: null,
    eventName: null,
    lastMessageId: null,
    revision: 0,
  };
}

export function emptyPredictionRuntime(): PredictionRuntime {
  return {
    status: "idle",
    title: "",
    outcomes: [],
    endsAt: null,
    hideAt: null,
    winnerId: null,
    updatedAt: null,
    eventName: null,
    lastMessageId: null,
    revision: 0,
  };
}

function compactName(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function classifyKickInteractiveEvent(
  type: string,
): { kind: KickInteractiveKind; phase: KickInteractivePhase } | null {
  const compact = compactName(type);
  if (!compact) return null;
  const kind: KickInteractiveKind | null = compact.includes("predict")
    ? "prediction"
    : compact.includes("poll")
      ? "poll"
      : null;
  if (!kind) return null;
  return { kind, phase: phaseFromCompact(compact) };
}

function phaseFromCompact(compact: string): KickInteractivePhase {
  if (/delete|cancel/.test(compact)) return "cancel";
  if (/lock/.test(compact)) return "lock";
  if (/(ended|end|closed|resolve)/.test(compact) && !compact.includes("extended")) return "end";
  if (/start|begin|creat/.test(compact)) return "start";
  return "update";
}

function collectRecords(body: unknown): Record<string, unknown>[] {
  const root = asRecord(parseJson(body));
  if (!root) return [];
  const seeds = [root, asRecord(root["data"]), asRecord(root["payload"]), asRecord(root["event"])].filter(
    (row): row is Record<string, unknown> => row != null,
  );
  const records: Record<string, unknown>[] = [];
  for (const source of seeds) {
    records.push(source);
    for (const key of ["poll", "prediction"]) {
      const nested = asRecord(source[key]);
      if (nested) records.push(nested);
    }
  }
  return records;
}

function firstString(records: Record<string, unknown>[], keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
  }
  return null;
}

function firstNumber(records: Record<string, unknown>[], keys: string[]): { value: number; key: string } | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (Number.isFinite(number)) return { value: number, key };
    }
  }
  return null;
}

function durationMs(value: number, key: string): number {
  if (/ms|milli/i.test(key)) return value;
  if (/second/i.test(key)) return value * 1000;
  return value > 7200 ? value : value * 1000;
}

function readEndsAt(records: Record<string, unknown>[], now: number, phase: KickInteractivePhase): string | null {
  const iso = firstString(records, ["ends_at", "endsAt", "end_time", "locks_at", "locked_at"]);
  if (iso) {
    const parsed = Date.parse(iso);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (phase === "end" || phase === "cancel" || phase === "lock") return null;
  const remaining = firstNumber(records, [
    "remaining",
    "remaining_ms",
    "remaining_seconds",
    "time_left",
    "seconds_left",
    "duration",
    "duration_ms",
    "duration_seconds",
  ]);
  if (!remaining || remaining.value <= 0) return null;
  return new Date(now + durationMs(remaining.value, remaining.key)).toISOString();
}

function revealMs(records: Record<string, unknown>[]): number {
  const display = firstNumber(records, [
    "result_display_duration",
    "display_duration",
    "result_display_seconds",
  ]);
  if (!display) return 8000;
  return Math.min(60_000, Math.max(0, durationMs(display.value, display.key)));
}

function payloadPhase(records: Record<string, unknown>[], fallback: KickInteractivePhase): KickInteractivePhase {
  const state = compactName(firstString(records, ["state", "status"]) ?? "");
  if (!state || state === "update" || state === "progress") return fallback;
  return phaseFromCompact(state);
}

function readPollOptions(records: Record<string, unknown>[]): PollOption[] {
  for (const record of records) {
    for (const key of ["options", "choices", "answers"]) {
      const list = record[key];
      if (!Array.isArray(list)) continue;
      const options = list
        .map((item, index) => readPollOption(item, index))
        .filter((item): item is PollOption => item != null);
      if (options.length) return options.slice(0, 10);
    }
  }
  return [];
}

function readPollOption(value: unknown, index: number): PollOption | null {
  if (typeof value === "string" && value.trim()) {
    return { id: String(index), label: value.trim().slice(0, 80), votes: 0 };
  }
  const row = asRecord(value);
  if (!row) return null;
  const label = firstString([row], ["label", "text", "title", "name"]);
  if (!label) return null;
  const votes = firstNumber([row], ["votes", "vote_count", "votes_count", "total_votes", "count", "total"]);
  const id = firstString([row], ["id", "option_id"]) ?? String(index);
  return {
    id: id.slice(0, 80),
    label: label.slice(0, 80),
    votes: Math.max(0, Math.floor(votes?.value ?? 0)),
  };
}

function readOutcomes(records: Record<string, unknown>[]): PredictionOutcome[] {
  for (const record of records) {
    for (const key of ["outcomes", "options", "choices"]) {
      const list = record[key];
      if (!Array.isArray(list)) continue;
      const outcomes = list
        .map((item, index) => readOutcome(item, index))
        .filter((item): item is PredictionOutcome => item != null);
      if (outcomes.length) return outcomes.slice(0, 2);
    }
  }
  return [];
}

function readOutcome(value: unknown, index: number): PredictionOutcome | null {
  if (typeof value === "string" && value.trim()) {
    return { id: String(index), label: value.trim().slice(0, 80), points: 0, voters: 0 };
  }
  const row = asRecord(value);
  if (!row) return null;
  const label = firstString([row], ["title", "label", "text", "name"]);
  if (!label) return null;
  const points = firstNumber([row], ["total_points", "points", "channel_points", "stake", "amount"]);
  const voters = firstNumber([row], ["total_users", "voter_count", "voters", "user_count", "vote_count", "users"]);
  const votes = firstNumber([row], ["votes", "total_votes", "count"]);
  const id = firstString([row], ["id", "outcome_id"]) ?? String(index);
  return {
    id: id.slice(0, 80),
    label: label.slice(0, 80),
    points: Math.max(0, Math.floor(points?.value ?? votes?.value ?? 0)),
    voters: Math.max(0, Math.floor(voters?.value ?? 0)),
  };
}

function readWinnerId(records: Record<string, unknown>[]): string | null {
  const direct = firstString(records, [
    "winning_outcome_id",
    "winning_option_id",
    "winner_id",
    "winner_option_id",
  ]);
  if (direct) return direct.slice(0, 80);
  for (const record of records) {
    const winner = record["winning_outcome"] ?? record["winner"] ?? record["winning_option"];
    if (typeof winner === "string" && winner.trim()) return winner.trim().slice(0, 80);
    const row = asRecord(winner);
    const id = row ? firstString([row], ["id", "outcome_id", "option_id"]) : null;
    if (id) return id.slice(0, 80);
  }
  return null;
}

function stamp(
  eventName: string,
  messageId: string | null,
  revision: number,
  now: number,
): Pick<PollRuntime, "updatedAt" | "eventName" | "lastMessageId" | "revision"> {
  return {
    updatedAt: new Date(now).toISOString(),
    eventName: eventName.slice(0, 120),
    lastMessageId: messageId,
    revision,
  };
}

export function applyKickPoll(
  previous: PollRuntime | null,
  eventName: string,
  body: unknown,
  now = Date.now(),
  messageId: string | null = null,
): PollRuntime | null {
  const classified = classifyKickInteractiveEvent(eventName);
  if (!classified || classified.kind !== "poll") return null;
  const prev = previous ?? emptyPollRuntime();
  if (messageId && prev.lastMessageId === messageId) return prev;
  const records = collectRecords(body);
  const phase = payloadPhase(records, classified.phase);
  const meta = stamp(eventName, messageId, prev.revision + 1, now);
  if (phase === "cancel") return { ...emptyPollRuntime(), ...meta };
  const options = readPollOptions(records);
  const title = firstString(records, ["title", "question", "name"]) ?? prev.title;
  if (phase === "end") {
    return {
      ...meta,
      status: "ended",
      title,
      options: options.length ? options : prev.options,
      endsAt: new Date(now).toISOString(),
      hideAt: new Date(now + revealMs(records)).toISOString(),
      winnerId: readWinnerId(records),
    };
  }
  return {
    ...meta,
    status: "open",
    title,
    options: options.length ? options : prev.options,
    endsAt: readEndsAt(records, now, phase) ?? prev.endsAt,
    hideAt: null,
    winnerId: null,
  };
}

export function applyKickPrediction(
  previous: PredictionRuntime | null,
  eventName: string,
  body: unknown,
  now = Date.now(),
  messageId: string | null = null,
): PredictionRuntime | null {
  const classified = classifyKickInteractiveEvent(eventName);
  if (!classified || classified.kind !== "prediction") return null;
  const prev = previous ?? emptyPredictionRuntime();
  if (messageId && prev.lastMessageId === messageId) return prev;
  const records = collectRecords(body);
  const phase = payloadPhase(records, classified.phase);
  const meta = stamp(eventName, messageId, prev.revision + 1, now);
  if (phase === "cancel") return { ...emptyPredictionRuntime(), ...meta };
  const outcomes = readOutcomes(records);
  const title = firstString(records, ["title", "question", "name"]) ?? prev.title;
  const nextOutcomes = outcomes.length ? outcomes : prev.outcomes;
  if (phase === "end") {
    return {
      ...meta,
      status: "resolved",
      title,
      outcomes: nextOutcomes,
      endsAt: new Date(now).toISOString(),
      hideAt: new Date(now + revealMs(records)).toISOString(),
      winnerId: readWinnerId(records),
    };
  }
  if (phase === "lock") {
    return {
      ...meta,
      status: "locked",
      title,
      outcomes: nextOutcomes,
      endsAt: new Date(now).toISOString(),
      hideAt: null,
      winnerId: null,
    };
  }
  return {
    ...meta,
    status: "open",
    title,
    outcomes: nextOutcomes,
    endsAt: readEndsAt(records, now, phase) ?? prev.endsAt,
    hideAt: null,
    winnerId: null,
  };
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parsePollRuntime(raw: unknown): PollRuntime {
  const source = asRecord(asRecord(raw)?.["poll"]);
  if (!source || !Array.isArray(source["options"])) return emptyPollRuntime();
  const status: PollStatus = source["status"] === "open" || source["status"] === "ended" ? source["status"] : "idle";
  const options = source["options"]
    .map((item, index) => readPollOption(item, index))
    .filter((item): item is PollOption => item != null);
  const revision = finiteNumber(source["revision"]) ?? 0;
  return {
    status: options.length ? status : "idle",
    title: typeof source["title"] === "string" ? source["title"].slice(0, 120) : "",
    options,
    endsAt: typeof source["endsAt"] === "string" ? source["endsAt"] : null,
    hideAt: typeof source["hideAt"] === "string" ? source["hideAt"] : null,
    winnerId: typeof source["winnerId"] === "string" ? source["winnerId"] : null,
    updatedAt: typeof source["updatedAt"] === "string" ? source["updatedAt"] : null,
    eventName: typeof source["eventName"] === "string" ? source["eventName"] : null,
    lastMessageId: typeof source["lastMessageId"] === "string" ? source["lastMessageId"] : null,
    revision,
  };
}

export function parsePredictionRuntime(raw: unknown): PredictionRuntime {
  const source = asRecord(asRecord(raw)?.["prediction"]);
  if (!source || !Array.isArray(source["outcomes"])) return emptyPredictionRuntime();
  const status: PredictionStatus =
    source["status"] === "open" || source["status"] === "locked" || source["status"] === "resolved"
      ? source["status"]
      : "idle";
  const outcomes = source["outcomes"]
    .map((item, index) => readOutcome(item, index))
    .filter((item): item is PredictionOutcome => item != null);
  const revision = finiteNumber(source["revision"]) ?? 0;
  return {
    status: outcomes.length ? status : "idle",
    title: typeof source["title"] === "string" ? source["title"].slice(0, 120) : "",
    outcomes,
    endsAt: typeof source["endsAt"] === "string" ? source["endsAt"] : null,
    hideAt: typeof source["hideAt"] === "string" ? source["hideAt"] : null,
    winnerId: typeof source["winnerId"] === "string" ? source["winnerId"] : null,
    updatedAt: typeof source["updatedAt"] === "string" ? source["updatedAt"] : null,
    eventName: typeof source["eventName"] === "string" ? source["eventName"] : null,
    lastMessageId: typeof source["lastMessageId"] === "string" ? source["lastMessageId"] : null,
    revision,
  };
}

export function pollCardVisible(runtime: PollRuntime | null, now = Date.now()): boolean {
  if (!runtime || runtime.status === "idle" || runtime.options.length === 0) return false;
  if (!runtime.hideAt) return true;
  const hide = Date.parse(runtime.hideAt);
  return !Number.isFinite(hide) || hide > now;
}

export function predictionCardVisible(runtime: PredictionRuntime | null, now = Date.now()): boolean {
  if (!runtime || runtime.status === "idle" || runtime.outcomes.length === 0) return false;
  if (runtime.status !== "resolved" || !runtime.hideAt) return true;
  const hide = Date.parse(runtime.hideAt);
  return !Number.isFinite(hide) || hide > now;
}

export function preferNewer<T extends { updatedAt: string | null; revision: number }>(
  server: T | null,
  local: T | null,
): T | null {
  if (!local) return server;
  if (!server) return local;
  const localAt = Date.parse(local.updatedAt ?? "");
  const serverAt = Date.parse(server.updatedAt ?? "");
  if (Number.isFinite(localAt) && Number.isFinite(serverAt)) return localAt >= serverAt ? local : server;
  return local.revision >= server.revision ? local : server;
}

export function sharePercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((value) => Math.round((value / total) * 1000) / 10);
}
