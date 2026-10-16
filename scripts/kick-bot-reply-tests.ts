import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { kickTokenAllowsChatWrite, redactKickError, sendOfficialKickBot } from "@/lib/kickChatDeliver";
import {
  chatTextNeedsHandlers,
  isCylixBotChatAuthor,
  kickEventAlreadyHandled,
  rememberKickEvent,
  resetKickEventMemory,
} from "@/lib/kickWebhookParse";
import {
  createKickReplyTrace,
  summarizeKickReplyMs,
  workerReplyMs,
  type KickReplySample,
} from "@/lib/kickReplyTiming";
import { singleFlight } from "@/lib/singleFlight";

type Sent = { channel: string; type: string; auth: string; body: Record<string, unknown> };

async function sendBot(
  userId: string,
  broadcasterUserId: string,
  content: string,
  replyToMessageId: string | null,
  options: {
    userOnly?: boolean;
    loadToken: (userId: string, forceRefresh: boolean) => Promise<string | null>;
    fetchImpl: Parameters<typeof sendOfficialKickBot>[0]["fetchImpl"];
  },
) {
  const result = await sendOfficialKickBot({
    userId,
    broadcasterUserId,
    content,
    replyToMessageId,
    userOnly: options.userOnly,
    loadToken: options.loadToken,
    fetchImpl: options.fetchImpl,
  });
  return result.ok;
}

function mockFetch(sent: Sent[], statusFor: (call: number, body: Record<string, unknown>) => number) {
  let call = 0;
  return async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    call += 1;
    const body = JSON.parse(init.body) as Record<string, unknown>;
    const auth = init.headers["Authorization"] ?? "";
    sent.push({ channel: String(body["content"]), type: String(body["type"]), auth, body });
    const status = statusFor(call, body);
    const headers = status === 429 ? { get: (name: string) => (name.toLowerCase() === "retry-after" ? "2" : null) } : undefined;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      text: async () => (status === 401 ? JSON.stringify({ error: "invalid_token", access_token: "should-not-leak" }) : ""),
    };
  };
}

const webhookSource = readFileSync(new URL("../src/routes/api/public/webhooks/kick.ts", import.meta.url), "utf8");
const deliverSource = readFileSync(new URL("../src/lib/kickChatDeliver.ts", import.meta.url), "utf8");
assert.equal(webhookSource.includes("from \"@/lib/pointsCommand.server\""), false);
assert.equal(webhookSource.includes("from \"@/lib/defaultCommands.server\""), false);
assert.equal(webhookSource.includes("from \"@/lib/giveaway.server\""), false);
assert.equal(deliverSource.includes("setTimeout"), false);
const deliverCode = deliverSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
assert.equal(deliverCode.includes("type: \"user\""), false);
assert.equal(webhookSource.includes("KICK_BOT_ACCESS_TOKEN"), false);
assert.equal(chatTextNeedsHandlers("hello from chat"), false);
assert.equal(chatTextNeedsHandlers("!points"), true);

assert.equal(kickTokenAllowsChatWrite(["user:read", "chat:write"]), true);
assert.equal(kickTokenAllowsChatWrite(["user:read"]), false);
assert.equal(kickTokenAllowsChatWrite([]), false);
assert.equal(kickTokenAllowsChatWrite(null), false);
assert.equal(redactKickError("Bearer secret-token").includes("secret-token"), false);

assert.equal(isCylixBotChatAuthor("CylixBot", "55", null), false);
assert.equal(isCylixBotChatAuthor("viewer", "55", "55"), true);
assert.equal(isCylixBotChatAuthor("CylixBot", "55", "99"), false);

resetKickEventMemory();
rememberKickEvent("dup-1");
assert.equal(kickEventAlreadyHandled("dup-1"), true);

const one: Sent[] = [];
const oneOk = await sendBot("user-a", "42", "!points", null, {
  loadToken: async () => "channel-a-token",
  fetchImpl: mockFetch(one, () => 200),
});
assert.equal(oneOk, true);
assert.equal(one.length, 1);
assert.equal(one[0]?.type, "bot");
assert.equal(one[0]?.body["broadcaster_user_id"], undefined);
assert.equal(one[0]?.auth, "Bearer channel-a-token");

const channels = [
  { userId: "user-a", broadcaster: "42", token: "token-a" },
  { userId: "user-b", broadcaster: "77", token: "token-b" },
];
const channelSent: Sent[] = [];
for (const channel of channels) {
  await sendBot(channel.userId, channel.broadcaster, channel.broadcaster, null, {
    loadToken: async (userId) => channels.find((item) => item.userId === userId)?.token ?? null,
    fetchImpl: mockFetch(channelSent, () => 200),
  });
}
assert.deepEqual(
  channelSent.map((item) => item.auth),
  ["Bearer token-a", "Bearer token-b"],
);
assert.deepEqual(
  channelSent.map((item) => item.body["content"]),
  ["42", "77"],
);

async function burst(count: number) {
  const sent: Sent[] = [];
  const samples: number[] = [];
  await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const trace = createKickReplyTrace(String(index), () => performance.now());
      trace.mark("webhook_received");
      const started = performance.now();
      const ok = await sendBot("user-a", "42", `cmd-${index}`, null, {
        loadToken: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return "channel-a-token";
        },
        fetchImpl: async (url, init) => {
          await new Promise((resolve) => setTimeout(resolve, 8));
          return mockFetch(sent, () => 200)(url, init);
        },
      });
      trace.mark("chat_response_received");
      const worker = workerReplyMs(trace.sample());
      assert.equal(ok, true);
      assert.ok(worker != null && worker < 1000);
      samples.push(performance.now() - started);
    }),
  );
  const summary = summarizeKickReplyMs(samples);
  assert.equal(summary.count, count);
  assert.ok(summary.p95 < 1000);
  assert.ok(summary.max < 1000);
  assert.equal(sent.length, count);
  assert.ok(sent.every((item) => item.type === "bot" && item.auth === "Bearer channel-a-token"));
  return summary;
}

const burst10 = await burst(10);
const burst50 = await burst(50);

const missingWrite: Sent[] = [];
const missing = await sendBot("user-a", "42", "!points", null, {
  loadToken: async () => null,
  fetchImpl: mockFetch(missingWrite, () => 200),
});
assert.equal(missing, false);
assert.equal(missingWrite.length, 0);

const expiredSent: Sent[] = [];
let loads = 0;
const expired = await sendBot("user-a", "42", "!points", null, {
  loadToken: async (_userId, force) => {
    loads += 1;
    return force ? "refreshed-token" : "expired-token";
  },
  fetchImpl: mockFetch(expiredSent, (call) => (call === 1 ? 401 : 200)),
});
assert.equal(expired, true);
assert.equal(loads, 2);
assert.equal(expiredSent.length, 2);
assert.equal(expiredSent[0]?.auth, "Bearer expired-token");
assert.equal(expiredSent[1]?.auth, "Bearer refreshed-token");
assert.equal(expiredSent.every((item) => item.type === "bot"), true);

const stuck: Sent[] = [];
const still401 = await sendBot("user-a", "42", "!points", null, {
  loadToken: async () => "same-token",
  fetchImpl: mockFetch(stuck, () => 401),
});
assert.equal(still401, false);
assert.equal(stuck.length, 1);

for (const status of [403, 429, 500]) {
  const sent: Sent[] = [];
  const ok = await sendBot("user-a", "42", "!points", null, {
    loadToken: async (_id, force) => {
      if (force) throw new Error("must not refresh");
      return "channel-a-token";
    },
    fetchImpl: mockFetch(sent, () => status),
  });
  assert.equal(ok, false);
  assert.equal(sent.length, 1, `status ${status} retried`);
  assert.equal(sent[0]?.type, "bot");
}

const rate = await import("@/lib/kickChatDeliver");
const limited = await rate.deliverKickChat({
  token: "channel-a-token",
  broadcasterUserId: "42",
  content: "hi",
  fetchImpl: async () => ({
    ok: false,
    status: 429,
    headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "2" : null) },
    text: async () => "",
  }),
});
assert.equal(limited.reason, "bot_429");
assert.equal(limited.retryAfterMs, 2000);

const timerSent: Sent[] = [];
const timerOk = await sendBot("user-a", "42", "timer line", null, {
  userOnly: true,
  loadToken: async () => "channel-a-token",
  fetchImpl: mockFetch(timerSent, () => 200),
});
assert.equal(timerOk, true);
assert.equal(timerSent[0]?.type, "bot");
assert.equal(timerSent[0]?.body["broadcaster_user_id"], undefined);

let refreshRuns = 0;
const inflight = new Map<string, Promise<string>>();
const [first, second] = await Promise.all([
  singleFlight("conn-1", inflight, async () => {
    refreshRuns += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "rotated";
  }),
  singleFlight("conn-1", inflight, async () => {
    refreshRuns += 1;
    return "other";
  }),
]);
assert.equal(first, "rotated");
assert.equal(second, "rotated");
assert.equal(refreshRuns, 1);

const dbSamples: KickReplySample[] = [];
for (let index = 0; index < 20; index += 1) {
  const clock = { t: index * 1000 };
  const trace = createKickReplyTrace(String(index), () => clock.t);
  trace.mark("webhook_received");
  clock.t += 40 + index;
  trace.mark("db_done");
  clock.t += 15;
  trace.mark("chat_request_started");
  clock.t += 25 + (index % 5);
  trace.mark("chat_response_received");
  dbSamples.push(trace.sample());
}
const dbSummary = summarizeKickReplyMs(dbSamples.map((sample) => workerReplyMs(sample) ?? 0));
assert.equal(dbSummary.count, 20);
assert.ok(dbSummary.p50 < 1000);
assert.ok(dbSummary.max < 1000);

const importStart = performance.now();
await import("@/lib/kickWebhookParse");
const coldParseMs = performance.now() - importStart;
assert.ok(coldParseMs < 1000);

console.log(
  JSON.stringify(
    {
      ok: true,
      burst10,
      burst50,
      dbSummary,
      coldParseMs: Number(coldParseMs.toFixed(2)),
      queriesForSimpleCommand: "connection lookup + channel token read (catalog skipped when the line starts with !)",
      artificialDelayMs: 0,
    },
    null,
    2,
  ),
);
