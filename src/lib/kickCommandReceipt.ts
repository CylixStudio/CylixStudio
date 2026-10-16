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
  if (current.state !== "command_execution_completed" && current.state !== "reply_delivery_failed") return false;
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

export async function runIdempotentKickCommand(input: {
  board: ReceiptBoard;
  userId: string;
  providerEventId: string;
  broadcasterUserId: string;
  now: number;
  execute: () => Promise<void>;
  deliverStored: (replyText: string) => Promise<DeliveryOutcome>;
}): Promise<ReceiptPlan & { ran: boolean; delivered: boolean }> {
  const claimed = await input.board.claim({
    userId: input.userId,
    providerEventId: input.providerEventId,
    broadcasterUserId: input.broadcasterUserId,
    now: input.now,
  });
  if (claimed) {
    const started = await input.board.compareAndSet(
      input.userId,
      input.providerEventId,
      "webhook_received",
      { state: "command_execution_completed", now: input.now },
    );
    if (!started) return { action: "busy", ran: false, delivered: false };
    await input.execute();
    return { action: "execute", ran: true, delivered: false };
  }
  const current = await input.board.read(input.userId, input.providerEventId);
  if (!current) return { action: "busy", ran: false, delivered: false };
  const plan = planKickReceipt(current, input.now);
  if (plan.action !== "retry_delivery") return { ...plan, ran: false, delivered: false };
  const pending = await input.board.compareAndSet(
    input.userId,
    input.providerEventId,
    "reply_delivery_failed",
    { state: "reply_delivery_pending", now: input.now },
  );
  if (!pending) return { action: "busy", ran: false, delivered: false };
  const outcome = await input.deliverStored(plan.replyText);
  const next = outcome === "sent"
    ? "reply_delivery_succeeded"
    : outcome === "ambiguous"
      ? "reply_delivery_ambiguous"
      : "reply_delivery_failed";
  await input.board.compareAndSet(input.userId, input.providerEventId, "reply_delivery_pending", {
    state: next,
    now: input.now,
  });
  return { action: "retry_delivery", replyText: plan.replyText, ran: false, delivered: outcome === "sent" };
}

type ReceiptSession = { board: ReceiptBoard; userId: string; providerEventId: string };
const receiptSessions = new AsyncLocalStorage<ReceiptSession>();

export function withKickReceipt<T>(session: ReceiptSession, run: () => Promise<T>): Promise<T> {
  return receiptSessions.run(session, run);
}

export function activeKickReceipt(): ReceiptSession | null {
  return receiptSessions.getStore() ?? null;
}
