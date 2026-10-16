import { AsyncLocalStorage } from "node:async_hooks";

export const KICK_RECEIPT_STATES = [
  "webhook_received",
  "command_execution_completed",
  "reply_delivery_pending",
  "reply_delivery_succeeded",
  "reply_delivery_failed",
  "reply_delivery_ambiguous",
] as const;

export type KickReceiptState = (typeof KICK_RECEIPT_STATES)[number];

export type KickReceipt = {
  userId: string;
  providerEventId: string;
  broadcasterUserId: string;
  state: KickReceiptState;
  replyText: string | null;
  kickMessageId: string | null;
  failureReason: string | null;
  updatedAt: number;
};

export type ReceiptPlan =
  | { action: "execute" }
  | { action: "retry_delivery"; replyText: string }
  | { action: "ack"; reason: "succeeded" | "ambiguous" | "pending" | "executed_without_reply" | "execution_unknown" }
  | { action: "busy" };


export type KickReceiptStage =
  | "webhook_received"
  | "command_matched"
  | "command_execution_started"
  | "command_execution_completed"
  | "reply_generated"
  | "reply_delivery_started"
  | "kick_api_response"
  | "reply_delivery_finalized"
  | "reply_session_missing"
  | "receipt_finalized_silent"
  | "receipt_finalized_untracked";

/** Safe structured stage log. Never pass message bodies, tokens, or Authorization. */
export function logKickReceiptStage(
  correlationId: string,
  stage: KickReceiptStage,
  extra?: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe: Record<string, string | number | boolean | null> = {
    tag: "kick-receipt",
    correlationId: correlationId.slice(0, 64),
    stage,
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) continue;
      if (/token|authorization|secret|password|refresh|bearer|content|body|reply/i.test(key)) continue;
      safe[key] = value;
    }
  }
  console.log(JSON.stringify(safe));
}

export function isReplyTerminalState(state: KickReceiptState): boolean {
  return (
    state === "reply_delivery_succeeded" ||
    state === "reply_delivery_failed" ||
    state === "reply_delivery_ambiguous" ||
    state === "reply_delivery_pending"
  );
}

/**
 * After command handlers return, close a receipt that never armed a reply.
 * Silent ignores keep command_execution_completed with an explicit failure_reason.
 * Expected replies that never updated the receipt get a failed/ambiguous terminal state.
 */
export async function finalizeKickReceiptAfterCommand(input: {
  board: ReceiptBoard;
  userId: string;
  providerEventId: string;
  now: number;
  commandStatus: string;
  commandReason?: string | null;
}): Promise<"unchanged" | "silent" | "untracked_reply" | "untracked_failure"> {
  const current = await input.board.read(input.userId, input.providerEventId);
  if (!current) return "unchanged";
  if (isReplyTerminalState(current.state) && current.replyText) return "unchanged";
  if (current.state === "reply_delivery_pending") return "unchanged";

  const reason = (input.commandReason ?? "").trim() || input.commandStatus;
  const silentReasons = new Set([
    "cooldown",
    "reserved",
    "disabled",
    "unpublished",
    "no_match",
    "not_a_command",
    "empty_text",
    "not_permitted",
  ]);
  const silent = input.commandStatus === "ignored" && silentReasons.has(reason);

  if (silent || input.commandStatus === "ignored") {
    const from = current.state === "webhook_received" ? "webhook_received" : "command_execution_completed";
    if (current.state !== "webhook_received" && current.state !== "command_execution_completed") return "unchanged";
    await input.board.compareAndSet(input.userId, input.providerEventId, from, {
      state: "command_execution_completed",
      failureReason: `silent:${reason || "ignored"}`,
      now: input.now,
    });
    logKickReceiptStage(input.providerEventId, "receipt_finalized_silent", { reason: reason || "ignored" });
    return "silent";
  }

  if (input.commandStatus === "replied") {
    const from = current.state === "webhook_received" ? "webhook_received" : "command_execution_completed";
    if (current.state !== "webhook_received" && current.state !== "command_execution_completed") return "unchanged";
    await input.board.compareAndSet(input.userId, input.providerEventId, from, {
      state: "reply_delivery_ambiguous",
      failureReason: "reply_untracked_after_handler",
      now: input.now,
    });
    logKickReceiptStage(input.providerEventId, "receipt_finalized_untracked", { commandStatus: "replied" });
    return "untracked_reply";
  }

  if (input.commandStatus === "error") {
    const from = current.state === "webhook_received" ? "webhook_received" : "command_execution_completed";
    if (current.state !== "webhook_received" && current.state !== "command_execution_completed") return "unchanged";
    await input.board.compareAndSet(input.userId, input.providerEventId, from, {
      state: "reply_delivery_failed",
      failureReason: reason || "command_error",
      now: input.now,
    });
    logKickReceiptStage(input.providerEventId, "receipt_finalized_untracked", {
      commandStatus: "error",
      reason: reason || "command_error",
    });
    return "untracked_failure";
  }

  return "unchanged";
}

const BUSY_MS = 20_000;

/** What a second isolate should do with a durable receipt. */
export function planKickReceipt(receipt: KickReceipt, now: number): ReceiptPlan {
  if (receipt.state === "reply_delivery_succeeded") return { action: "ack", reason: "succeeded" };
  if (receipt.state === "reply_delivery_ambiguous" || receipt.state === "reply_delivery_pending") {
    return { action: "ack", reason: receipt.state === "reply_delivery_pending" ? "pending" : "ambiguous" };
  }
  if (receipt.state === "reply_delivery_failed" && receipt.replyText) {
    return { action: "retry_delivery", replyText: receipt.replyText };
  }
  if (receipt.state === "command_execution_completed") {
    return { action: "ack", reason: "executed_without_reply" };
  }
  if (receipt.state === "webhook_received" && now - receipt.updatedAt < BUSY_MS) {
    return { action: "busy" };
  }
  return { action: "ack", reason: "execution_unknown" };
}

export function deliveryMayRetry(outcome: "sent" | "rejected" | "ambiguous" | "skipped"): boolean {
  return outcome === "rejected";
}

export type BotIdentityDecision = {
  ignore: boolean;
  learnSenderId: string | null;
};

/**
 * Ignore only a known Developer app bot id, or the chat message id this app
 * already received from Kick for its own send. Display name is never enough.
 */
export function decideAppBotIdentity(input: {
  senderUserId: string | null;
  configuredBotUserId: string | null;
  learnedBotUserId: string | null;
  incomingChatMessageId: string | null;
  outboundChatMessageId: string | null;
}): BotIdentityDecision {
  const sender = input.senderUserId?.trim() ?? "";
  const configured = input.configuredBotUserId?.trim() ?? "";
  const learned = input.learnedBotUserId?.trim() ?? "";
  if (sender && (sender === configured || sender === learned)) {
    return { ignore: true, learnSenderId: null };
  }
  const incoming = input.incomingChatMessageId?.trim() ?? "";
  const outbound = input.outboundChatMessageId?.trim() ?? "";
  if (incoming && outbound && incoming === outbound) {
    return { ignore: true, learnSenderId: sender || null };
  }
  return { ignore: false, learnSenderId: null };
}

export type StoredChatWrite = "granted" | "absent" | "unrecorded";

/** Empty storage is unrecorded. It is not treated as a granted or denied scope. */
export function storedChatWrite(scopes: readonly string[] | null | undefined): StoredChatWrite {
  if (!scopes || scopes.length === 0) return "unrecorded";
  return scopes.includes("chat:write") ? "granted" : "absent";
}

export function scopesFromIntrospection(scope: string | null | undefined): string[] | null {
  if (scope == null) return null;
  const list = scope.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  return list.length ? list : null;
}

export type ReceiptBoard = {
  claim(input: {
    userId: string;
    providerEventId: string;
    broadcasterUserId: string;
    now: number;
  }): Promise<KickReceipt | null>;
  read(userId: string, providerEventId: string): Promise<KickReceipt | null>;
  compareAndSet(
    userId: string,
    providerEventId: string,
    from: KickReceiptState,
    patch: Partial<Pick<KickReceipt, "state" | "replyText" | "kickMessageId" | "failureReason">> & { now: number },
  ): Promise<KickReceipt | null>;
  findOutbound(userId: string, kickMessageId: string): Promise<KickReceipt | null>;
  learnedBotUserId(): Promise<string | null>;
  learnBotUser(userId: string, messageId: string): Promise<void>;
};

export function createMemoryReceiptBoard(): ReceiptBoard {
  const rows = new Map<string, KickReceipt>();
  let learned: string | null = null;
  const key = (userId: string, eventId: string) => `${userId}\n${eventId}`;
  return {
    async claim(input) {
      const id = key(input.userId, input.providerEventId);
      const existing = rows.get(id);
      if (existing) return null;
      const row: KickReceipt = {
        userId: input.userId,
        providerEventId: input.providerEventId,
        broadcasterUserId: input.broadcasterUserId,
        state: "webhook_received",
        replyText: null,
        kickMessageId: null,
        failureReason: null,
        updatedAt: input.now,
      };
      rows.set(id, row);
      return row;
    },
    async read(userId, providerEventId) {
      return rows.get(key(userId, providerEventId)) ?? null;
    },
    async compareAndSet(userId, providerEventId, from, patch) {
      const row = rows.get(key(userId, providerEventId));
      if (!row || row.state !== from) return null;
      const next: KickReceipt = {
        ...row,
        state: patch.state ?? row.state,
        replyText: patch.replyText === undefined ? row.replyText : patch.replyText,
        kickMessageId: patch.kickMessageId === undefined ? row.kickMessageId : patch.kickMessageId,
        failureReason: patch.failureReason === undefined ? row.failureReason : patch.failureReason,
        updatedAt: patch.now,
      };
      rows.set(key(userId, providerEventId), next);
      return next;
    },
    async findOutbound(userId, kickMessageId) {
      for (const row of rows.values()) {
        if (row.userId === userId && row.kickMessageId === kickMessageId) return row;
      }
      return null;
    },
    async learnedBotUserId() {
      return learned;
    },
    async learnBotUser(userId, messageId) {
      if (!userId.trim() || !messageId.trim()) return;
      learned = userId.trim();
    },
  };
}

export async function markReplyPending(
  board: ReceiptBoard,
  userId: string,
  providerEventId: string,
  replyText: string,
  now: number,
): Promise<boolean> {
  const current = await board.read(userId, providerEventId);
  if (!current) return false;
  if (current.state === "reply_delivery_pending") return true;
  if (
    current.state !== "webhook_received" &&
    current.state !== "command_execution_completed" &&
    current.state !== "reply_delivery_failed"
  ) {
    return false;
  }
  const next = await board.compareAndSet(userId, providerEventId, current.state, {
    state: "reply_delivery_pending",
    replyText,
    now,
  });
  return Boolean(next);
}

export async function markReplyResult(
  board: ReceiptBoard,
  userId: string,
  providerEventId: string,
  outcome: DeliveryOutcome,
  now: number,
  kickMessageId: string | null,
  failureReason: string | null,
): Promise<void> {
  const state = outcome === "sent"
    ? "reply_delivery_succeeded"
    : outcome === "ambiguous"
      ? "reply_delivery_ambiguous"
      : "reply_delivery_failed";
  await board.compareAndSet(userId, providerEventId, "reply_delivery_pending", {
    state,
    kickMessageId,
    failureReason,
    now,
  });
}

export type DeliveryOutcome = "sent" | "rejected" | "ambiguous" | "skipped";

/**
 * Claim the durable lock or return the plan for an existing receipt.
 * Does not run command handlers — Kick webhooks must ACK quickly and finish
 * execute via waitUntil (Kick cancels ~3–4s; pre-claim work already burns most of that).
 */
export async function claimKickCommandOrPlan(input: {
  board: ReceiptBoard;
  userId: string;
  providerEventId: string;
  broadcasterUserId: string;
  now: number;
}): Promise<ReceiptPlan & { claimed: boolean }> {
  const claimed = await input.board.claim({
    userId: input.userId,
    providerEventId: input.providerEventId,
    broadcasterUserId: input.broadcasterUserId,
    now: input.now,
  });
  if (claimed) return { action: "execute", claimed: true };
  const current = await input.board.read(input.userId, input.providerEventId);
  if (!current) return { action: "busy", claimed: false };
  return { ...planKickReceipt(current, input.now), claimed: false };
}

/**
 * Run handlers after a successful claim. Marks command_execution_completed only
 * after execute returns. A throw leaves webhook_received (busy window, then
 * execution_unknown) so points/shop/giveaway stay at-most-once.
 */
export async function runClaimedKickExecute(input: {
  board: ReceiptBoard;
  userId: string;
  providerEventId: string;
  now: number;
  execute: () => Promise<void>;
}): Promise<"completed" | "busy"> {
  await input.execute();
  const after = await input.board.read(input.userId, input.providerEventId);
  if (after?.state === "webhook_received") {
    const finished = await input.board.compareAndSet(
      input.userId,
      input.providerEventId,
      "webhook_received",
      { state: "command_execution_completed", now: input.now },
    );
    if (!finished) return "busy";
  }
  return "completed";
}

export async function retryKickReplyDelivery(input: {
  board: ReceiptBoard;
  userId: string;
  providerEventId: string;
  now: number;
  replyText: string;
  deliverStored: (replyText: string) => Promise<DeliveryOutcome>;
}): Promise<{ delivered: boolean }> {
  const pending = await input.board.compareAndSet(
    input.userId,
    input.providerEventId,
    "reply_delivery_failed",
    { state: "reply_delivery_pending", now: input.now },
  );
  if (!pending) return { delivered: false };
  const outcome = await input.deliverStored(input.replyText);
  const next =
    outcome === "sent"
      ? "reply_delivery_succeeded"
      : outcome === "ambiguous"
        ? "reply_delivery_ambiguous"
        : "reply_delivery_failed";
  await input.board.compareAndSet(input.userId, input.providerEventId, "reply_delivery_pending", {
    state: next,
    now: input.now,
  });
  return { delivered: outcome === "sent" };
}

export async function runIdempotentKickCommand(input: {
  board: ReceiptBoard;
  userId: string;
  providerEventId: string;
  broadcasterUserId: string;
  now: number;
  execute: () => Promise<void>;
  deliverStored: (replyText: string) => Promise<DeliveryOutcome>;
}): Promise<ReceiptPlan & { ran: boolean; delivered: boolean }> {
  const plan = await claimKickCommandOrPlan(input);
  if (plan.action === "execute" && plan.claimed) {
    // The insert is the lock. Points, shop, giveaway, and mark writes are separate
    // PostgREST calls, so this is at-most-once rather than one database transaction.
    // Completion is recorded only after execute returns. A throw leaves
    // webhook_received: a retry inside the busy window does not execute, and a
    // later retry acks execution_unknown instead of repeating the write.
    const finished = await runClaimedKickExecute({
      board: input.board,
      userId: input.userId,
      providerEventId: input.providerEventId,
      now: input.now,
      execute: input.execute,
    });
    if (finished === "busy") return { action: "busy", ran: true, delivered: false };
    return { action: "execute", ran: true, delivered: false };
  }
  if (plan.action !== "retry_delivery") return { ...plan, ran: false, delivered: false };
  const { delivered } = await retryKickReplyDelivery({
    board: input.board,
    userId: input.userId,
    providerEventId: input.providerEventId,
    now: input.now,
    replyText: plan.replyText,
    deliverStored: input.deliverStored,
  });
  return { action: "retry_delivery", replyText: plan.replyText, ran: false, delivered };
}

export type ReceiptSession = { board: ReceiptBoard; userId: string; providerEventId: string };
const receiptSessions = new AsyncLocalStorage<ReceiptSession>();

export function withKickReceipt<T>(session: ReceiptSession, run: () => Promise<T>): Promise<T> {
  return receiptSessions.run(session, run);
}

export function activeKickReceipt(): ReceiptSession | null {
  return receiptSessions.getStore() ?? null;
}
