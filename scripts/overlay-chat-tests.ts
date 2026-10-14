import assert from "node:assert/strict";

import {
  appendChatLine,
  chatOwnerUserId,
  chatStatusLabel,
  decideChatIngest,
  parseOverlayChat,
  publishViewerChat,
  reconcileChatLines,
  sameChatSource,
  viewerLineFromKick,
  type ChatStore,
  type ChatWidgetRecord,
  type OverlayChatLine,
} from "../src/lib/overlayChat.ts";

const hello = {
  message_id: "11111111-1111-4111-8111-111111111111",
  content: "hello from chat",
  broadcaster: { user_id: 42, username: "channel", channel_slug: "channel" },
  sender: {
    user_id: 7,
    username: "viewer",
    identity: { color: "#53FC18", badges: [{ type: "subscriber" }] },
    profile_picture: "https://example.com/viewer.png",
  },
};

const line = viewerLineFromKick(hello, "fallback");
assert.ok(line);
assert.equal(line.id, hello.message_id);
assert.equal(line.text, "hello from chat");
assert.equal(line.author, "viewer");
assert.equal(line.platform, "KICK");
assert.equal(line.color, "#53FC18");

const connections = [
  { userId: "user-a", platformUserId: "42", active: true },
  { userId: "user-b", platformUserId: "99", active: true },
  { userId: "user-c", platformUserId: "42", active: false },
];
assert.equal(chatOwnerUserId(connections, "42"), "user-a");
assert.equal(chatOwnerUserId(connections, "99"), "user-b");
assert.equal(chatOwnerUserId(connections, "7"), null);

function memoryStore(seed: Map<string, ChatWidgetRecord[]>, broadcastOk = true) {
  const listed: string[] = [];
  const broadcasts: OverlayChatLine[] = [];
  const store: ChatStore = {
    async list(userId) {
      listed.push(userId);
      const rows = seed.get(userId);
      return rows ? rows.map((row) => ({ ...row, state: structuredClone(row.state) })) : [];
    },
    async save(id, state, updatedAt) {
      for (const rows of seed.values()) {
        const row = rows.find((item) => item.id === id);
        if (!row) continue;
        if (row.updatedAt !== updatedAt) return "conflict";
        row.state = state;
        row.updatedAt = `t-${Date.now()}-${Math.random()}`;
        return "ok";
      }
      return "error";
    },
    async broadcast(_ids, payload) {
      if (!broadcastOk) return false;
      broadcasts.push(payload);
      return true;
    },
  };
  return { store, listed, broadcasts };
}

const widgets = new Map<string, ChatWidgetRecord[]>([
  ["user-a", [{ id: "widget-a", state: {}, updatedAt: "t0" }]],
  ["user-b", [{ id: "widget-b", state: {}, updatedAt: "t0" }]],
]);
const memory = memoryStore(widgets);
const owner = chatOwnerUserId(connections, "42");
assert.ok(owner);
const first = await publishViewerChat(owner, line, memory.store);
assert.equal(first.ok, true);
assert.equal(first.stored, true);
assert.deepEqual(memory.listed, ["user-a"]);
const stored = parseOverlayChat(widgets.get("user-a")?.[0]?.state);
assert.equal(stored.length, 1);
assert.equal(stored[0]?.text, "hello from chat");
assert.equal(parseOverlayChat(widgets.get("user-b")?.[0]?.state).length, 0);

const duplicate = await publishViewerChat(owner, line, memory.store);
assert.equal(duplicate.ok, true);
assert.equal(parseOverlayChat(widgets.get("user-a")?.[0]?.state).length, 1);
assert.equal(memory.broadcasts.length, 2);

const other = viewerLineFromKick(
  {
    ...hello,
    message_id: "22222222-2222-4222-8222-222222222222",
    content: "for the other channel",
    broadcaster: { user_id: 99 },
  },
  "fallback-b",
);
assert.ok(other);
const otherOwner = chatOwnerUserId(connections, "99");
assert.equal(otherOwner, "user-b");
await publishViewerChat(otherOwner!, other, memory.store);
assert.equal(parseOverlayChat(widgets.get("user-a")?.[0]?.state)[0]?.text, "hello from chat");
assert.equal(parseOverlayChat(widgets.get("user-b")?.[0]?.state)[0]?.text, "for the other channel");

const snapshot = parseOverlayChat(widgets.get("user-a")?.[0]?.state);
const afterReconnect = reconcileChatLines([], snapshot);
assert.equal(afterReconnect.length, 1);
assert.equal(afterReconnect[0]?.id, line.id);
const browserA = reconcileChatLines([], snapshot);
const browserB = reconcileChatLines([{ ...line, text: "stale local" }], snapshot);
assert.equal(browserA[0]?.text, "hello from chat");
assert.equal(browserB[0]?.text, "hello from chat");
assert.equal(browserA.length, browserB.length);

const themedDefault = sameChatSource("dark-glass", snapshot);
const themedRoyal = sameChatSource("royal-compact", snapshot);
assert.deepEqual(themedDefault, themedRoyal);
assert.equal(themedDefault[0]?.text, "hello from chat");

assert.equal(chatStatusLabel({ status: "live", count: 0, surface: "overlay" }), "Waiting for chat");
assert.equal(chatStatusLabel({ status: "connecting", count: 0, surface: "overlay" }), "Connecting");
assert.equal(chatStatusLabel({ status: "reconnecting", count: 0, surface: "overlay" }), "Reconnecting");
assert.equal(chatStatusLabel({ status: "error", count: 0, surface: "overlay" }), null);
assert.equal(chatStatusLabel({ status: "error", count: 0, surface: "studio" }), "Connection Error");
assert.equal(chatStatusLabel({ status: "live", count: 4, surface: "overlay" }), null);

const failedStore = decideChatIngest({
  publish: { ok: false, stored: false, reason: "chat_store_failed" },
});
assert.notEqual(failedStore.httpStatus, 200);
assert.equal(failedStore.httpStatus, 503);

const failedForward = decideChatIngest({
  publish: { ok: false, stored: false, reason: "chat_store_failed" },
});
assert.equal(failedForward.httpStatus, 503);

const missingBotStillShown = decideChatIngest({
  publish: { ok: true, stored: true, reason: "stored" },
  commandFailed: true,
});
assert.equal(missingBotStillShown.httpStatus, 200);
assert.equal(missingBotStillShown.reason, "command_failed_chat_kept");
assert.equal(parseOverlayChat(widgets.get("user-a")?.[0]?.state)[0]?.text, "hello from chat");

const broken = new Map<string, ChatWidgetRecord[]>([
  ["user-a", [{ id: "widget-a", state: {}, updatedAt: "t0" }]],
]);
const failing = memoryStore(broken, false);
const forwarded = await publishViewerChat("user-a", { ...line, id: "forward-fail" }, failing.store);
assert.equal(forwarded.ok, true);
assert.equal(parseOverlayChat(broken.get("user-a")?.[0]?.state)[0]?.id, "forward-fail");
const saveError = await publishViewerChat(
  "user-a",
  { ...line, id: "save-fail" },
  {
    async list() {
      return null;
    },
    async save() {
      return "error";
    },
    async broadcast() {
      return true;
    },
  },
);
assert.equal(saveError.ok, false);
assert.equal(decideChatIngest({ publish: saveError }).httpStatus, 503);
assert.equal(appendChatLine({}, line).added, true);
assert.equal(appendChatLine(appendChatLine({}, line).state, line).added, false);

console.log(JSON.stringify({ ok: true, cases: "channel, reconnect, duplicate, themes, status, store" }));
