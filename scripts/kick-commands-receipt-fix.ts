import assert from "node:assert/strict";

import {
  claimKickCommandOrPlan,
  createMemoryReceiptBoard,
  finalizeKickReceiptAfterCommand,
  markReplyPending,
  markReplyResult,
  runClaimedKickExecute,
  runIdempotentKickCommand,
  withKickReceipt,
  type ReceiptSession,
} from "@/lib/kickCommandReceipt";
import { sendKickChatMessage } from "@/lib/kickChat.server";
import { matchDefaultCommand, mergeRuntimeDefaultCommands } from "@/lib/defaultCommands";

const now = 2_000_000;

function mockFetch(status: number, body = '{"data":{"message_id":"bot-msg-1"}}', throwTimeout = false) {
  return async () => {
    if (throwTimeout) {
      const err = new Error("aborted");
      err.name = "TimeoutError";
      throw err;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => (status === 429 ? "1" : null) },
      text: async () => body,
    };
  };
}

async function runCommandsPath(opts: {
  eventId: string;
  status?: number;
  timeout?: boolean;
  dropSession?: boolean;
  emptyReply?: boolean;
  concurrent?: boolean;
}) {
  const board = createMemoryReceiptBoard();
  const session: ReceiptSession = { board, userId: "user-a", providerEventId: opts.eventId };
  let handlerStatus = "ignored";
  const execute = () =>
    withKickReceipt(session, async () => {
      const reply = opts.emptyReply ? "   " : "https://cylixstudio.com/commands/creovixstudio :قائمة الأوامر";
      const sent = await sendKickChatMessage("user-a", "64185437", reply, null, {
        receiptSession: opts.dropSession ? null : session,
        loadToken: async () => "channel-token",
        fetchImpl: mockFetch(opts.status ?? 200, undefined, opts.timeout),
      });
      handlerStatus = sent ? "replied" : opts.emptyReply ? "ignored" : "error";
      if (opts.emptyReply) handlerStatus = "ignored";
      if (!sent && !opts.emptyReply) handlerStatus = "error";
    });

  if (opts.concurrent) {
    const [a, b] = await Promise.all([
      runIdempotentKickCommand({
        board,
        userId: "user-a",
        providerEventId: opts.eventId,
        broadcasterUserId: "64185437",
        now,
        execute,
        deliverStored: async () => "sent",
      }),
      runIdempotentKickCommand({
        board,
        userId: "user-a",
        providerEventId: opts.eventId,
        broadcasterUserId: "64185437",
        now,
        execute,
        deliverStored: async () => "sent",
      }),
    ]);
    assert.equal(a.ran !== b.ran, true);
  } else {
    await runIdempotentKickCommand({
      board,
      userId: "user-a",
      providerEventId: opts.eventId,
      broadcasterUserId: "64185437",
      now,
      execute,
      deliverStored: async () => "sent",
    });
  }

  await finalizeKickReceiptAfterCommand({
    board,
    userId: "user-a",
    providerEventId: opts.eventId,
    now: now + 1,
    commandStatus: handlerStatus,
    commandReason: handlerStatus === "ignored" ? "cooldown" : handlerStatus === "error" ? "send_failed" : null,
  });
  return board.read("user-a", opts.eventId);
}

// Catalog !commands is enabled by default for KICK.
const catalog = mergeRuntimeDefaultCommands([], "en");
const matched = matchDefaultCommand("!commands", catalog, "KICK");
assert.ok(matched);
assert.equal(matched!.command.id, "commands");
assert.equal(matched!.command.enabled, true);
assert.equal(matchDefaultCommand("!الأوامر", catalog, "KICK")?.command.id, "commands");

// Success path: pending → succeeded with reply text.
{
  const row = await runCommandsPath({ eventId: "evt-ok" });
  assert.equal(row?.state, "reply_delivery_succeeded");
  assert.ok(row?.replyText && row.replyText.includes("cylixstudio.com/commands/"));
  assert.equal(row?.kickMessageId, "bot-msg-1");
  assert.equal(row?.failureReason, null);
}

// Empty reply must not send / must finalize silently when handler ignores.
{
  const board = createMemoryReceiptBoard();
  const session: ReceiptSession = { board, userId: "user-a", providerEventId: "evt-empty" };
  await runIdempotentKickCommand({
    board,
    userId: "user-a",
    providerEventId: "evt-empty",
    broadcasterUserId: "64185437",
    now,
    execute: () =>
      withKickReceipt(session, async () => {
        const sent = await sendKickChatMessage("user-a", "64185437", "  ", null, {
          receiptSession: session,
          loadToken: async () => "channel-token",
          fetchImpl: mockFetch(200),
        });
        assert.equal(sent, false);
      }),
    deliverStored: async () => "sent",
  });
  await finalizeKickReceiptAfterCommand({
    board,
    userId: "user-a",
    providerEventId: "evt-empty",
    now: now + 1,
    commandStatus: "ignored",
    commandReason: "cooldown",
  });
  const row = await board.read("user-a", "evt-empty");
  assert.equal(row?.state, "command_execution_completed");
  assert.equal(row?.failureReason, "silent:cooldown");
  assert.equal(row?.replyText, null);
}

// HTTP failures
for (const status of [401, 403, 429, 500]) {
  const row = await runCommandsPath({ eventId: `evt-${status}`, status });
  assert.equal(row?.state, "reply_delivery_failed", `status ${status}`);
  assert.ok(row?.replyText);
  assert.ok(row?.failureReason);
}

// Timeout → ambiguous
{
  const row = await runCommandsPath({ eventId: "evt-timeout", timeout: true });
  assert.equal(row?.state, "reply_delivery_ambiguous");
}

// Missing session: send may run but finalize marks untracked when handler says replied without arming.
{
  const board = createMemoryReceiptBoard();
  let apiCalls = 0;
  await runIdempotentKickCommand({
    board,
    userId: "user-a",
    providerEventId: "evt-nosession",
    broadcasterUserId: "64185437",
    now,
    execute: async () => {
      const sent = await sendKickChatMessage("user-a", "64185437", "list", null, {
        receiptSession: null,
        loadToken: async () => "channel-token",
        fetchImpl: async () => {
          apiCalls += 1;
          return mockFetch(200)();
        },
      });
      assert.equal(sent, true);
      assert.equal(apiCalls, 1);
    },
    deliverStored: async () => "sent",
  });
  const before = await board.read("user-a", "evt-nosession");
  assert.equal(before?.state, "command_execution_completed");
  assert.equal(before?.replyText, null);
  await finalizeKickReceiptAfterCommand({
    board,
    userId: "user-a",
    providerEventId: "evt-nosession",
    now: now + 1,
    commandStatus: "replied",
  });
  const after = await board.read("user-a", "evt-nosession");
  assert.equal(after?.state, "reply_delivery_ambiguous");
  assert.equal(after?.failureReason, "reply_untracked_after_handler");
}

// Duplicate provider event: second does not re-execute
{
  const board = createMemoryReceiptBoard();
  const session: ReceiptSession = { board, userId: "user-a", providerEventId: "evt-dup" };
  let runs = 0;
  const exec = () =>
    withKickReceipt(session, async () => {
      runs += 1;
      await sendKickChatMessage("user-a", "64185437", "ok", null, {
        receiptSession: session,
        loadToken: async () => "t",
        fetchImpl: mockFetch(200),
      });
    });
  await runIdempotentKickCommand({
    board, userId: "user-a", providerEventId: "evt-dup", broadcasterUserId: "64185437", now, execute: exec, deliverStored: async () => "sent",
  });
  await runIdempotentKickCommand({
    board, userId: "user-a", providerEventId: "evt-dup", broadcasterUserId: "64185437", now, execute: exec, deliverStored: async () => "sent",
  });
  assert.equal(runs, 1);
  assert.equal((await board.read("user-a", "evt-dup"))?.state, "reply_delivery_succeeded");
}

// Two distinct event ids (one owner message, two Kick event ids)
{
  const board = createMemoryReceiptBoard();
  for (const eventId of ["evt-a", "evt-b"]) {
    const session: ReceiptSession = { board, userId: "user-a", providerEventId: eventId };
    await runIdempotentKickCommand({
      board,
      userId: "user-a",
      providerEventId: eventId,
      broadcasterUserId: "64185437",
      now,
      execute: () =>
        withKickReceipt(session, async () => {
          await sendKickChatMessage("user-a", "64185437", "ok", null, {
            receiptSession: session,
            loadToken: async () => "t",
            fetchImpl: mockFetch(200, `{"data":{"message_id":"${eventId}-bot"}}`),
          });
        }),
      deliverStored: async () => "sent",
    });
  }
  assert.equal((await board.read("user-a", "evt-a"))?.state, "reply_delivery_succeeded");
  assert.equal((await board.read("user-a", "evt-b"))?.state, "reply_delivery_succeeded");
}

// Concurrent same event id
{
  const row = await runCommandsPath({ eventId: "evt-race", concurrent: true });
  assert.equal(row?.state, "reply_delivery_succeeded");
}

// Disabled default !commands → reserved silent (no fake reply)
{
  const commands = mergeRuntimeDefaultCommands([{ id: "commands", enabled: false }], "en");
  const hit = matchDefaultCommand("!commands", commands, "KICK");
  assert.ok(hit);
  assert.equal(hit!.command.enabled, false);
}



// Claim-then-finish (webhook waitUntil path): claim returns before execute; finish after.
{
  const board = createMemoryReceiptBoard();
  const eventId = "evt-defer-claim";
  const session: ReceiptSession = { board, userId: "user-a", providerEventId: eventId };
  const claimed = await claimKickCommandOrPlan({
    board,
    userId: "user-a",
    providerEventId: eventId,
    broadcasterUserId: "64185437",
    now,
  });
  assert.equal(claimed.action, "execute");
  assert.equal(claimed.claimed, true);
  assert.equal((await board.read("user-a", eventId))?.state, "webhook_received");
  let ran = false;
  await runClaimedKickExecute({
    board,
    userId: "user-a",
    providerEventId: eventId,
    now: now + 1,
    execute: () =>
      withKickReceipt(session, async () => {
        ran = true;
        const sent = await sendKickChatMessage("user-a", "64185437", "commands list", null, {
          receiptSession: session,
          loadToken: async () => "channel-token",
          fetchImpl: mockFetch(200),
        });
        assert.equal(sent, true);
      }),
  });
  assert.equal(ran, true);
  const row = await board.read("user-a", eventId);
  assert.equal(row?.state, "reply_delivery_succeeded");
  assert.ok(row?.replyText);
}

console.log("kick-commands-receipt-fix: ok");
