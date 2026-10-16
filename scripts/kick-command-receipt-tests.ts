import assert from "node:assert/strict";

import {
  createMemoryReceiptBoard,
  decideAppBotIdentity,
  planKickReceipt,
  runIdempotentKickCommand,
  scopesFromIntrospection,
  storedChatWrite,
  type DeliveryOutcome,
  type ReceiptBoard,
} from "@/lib/kickCommandReceipt";
import { classifyKickSendFailure, sendOfficialKickBot } from "@/lib/kickChatDeliver";
import { kickEventAlreadyHandled, resetKickEventMemory } from "@/lib/kickWebhookParse";

const now = 1_000_000;

async function run(
  board: ReceiptBoard,
  eventId: string,
  userId: string,
  execute: () => Promise<void>,
  deliver: () => Promise<DeliveryOutcome>,
) {
  return runIdempotentKickCommand({
    board,
    userId,
    providerEventId: eventId,
    broadcasterUserId: userId === "channel-b" ? "77" : "42",
    now,
    execute,
    deliverStored: async () => deliver(),
  });
}

const board = createMemoryReceiptBoard();
let effects = 0;
let sends = 0;
const first = await run(board, "evt-1", "channel-a", async () => {
  effects += 1;
}, async () => "rejected");
assert.equal(first.ran, true);
assert.equal(effects, 1);
const completed = await board.read("channel-a", "evt-1");
assert.equal(completed?.state, "command_execution_completed");
await board.compareAndSet("channel-a", "evt-1", "command_execution_completed", {
  state: "reply_delivery_failed",
  replyText: "10 points",
  failureReason: "bot_500",
  now,
});

resetKickEventMemory();
assert.equal(kickEventAlreadyHandled("evt-1"), false);
const isolateB = board;
const second = await run(isolateB, "evt-1", "channel-a", async () => {
  effects += 1;
}, async () => {
  sends += 1;
  return "sent";
});
assert.equal(second.ran, false);
assert.equal(second.delivered, true);
assert.equal(effects, 1);
assert.equal(sends, 1);
assert.equal((await board.read("channel-a", "evt-1"))?.state, "reply_delivery_succeeded");

const third = await run(createMemoryReceiptBoard(), "evt-1", "channel-a", async () => {
  effects += 1;
}, async () => "sent");
assert.equal(third.ran, true);
assert.equal(effects, 2);

const shared = createMemoryReceiptBoard();
let concurrentEffects = 0;
const [left, right] = await Promise.all([
  run(shared, "evt-c", "channel-a", async () => {
    concurrentEffects += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }, async () => "sent"),
  run(shared, "evt-c", "channel-a", async () => {
    concurrentEffects += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }, async () => "sent"),
]);
assert.equal(concurrentEffects, 1);
assert.equal(left.ran !== right.ran, true);

const ambiguousBoard = createMemoryReceiptBoard();
await run(ambiguousBoard, "evt-t", "channel-a", async () => {
  effects += 1;
}, async () => "sent");
await ambiguousBoard.compareAndSet("channel-a", "evt-t", "command_execution_completed", {
  state: "reply_delivery_ambiguous",
  replyText: "10 points",
  now,
});
let ambiguousSends = 0;
const afterTimeout = await run(ambiguousBoard, "evt-t", "channel-a", async () => {
  effects += 1;
}, async () => {
  ambiguousSends += 1;
  return "sent";
});
assert.equal(afterTimeout.action, "ack");
assert.equal(ambiguousSends, 0);

const viewer = decideAppBotIdentity({
  senderUserId: "7",
  configuredBotUserId: null,
  learnedBotUserId: null,
  incomingChatMessageId: "chat-1",
  outboundChatMessageId: null,
});
assert.equal(viewer.ignore, false);
const namedUser = decideAppBotIdentity({
  senderUserId: "9",
  configuredBotUserId: null,
  learnedBotUserId: null,
  incomingChatMessageId: "chat-user",
  outboundChatMessageId: null,
});
assert.equal(namedUser.ignore, false);
const echo = decideAppBotIdentity({
  senderUserId: "4242",
  configuredBotUserId: null,
  learnedBotUserId: null,
  incomingChatMessageId: "chat-bot",
  outboundChatMessageId: "chat-bot",
});
assert.equal(echo.ignore, true);
assert.equal(echo.learnSenderId, "4242");
const learned = decideAppBotIdentity({
  senderUserId: "4242",
  configuredBotUserId: null,
  learnedBotUserId: "4242",
  incomingChatMessageId: "chat-2",
  outboundChatMessageId: null,
});
assert.equal(learned.ignore, true);

assert.equal(storedChatWrite([]), "unrecorded");
assert.equal(storedChatWrite(null), "unrecorded");
assert.equal(storedChatWrite(["user:read"]), "absent");
assert.equal(storedChatWrite(["chat:write"]), "granted");
assert.equal(scopesFromIntrospection("user:read chat:write")?.includes("chat:write"), true);
assert.equal(scopesFromIntrospection(""), null);

const channelA = createMemoryReceiptBoard();
const channelB = createMemoryReceiptBoard();
let a = 0;
let b = 0;
await run(channelA, "evt-a", "channel-a", async () => {
  a += 1;
}, async () => "sent");
await run(channelB, "evt-a", "channel-b", async () => {
  b += 1;
}, async () => "sent");
assert.equal(a, 1);
assert.equal(b, 1);
assert.equal((await channelA.read("channel-b", "evt-a")), null);

assert.equal(classifyKickSendFailure(403, "Channel not found"), "bot_not_activated");
assert.equal(classifyKickSendFailure(403, "Forbidden"), "bot_forbidden");

let activationCalls = 0;
const activation = await sendOfficialKickBot({
  userId: "channel-a",
  broadcasterUserId: "42",
  content: "hi",
  loadToken: async () => "channel-token",
  fetchImpl: async (_url, init) => {
    activationCalls += 1;
    const body = JSON.parse(init.body) as { type?: string; broadcaster_user_id?: number };
    assert.equal(body.type, "bot");
    assert.equal(body.broadcaster_user_id, undefined);
    return { ok: false, status: 403, text: async () => JSON.stringify({ message: "Channel not found" }) };
  },
});
assert.equal(activation.reason, "bot_not_activated");
assert.equal(activation.outcome, "rejected");
assert.equal(activationCalls, 1);

let refreshCalls = 0;
const refreshFailed = await sendOfficialKickBot({
  userId: "channel-a",
  broadcasterUserId: "42",
  content: "hi",
  loadToken: async (_id, force) => {
    refreshCalls += 1;
    return force ? null : "expired";
  },
  fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: "invalid_token" }) }),
});
assert.equal(refreshFailed.ok, false);
assert.equal(refreshCalls, 2);

const missingWrite = await sendOfficialKickBot({
  userId: "channel-a",
  broadcasterUserId: "42",
  content: "hi",
  loadToken: async () => null,
  fetchImpl: async () => {
    throw new Error("must not send");
  },
});
assert.equal(missingWrite.reason, "no_access_token");
assert.equal(missingWrite.outcome, "skipped");

let timeoutCalls = 0;
const timeout = await sendOfficialKickBot({
  userId: "channel-a",
  broadcasterUserId: "42",
  content: "hi",
  loadToken: async () => "channel-token",
  fetchImpl: async () => {
    timeoutCalls += 1;
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  },
});
assert.equal(timeout.outcome, "ambiguous");
assert.equal(timeoutCalls, 1);

const stale = planKickReceipt(
  {
    userId: "channel-a",
    providerEventId: "evt-1",
    broadcasterUserId: "42",
    state: "webhook_received",
    replyText: null,
    kickMessageId: null,
    failureReason: null,
    updatedAt: now - 60_000,
  },
  now,
);
assert.equal(stale.action, "ack");

const crashBoard = createMemoryReceiptBoard();
let crashEffects = 0;
await assert.rejects(() =>
  run(crashBoard, "evt-crash", "channel-a", async () => {
    crashEffects += 1;
    throw new Error("points_write_failed");
  }, async () => "sent"),
);
const crashRetry = await run(crashBoard, "evt-crash", "channel-a", async () => {
  crashEffects += 1;
}, async () => "sent");
assert.equal(crashRetry.action, "busy");
assert.equal(crashRetry.ran, false);
assert.equal(crashEffects, 1);
assert.equal((await crashBoard.read("channel-a", "evt-crash"))?.state, "webhook_received");

let thrownSends = 0;
const thrown = await sendOfficialKickBot({
  userId: "channel-a",
  broadcasterUserId: "42",
  content: "hi",
  loadToken: async () => "channel-token",
  fetchImpl: async () => {
    thrownSends += 1;
    throw new Error("socket hang up");
  },
});
assert.equal(thrown.outcome, "ambiguous");
assert.equal(thrownSends, 1);

console.log(JSON.stringify({ ok: true, effects, sends, concurrentEffects, ambiguousSends, crashEffects, thrownSends }));
