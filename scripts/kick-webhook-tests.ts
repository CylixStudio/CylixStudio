import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { catalogDefaultCommands, matchDefaultCommand } from "@/lib/defaultCommands";
import { deliverKickChat, kickChatAttempts, selectChannelChatToken } from "@/lib/kickChatDeliver";
import {
  chatLineNeedsCommandModules,
  chatTextNeedsHandlers,
  extractKickChat,
  isCylixBotChatAuthor,
  kickEventAlreadyHandled,
  rememberKickEvent,
  resetKickEventMemory,
} from "@/lib/kickWebhookParse";
import { matchCustomCommand, type CustomChatCommand } from "@/lib/customCommands";
import { verifyKickSignature } from "@/lib/webhooks/verify.server";

function cpuMs(): number {
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1000;
}

const chatBody = {
  message_id: "11111111-1111-4111-8111-111111111111",
  content: "hello from chat",
  broadcaster: { user_id: 42, username: "channel", channel_slug: "channel" },
  sender: {
    user_id: 7,
    username: "viewer",
    identity: { badges: [{ type: "subscriber" }] },
  },
};

const parsed = extractKickChat(chatBody);
assert.equal(parsed.broadcasterId, "42");
assert.equal(parsed.senderUserId, "7");
assert.equal(parsed.username, "viewer");
assert.equal(parsed.text, "hello from chat");
assert.equal(chatTextNeedsHandlers(parsed.text), false);
assert.equal(chatTextNeedsHandlers("!points"), true);
assert.equal(chatTextNeedsHandlers("!م"), true);
assert.equal(chatTextNeedsHandlers("!mycommand"), true);
assert.equal(chatTextNeedsHandlers("#clip"), true);
assert.equal(chatTextNeedsHandlers("?discord"), true);
assert.equal(chatTextNeedsHandlers("discord?"), false);
assert.equal(chatTextNeedsHandlers("how are you?"), false);
assert.equal(chatTextNeedsHandlers("shop"), true);
assert.equal(chatTextNeedsHandlers("wheel"), true);
assert.equal(chatTextNeedsHandlers("عجلة"), true);
assert.equal(chatTextNeedsHandlers("!mark"), true);
assert.equal(chatTextNeedsHandlers("/mark note"), true);
assert.equal(chatTextNeedsHandlers("/emark"), true);
assert.equal(chatTextNeedsHandlers("emark note"), true);
assert.equal(chatTextNeedsHandlers("https://youtu.be/abcdefghijk"), true);
assert.equal(chatTextNeedsHandlers("spotify:track:abc"), true);

const emptyCatalog = { defaultPrefix: "!", commands: [] as CustomChatCommand[] };
assert.equal(await chatLineNeedsCommandModules("hello from chat", emptyCatalog), false);
assert.equal(await chatLineNeedsCommandModules("hello from chat", null), true);
assert.equal(await chatLineNeedsCommandModules("?discord", null), true);

const defaults = catalogDefaultCommands("en");
assert.equal(matchDefaultCommand("!followage", defaults, "KICK")?.command.id, "followage");
assert.equal(matchDefaultCommand("!followage extra", defaults, "KICK"), null);
assert.equal(matchDefaultCommand("hello from chat", defaults, "KICK"), null);

const custom: CustomChatCommand = {
  id: "c1",
  name: "discord",
  prefix: "!",
  response: "join $(url)",
  enabled: true,
  platforms: ["KICK"],
  roles: ["Everyone"],
  cooldownSeconds: 0,
  createdAt: "",
  updatedAt: "",
};
assert.equal(matchCustomCommand("!discord", [custom], "!", "KICK")?.name, "discord");
assert.equal(matchCustomCommand("!discord test", [custom], "!", "KICK"), null);
assert.equal(matchCustomCommand("hello from chat", [custom], "!", "KICK"), null);
assert.equal(await chatLineNeedsCommandModules("!discord", { defaultPrefix: "!", commands: [custom] }), true);
assert.equal(await chatLineNeedsCommandModules("hello from chat", { defaultPrefix: "!", commands: [custom] }), false);

const arabic = { ...custom, id: "c2", name: "م", prefix: "!" as const };
assert.equal(matchCustomCommand("!م الان", [arabic], "!", "KICK"), null);
assert.equal(await chatLineNeedsCommandModules("!م الان", { defaultPrefix: "!", commands: [arabic] }), true);
assert.equal(await chatLineNeedsCommandModules("مرحبا", { defaultPrefix: "!", commands: [arabic] }), false);

const direct = { ...custom, id: "c3", name: "م", prefix: "" as const };
assert.equal(matchCustomCommand("م", [direct], "!", "KICK")?.name, "م");
assert.equal(matchCustomCommand("م يستاهل", [direct], "!", "KICK"), null);
assert.equal(await chatLineNeedsCommandModules("م", { defaultPrefix: "!", commands: [direct] }), true);
assert.equal(await chatLineNeedsCommandModules("م يستاهل", { defaultPrefix: "!", commands: [direct] }), false);
assert.equal(await chatLineNeedsCommandModules("hello there", { defaultPrefix: "!", commands: [direct] }), false);

const question = { ...custom, id: "c4", name: "question", prefix: "?" as const };
assert.equal(await chatLineNeedsCommandModules("?question", { defaultPrefix: "!", commands: [question] }), true);
assert.equal(await chatLineNeedsCommandModules("#name", { defaultPrefix: "!", commands: [{ ...custom, name: "name", prefix: "#" }] }), true);

const attempts = kickChatAttempts("hi", null);
assert.equal(attempts.length, 1);
assert.equal(attempts[0]?.type, "bot");
assert.equal(attempts[0]?.payload["broadcaster_user_id"], undefined);
assert.equal(selectChannelChatToken(null), null);
assert.equal(selectChannelChatToken("channel-token"), "channel-token");
assert.equal(isCylixBotChatAuthor("CylixBot", "9", null), false);
assert.equal(isCylixBotChatAuthor("@cylixbot", null, "9"), false);
assert.equal(isCylixBotChatAuthor("CreovixStudio", "9", "9"), true);
assert.equal(isCylixBotChatAuthor("viewer", "7", "9"), false);

const calls: string[] = [];
const expired = await deliverKickChat({
  token: selectChannelChatToken(null),
  broadcasterUserId: "42",
  content: "hi",
  fetchImpl: async () => {
    calls.push("fetch");
    return { ok: true, status: 200, text: async () => "" };
  },
});
assert.equal(expired.reason, "no_access_token");
assert.equal(calls.length, 0);

const sentTypes: string[] = [];
const sentAuth: string[] = [];
const sent = await deliverKickChat({
  token: "cylixbot-token",
  broadcasterUserId: "42",
  content: "hi",
  fetchImpl: async (_url, init) => {
    const payload = JSON.parse(init.body) as { type: string; broadcaster_user_id?: number };
    sentTypes.push(payload.type);
    sentAuth.push(init.headers["Authorization"] ?? "");
    assert.equal(payload.broadcaster_user_id, undefined);
    assert.equal(payload.type, "bot");
    return { ok: true, status: 200, text: async () => "{\"data\":{\"is_sent\":true}}" };
  },
});
assert.deepEqual(sentTypes, ["bot"]);
assert.equal(sentAuth[0], "Bearer cylixbot-token");
assert.equal(sent.ok, true);

let forbiddenCalls = 0;
const forbidden = await deliverKickChat({
  token: "cylixbot-token",
  broadcasterUserId: "42",
  content: "hi",
  fetchImpl: async (_url, init) => {
    forbiddenCalls += 1;
    assert.equal(init.headers["Authorization"], "Bearer cylixbot-token");
    return {
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: "Forbidden", access_token: "secret-value" }),
    };
  },
});
assert.equal(forbidden.ok, false);
assert.equal(forbidden.reason, "bot_forbidden");
assert.equal(forbiddenCalls, 1);

let unauthorizedCalls = 0;
const unauthorized = await deliverKickChat({
  token: "cylixbot-token",
  broadcasterUserId: "42",
  content: "hi",
  fetchImpl: async () => {
    unauthorizedCalls += 1;
    return { ok: false, status: 401, text: async () => JSON.stringify({ error: "invalid_token" }) };
  },
});
assert.equal(unauthorized.ok, false);
assert.equal(unauthorized.reason, "bot_401");
assert.equal(unauthorizedCalls, 1);

resetKickEventMemory();
assert.equal(kickEventAlreadyHandled("evt-1"), false);
rememberKickEvent("evt-1");
assert.equal(kickEventAlreadyHandled("evt-1"), true);
rememberKickEvent("evt-1");
assert.equal(kickEventAlreadyHandled("evt-1"), true);

const raw = JSON.stringify(chatBody);
const missing = await verifyKickSignature({
  publicKeyPem: undefined,
  hmacSecret: undefined,
  messageId: null,
  timestamp: null,
  signature: null,
  rawBody: raw,
});
assert.equal(missing.ok, false);
assert.equal(missing.reason, "missing_headers");

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const messageId = "evt-sig";
const timestamp = String(Math.floor(Date.now() / 1000));
const payload = `${messageId}.${timestamp}.${raw}`;
const signature = sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64");
const mismatch = await verifyKickSignature({
  publicKeyPem: undefined,
  hmacSecret: undefined,
  messageId,
  timestamp,
  signature,
  rawBody: raw,
});
assert.equal(mismatch.ok, false);
assert.equal(mismatch.reason, "signature_mismatch");

const rounds = 80;
const rsaStart = cpuMs();
for (let i = 0; i < rounds; i++) {
  await verifyKickSignature({
    publicKeyPem: undefined,
    hmacSecret: undefined,
    messageId,
    timestamp,
    signature,
    rawBody: raw,
  });
}
const rsaCpu = cpuMs() - rsaStart;

const matchStart = cpuMs();
for (let i = 0; i < 4000; i++) matchDefaultCommand("!followage", defaults, "KICK");
const matchCpu = cpuMs() - matchStart;

console.log(
  JSON.stringify(
    {
      ok: true,
      rsaVerifyPerCallMs: Number((rsaCpu / rounds).toFixed(3)),
      matchDefault4000CpuMs: Number(matchCpu.toFixed(2)),
    },
    null,
    2,
  ),
);
