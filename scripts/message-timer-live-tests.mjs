// node --import ./scripts/command-match-loader.mjs ./scripts/message-timer-live-tests.mjs
import assert from "node:assert/strict";
import fs from "node:fs";

import { deliverKickChat } from "../src/lib/kickChatDeliver.ts";
import {
  claimMessageTimerSlot,
  claimUpdateMatches,
  classifyKickLivestream,
  createMemorySlotStore,
  planCronRotation,
  runMessageTimerPass,
  slotMovesBackward,
} from "../src/lib/messageTimerSchedule.ts";

const MIN = 60_000;
const start = Date.parse("2026-10-14T12:00:00.000Z");

function timer(overrides = {}) {
  return {
    id: "timer-1",
    message: "hello chat",
    intervalMinutes: 15,
    enabled: true,
    platforms: ["KICK"],
    updatedAtMs: start,
    ...overrides,
  };
}

function live(channelId, startedAtMs, streamSessionId = `9@${new Date(startedAtMs).toISOString()}`) {
  return { phase: "LIVE", channelId, streamSessionId, startedAtMs };
}

function capture(ok = true) {
  const calls = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
      return ok;
    },
  };
}

async function tick({ timers, nowMs, liveFor, slots, send }) {
  return runMessageTimerPass({ timers, nowMs, liveFor, slots, send });
}

const results = [];

async function check(name, fn) {
  await fn();
  results.push(name);
}

await check("offline for an hour sends nothing", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  for (let minute = 0; minute <= 60; minute += 1) {
    const records = await tick({
      timers: [timer()],
      nowMs: start + minute * MIN,
      liveFor: () => ({ phase: "OFFLINE", channelId: "100" }),
      slots,
      send: sink.send,
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].live, "OFFLINE");
    assert.equal(records[0].result, "skipped");
    assert.equal(records[0].skipReason, "offline");
    assert.equal(records[0].dedupe, "not_attempted");
    assert.equal(records[0].channelId, "100");
  }
  assert.equal(sink.calls.length, 0);
});

await check("live 15-minute timer sends only on the slot", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const sentAt = [];
  for (const minute of [0, 14, 15, 16, 29, 30, 44, 45]) {
    const records = await tick({
      timers: [timer()],
      nowMs: start + minute * MIN,
      liveFor: () => live("100", start),
      slots,
      send: sink.send,
    });
    if (records[0].result === "sent") sentAt.push(minute);
    assert.equal(records[0].live, "LIVE");
    assert.equal(records[0].streamSessionId, `9@${new Date(start).toISOString()}`);
  }
  assert.deepEqual(sentAt, [15, 30, 45]);
  assert.equal(sink.calls.length, 3);
  assert.ok(sink.calls.every((call) => call.channelId === "100" && call.timerId === "timer-1"));
  const disabled = await tick({
    timers: [timer({ id: "timer-off", enabled: false })],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  assert.equal(disabled[0].skipReason, "disabled");
  assert.equal(sink.calls.length, 3);
  const twitchOnly = await tick({
    timers: [timer({ id: "timer-twitch", platforms: ["TWITCH"] })],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  assert.equal(twitchOnly[0].skipReason, "platform");
  assert.equal(sink.calls.length, 3);
});

await check("stream ending before the slot sends nothing", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  await tick({
    timers: [timer()],
    nowMs: start + 10 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  const ended = await tick({
    timers: [timer()],
    nowMs: start + 16 * MIN,
    liveFor: () => ({ phase: "OFFLINE", channelId: "100" }),
    slots,
    send: sink.send,
  });
  assert.equal(sink.calls.length, 0);
  assert.equal(ended[0].skipReason, "offline");
  assert.equal(ended[0].result, "skipped");
});

await check("new stream resets the counter", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const firstStart = start;
  const nextStart = start + 3 * 60 * MIN;
  await tick({
    timers: [timer()],
    nowMs: firstStart + 15 * MIN,
    liveFor: () => live("100", firstStart, "9@first"),
    slots,
    send: sink.send,
  });
  const early = await tick({
    timers: [timer({ updatedAtMs: firstStart })],
    nowMs: nextStart,
    liveFor: () => live("100", nextStart, "10@second"),
    slots,
    send: sink.send,
  });
  const onSlot = await tick({
    timers: [timer({ updatedAtMs: firstStart })],
    nowMs: nextStart + 15 * MIN,
    liveFor: () => live("100", nextStart, "10@second"),
    slots,
    send: sink.send,
  });
  assert.equal(early[0].skipReason, "before_first_slot");
  assert.equal(onSlot[0].result, "sent");
  assert.equal(onSlot[0].streamSessionId, "10@second");
  assert.equal(sink.calls.length, 2);
});

await check("enabling mid-stream does not backfill", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const enabledAt = start + 40 * MIN;
  const atEnable = await tick({
    timers: [timer({ updatedAtMs: enabledAt })],
    nowMs: enabledAt,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  const next = await tick({
    timers: [timer({ updatedAtMs: enabledAt })],
    nowMs: start + 45 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  assert.equal(atEnable[0].result, "skipped");
  assert.equal(atEnable[0].skipReason, "not_yet_forward");
  assert.equal(next[0].result, "sent");
  assert.equal(next[0].intervalIndex, 3);
  assert.equal(sink.calls.length, 1);
});

await check("duplicate scheduler pass sends once", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const input = {
    timers: [timer()],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  };
  const first = await tick(input);
  const second = await tick(input);
  assert.equal(first[0].result, "sent");
  assert.equal(first[0].dedupe, "claimed");
  assert.equal(second[0].result, "skipped");
  assert.equal(second[0].skipReason, "already_claimed");
  assert.equal(sink.calls.length, 1);
});

await check("two concurrent runs send once and a missing column does not send", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const input = {
    timers: [timer()],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  };
  const [left, right] = await Promise.all([tick(input), tick(input)]);
  const sent = [...left, ...right].filter((record) => record.result === "sent");
  assert.equal(sent.length, 1);
  assert.equal(sink.calls.length, 1);
  assert.equal(sent[0].dedupe, "claimed");

  let slot = null;
  let chain = Promise.resolve();
  const returnedRows = [];
  const write = (claim) => {
    const run = chain.then(() => {
      if (slot !== claim.expectedSlot) {
        returnedRows.push(0);
        return { data: [], error: null };
      }
      slot = claim.claimKey;
      returnedRows.push(1);
      return { data: [{ id: claim.timerId }], error: null };
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const claimKey = "100|timer-1|9@2026-10-14T12:00:00.000Z|15|1";
  const claimInput = {
    timerId: "timer-1",
    userId: "user-1",
    expectedSlot: null,
    claimKey,
    dueAtIso: new Date(start + 15 * MIN).toISOString(),
  };
  const [firstClaim, secondClaim] = await Promise.all([
    claimMessageTimerSlot(write, claimInput),
    claimMessageTimerSlot(write, claimInput),
  ]);
  assert.equal([firstClaim, secondClaim].filter((result) => result.ok).length, 1);
  assert.equal(returnedRows.filter((count) => count === 1).length, 1);

  const racing = {
    get() {
      return null;
    },
    claim(timerId, key, dueAtMs) {
      return claimMessageTimerSlot(write, {
        timerId,
        userId: "user-1",
        expectedSlot: slot,
        claimKey: key,
        dueAtIso: new Date(dueAtMs).toISOString(),
      });
    },
  };
  const racingSink = capture();
  slot = null;
  const [raceLeft, raceRight] = await Promise.all([
    tick({
      timers: [timer()],
      nowMs: start + 15 * MIN,
      liveFor: () => live("100", start),
      slots: racing,
      send: racingSink.send,
    }),
    tick({
      timers: [timer()],
      nowMs: start + 15 * MIN,
      liveFor: () => live("100", start),
      slots: racing,
      send: racingSink.send,
    }),
  ]);
  assert.equal([...raceLeft, ...raceRight].filter((record) => record.result === "sent").length, 1);
  assert.equal(racingSink.calls.length, 1);

  let writes = 0;
  const backward = await claimMessageTimerSlot(
    async () => {
      writes += 1;
      return { data: [{ id: "timer-1" }], error: null };
    },
    {
      ...claimInput,
      expectedSlot: "100|timer-1|9@2026-10-14T12:00:00.000Z|15|3",
      claimKey: "100|timer-1|9@2026-10-14T12:00:00.000Z|15|1",
    },
  );
  assert.equal(backward.reason, "slot_backward");
  assert.equal(writes, 0);

  const missing = await claimMessageTimerSlot(
    async () => ({ data: null, error: { code: "PGRST204", message: "Could not find last_sent_slot" } }),
    claimInput,
  );
  assert.equal(missing.outcome, "blocked");
  assert.equal(missing.reason, "last_sent_slot_missing");
  const blockedSink = capture();
  const blocked = await tick({
    timers: [timer()],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots: {
      get() {
        return null;
      },
      claim(timerId, key, dueAtMs) {
        return claimMessageTimerSlot(
          async () => ({ data: null, error: { code: "42703", message: "column last_sent_slot does not exist" } }),
          {
            timerId,
            userId: "user-1",
            expectedSlot: null,
            claimKey: key,
            dueAtIso: new Date(dueAtMs).toISOString(),
          },
        );
      },
    },
    send: blockedSink.send,
  });
  assert.equal(blockedSink.calls.length, 0);
  assert.equal(blocked[0].dedupe, "blocked");
  assert.equal(blocked[0].skipReason, "last_sent_slot_missing");
});

await check("late cron does not burst missed slots", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const records = await tick({
    timers: [timer()],
    nowMs: start + 50 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  assert.equal(sink.calls.length, 1);
  assert.equal(records[0].intervalIndex, 3);
  assert.equal(records[0].dueAt, new Date(start + 45 * MIN).toISOString());
  assert.equal(records[0].result, "sent");
});

await check("unknown or failed live check sends nothing", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const facts = [
    { phase: "UNKNOWN", channelId: "100", reason: "live_check_failed" },
    classifyKickLivestream(503, { message: "nope" }, "100"),
    classifyKickLivestream(200, { data: [{ broadcaster_user_id: 999, started_at: new Date(start).toISOString() }] }, "100"),
    classifyKickLivestream(200, {}, "100"),
  ];
  for (const fact of facts) {
    const records = await tick({
      timers: [timer()],
      nowMs: start + 60 * MIN,
      liveFor: () => fact,
      slots,
      send: sink.send,
    });
    assert.equal(records[0].live, "UNKNOWN");
    assert.equal(records[0].result, "skipped");
    assert.notEqual(records[0].skipReason, "offline");
  }
  const offline = classifyKickLivestream(200, { data: [] }, "100");
  assert.equal(offline.phase, "OFFLINE");
  const matched = classifyKickLivestream(
    200,
    { data: [{ broadcaster_user_id: 100, id: 9, started_at: "2026-10-14T12:00:00.000Z", viewer_count: 0 }] },
    "100",
  );
  assert.equal(matched.phase, "LIVE");
  assert.equal(matched.channelId, "100");
  assert.equal(matched.streamSessionId, "9@2026-10-14T12:00:00.000Z");
  const ended = classifyKickLivestream(
    200,
    { data: [{ broadcaster_user_id: 100, is_live: false, started_at: "2026-10-14T12:00:00.000Z" }] },
    "100",
  );
  assert.equal(ended.phase, "OFFLINE");
  assert.equal(sink.calls.length, 0);
});

await check("settings change mid-stream does not resend the current slot", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  await tick({
    timers: [timer()],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  const changedInterval = await tick({
    timers: [timer({ intervalMinutes: 30, updatedAtMs: start + 20 * MIN })],
    nowMs: start + 20 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  const nextInterval = await tick({
    timers: [timer({ intervalMinutes: 30, updatedAtMs: start + 20 * MIN, message: "next line" })],
    nowMs: start + 30 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  assert.equal(changedInterval[0].result, "skipped");
  assert.equal(nextInterval[0].result, "sent");
  assert.equal(sink.calls.at(-1).message, "next line");

  const messageSlots = createMemorySlotStore();
  const messageSink = capture();
  await tick({
    timers: [timer({ id: "timer-2" })],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots: messageSlots,
    send: messageSink.send,
  });
  const edited = await tick({
    timers: [timer({ id: "timer-2", message: "edited", updatedAtMs: start + 16 * MIN })],
    nowMs: start + 16 * MIN,
    liveFor: () => live("100", start),
    slots: messageSlots,
    send: messageSink.send,
  });
  const following = await tick({
    timers: [timer({ id: "timer-2", message: "edited", updatedAtMs: start + 16 * MIN })],
    nowMs: start + 30 * MIN,
    liveFor: () => live("100", start),
    slots: messageSlots,
    send: messageSink.send,
  });
  assert.equal(edited[0].result, "skipped");
  assert.equal(following[0].result, "sent");
  assert.equal(messageSink.calls.length, 2);
  assert.equal(messageSink.calls[1].message, "edited");
});

await check("two live channels stay independent", async () => {
  const slots = createMemorySlotStore();
  const sink = capture();
  const records = await tick({
    timers: [timer({ id: "timer-a" }), timer({ id: "timer-b", message: "other" })],
    nowMs: start + 15 * MIN,
    liveFor: (row) => (row.id === "timer-a" ? live("111", start, "a@1") : live("222", start, "b@1")),
    slots,
    send: sink.send,
  });
  assert.equal(sink.calls.length, 2);
  assert.deepEqual(
    sink.calls.map((call) => call.channelId).sort(),
    ["111", "222"],
  );
  assert.ok(records.every((record) => record.result === "sent"));
  const again = await tick({
    timers: [timer({ id: "timer-a" })],
    nowMs: start + 16 * MIN,
    liveFor: () => live("111", start, "a@1"),
    slots,
    send: sink.send,
  });
  assert.equal(again[0].skipReason, "already_claimed");
  assert.equal(sink.calls.length, 2);
});

await check("kick send failure does not retry the same slot", async () => {
  const slots = createMemorySlotStore();
  const sink = capture(false);
  const first = await tick({
    timers: [timer()],
    nowMs: start + 15 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  const second = await tick({
    timers: [timer()],
    nowMs: start + 16 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  const later = await tick({
    timers: [timer()],
    nowMs: start + 30 * MIN,
    liveFor: () => live("100", start),
    slots,
    send: sink.send,
  });
  assert.equal(first[0].result, "send_failed");
  assert.equal(first[0].dedupe, "claimed");
  assert.equal(second[0].result, "skipped");
  assert.equal(second[0].skipReason, "already_claimed");
  assert.equal(later[0].result, "send_failed");
  assert.equal(sink.calls.length, 2);
  assert.equal(slots.get("timer-1")?.endsWith("|2"), true);
});

await check("timer send stays on the user channel", async () => {
  const calls = [];
  const failed = await deliverKickChat({
    token: "fixture-token",
    broadcasterUserId: "100",
    content: "hello chat",
    userOnly: true,
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: false, status: 403, text: async () => "{\"message\":\"no\"}" };
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "bot");
  assert.equal(calls[0].broadcaster_user_id, undefined);

  const commandCalls = [];
  await deliverKickChat({
    token: "fixture-token",
    broadcasterUserId: "100",
    content: "hello chat",
    fetchImpl: async (_url, init) => {
      commandCalls.push(JSON.parse(init.body));
      return { ok: false, status: 403, text: async () => "{\"message\":\"no\"}" };
    },
  });
  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].type, "bot");
  assert.equal(commandCalls[0].broadcaster_user_id, undefined);
});

await check("rotation covers every channel inside the subrequest budget", async () => {
  const channels = Array.from({ length: 10 }, (_, index) => ({
    userId: `user-${String(index).padStart(2, "0")}`,
    timerIds: [`timer-${index}`],
  }));
  const seen = new Set();
  const first = planCronRotation(channels, 0);
  assert.ok(first.cycleMinutes > 1);
  for (let minute = 0; minute < first.cycleMinutes; minute += 1) {
    const plan = planCronRotation(channels, minute * 60_000);
    assert.ok(plan.estimatedSubrequests <= 45);
    assert.ok(plan.estimatedSubrequests <= 50);
    for (const piece of plan.run) seen.add(piece.userId);
  }
  assert.equal(seen.size, 10);
  const again = planCronRotation(channels, first.cycleMinutes * 60_000);
  assert.deepEqual(
    again.run.map((piece) => piece.userId),
    first.run.map((piece) => piece.userId),
  );
});

await check("locked update keeps the newer slot and a new session", async () => {
  const older = "100|timer-1|session-a|15|2";
  const newer = "100|timer-1|session-a|15|3";
  const row = { enabled: true, lastSentSlot: null };
  const apply = (expectedSlot, claimKey) => {
    if (!claimUpdateMatches(row, { expectedSlot, claimKey })) return 0;
    row.lastSentSlot = claimKey;
    return 1;
  };
  assert.equal(apply(null, newer), 1);
  assert.equal(apply(null, older), 0);
  assert.equal(row.lastSentSlot, newer);
  assert.equal(claimUpdateMatches(row, { expectedSlot: newer, claimKey: older }), false);
  assert.equal(slotMovesBackward(newer, older), true);

  const nextSession = "100|timer-1|session-b|15|1";
  assert.equal(slotMovesBackward(newer, nextSession), false);
  assert.equal(claimUpdateMatches(row, { expectedSlot: newer, claimKey: nextSession }), true);
  const nextStart = start + 4 * 60 * MIN;
  const slots = createMemorySlotStore({ "timer-1": newer });
  const sink = capture();
  const early = await tick({
    timers: [timer({ updatedAtMs: start })],
    nowMs: nextStart,
    liveFor: () => live("100", nextStart, "session-b"),
    slots,
    send: sink.send,
  });
  const onSlot = await tick({
    timers: [timer({ updatedAtMs: start })],
    nowMs: nextStart + 15 * MIN,
    liveFor: () => live("100", nextStart, "session-b"),
    slots,
    send: sink.send,
  });
  assert.equal(early[0].skipReason, "before_first_slot");
  assert.equal(onSlot[0].result, "sent");
  assert.equal(sink.calls.length, 1);
});

await check("rotation wait for 40, 100, and 500 channels", async () => {
  for (const count of [40, 100, 500]) {
    const channels = Array.from({ length: count }, (_, index) => ({
      userId: `user-${String(index).padStart(4, "0")}`,
      timerIds: [`timer-${index}`],
    }));
    const first = planCronRotation(channels, 0);
    const seen = new Set();
    for (let minute = 0; minute < first.cycleMinutes; minute += 1) {
      const plan = planCronRotation(channels, minute * 60_000);
      assert.ok(plan.estimatedSubrequests <= 45);
      assert.ok(plan.estimatedSubrequests <= 50);
      for (const piece of plan.run) seen.add(piece.userId);
    }
    assert.equal(seen.size, count);
    console.log(
      JSON.stringify({
        channels: count,
        cycleMinutes: first.cycleMinutes,
        worstWaitMinutes: first.cycleMinutes,
        firstMinuteSubrequests: first.estimatedSubrequests,
      }),
    );
  }
});

await check("workers entry does not poll timers itself", async () => {
  const serverEntry = fs.readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  const timers = fs.readFileSync(new URL("../src/lib/messageTimers.server.ts", import.meta.url), "utf8");
  const webhook = fs.readFileSync(new URL("../src/routes/api/public/webhooks/kick.ts", import.meta.url), "utf8");
  const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../src/routes/_authenticated/custom-commands.tsx", import.meta.url), "utf8");
  const functions = fs.readFileSync(new URL("../src/lib/messageTimers.functions.ts", import.meta.url), "utf8");
  assert.match(serverEntry, /runScheduledMessageTimers/);
  assert.doesNotMatch(serverEntry, /setInterval\s*\(/);
  assert.match(timers, /claimMessageTimerSlot/);
  assert.doesNotMatch(timers, /unapprovedSlotClaim/);
  assert.doesNotMatch(timers, /fireDueMessageTimers/);
  assert.doesNotMatch(timers, /setInterval\s*\(/);
  assert.equal(webhook.includes("messageTimer"), false);
  assert.equal(page.includes("tickMessageTimers"), false);
  assert.equal(page.includes("persistTimerTick"), false);
  assert.equal(functions.includes("fireDueMessageTimers"), false);
  assert.doesNotMatch(wrangler, /^\s*"triggers"/m);
  assert.doesNotMatch(wrangler, /^\s*"crons"/m);
});
console.log(`message timer cases passed: ${results.length}`);
for (const name of results) console.log(`  ok ${name}`);
