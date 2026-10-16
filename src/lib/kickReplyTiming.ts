export const KICK_REPLY_STAGES = [
  "webhook_received",
  "signature_verified",
  "channel_resolved",
  "command_matched",
  "command_executed",
  "db_done",
  "chat_request_started",
  "chat_response_received",
] as const;

export type KickReplyStage = (typeof KICK_REPLY_STAGES)[number];

export type KickReplySample = {
  id: string;
  marks: Partial<Record<KickReplyStage, number>>;
};

export type KickReplySummary = {
  count: number;
  p50: number;
  p95: number;
  max: number;
};

export function createKickReplyTrace(id: string, now: () => number = () => performance.now()) {
  const marks: Partial<Record<KickReplyStage, number>> = {};
  return {
    mark(stage: KickReplyStage) {
      if (marks[stage] == null) marks[stage] = now();
    },
    sample(): KickReplySample {
      return { id, marks: { ...marks } };
    },
  };
}

import { AsyncLocalStorage } from "node:async_hooks";

export type KickReplyTrace = ReturnType<typeof createKickReplyTrace>;

const active = new AsyncLocalStorage<KickReplyTrace>();

export function bindKickReplyTrace<T>(trace: KickReplyTrace, fn: () => T): T {
  return active.run(trace, fn);
}

export function markActiveKickReply(stage: KickReplyStage): void {
  active.getStore()?.mark(stage);
}

export function workerReplyMs(sample: KickReplySample): number | null {
  const start = sample.marks.webhook_received;
  const end = sample.marks.chat_response_received;
  if (start == null || end == null) return null;
  return Math.max(0, end - start);
}

export function summarizeKickReplyMs(values: readonly number[]): KickReplySummary {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, p50: 0, p95: 0, max: 0 };
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

export function logKickReplyTrace(trace: KickReplyTrace): void {
  const sample = trace.sample();
  const origin = sample.marks.webhook_received ?? 0;
  const relative: Partial<Record<KickReplyStage, number>> = {};
  for (const stage of KICK_REPLY_STAGES) {
    const at = sample.marks[stage];
    if (at != null) relative[stage] = Math.round(at - origin);
  }
  console.log(
    "[kick-reply] timing",
    JSON.stringify({
      id: sample.id,
      relativeMs: relative,
      workerMs: workerReplyMs(sample),
    }),
  );
}
