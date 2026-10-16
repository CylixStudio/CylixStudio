import assert from "node:assert/strict";
import test from "node:test";

import { reconcileChatLines, type OverlayChatLine } from "../src/lib/overlayChat.ts";
import {
  createOverlayLink,
  eventFromBroadcast,
  mergeAlert,
  mergeServerEvents,
  reconnectDelay,
} from "../src/lib/overlayTransport.ts";
import type { OverlayEvent } from "../src/lib/widgets.ts";

function line(id: string, at: number): OverlayChatLine {
  return { id, platform: "KICK", author: "viewer", color: null, badges: [], text: id, at };
}

function alert(id: string, createdAt: string): OverlayEvent {
  return {
    id,
    platform: "KICK",
    eventType: "subscription",
    actorName: "viewer",
    amount: null,
    currency: null,
    quantity: 1,
    secondsAdded: 30,
    createdAt,
  };
}

test("one stream stays open and does not arm a second reconnect", () => {
  const link = createOverlayLink();
  assert.equal(link.begin().opened, true);
  assert.equal(link.begin().opened, false);
  link.opened();
  assert.equal(link.fallbackActive(), false);
  assert.equal(link.streamOpen(), true);
  const first = link.lost();
  const second = link.lost();
  assert.equal(first.schedule, true);
  assert.equal(first.delay, reconnectDelay(1));
  assert.equal(second.schedule, false);
  assert.equal(link.fallbackActive(), true);
  link.retryDue();
  assert.equal(link.begin().opened, true);
  link.opened();
  assert.equal(link.fallbackActive(), false);
});

test("a late boot timeout does not start fallback after the stream is open", () => {
  const link = createOverlayLink();
  link.begin();
  link.opened();
  assert.equal(link.bootTimedOut(), false);
  assert.equal(link.fallbackActive(), false);
});

test("chat and alert events survive a stale snapshot", () => {
  const kept = reconcileChatLines([line("new", 20)], [line("old", 10)]);
  assert.deepEqual(kept.map((item) => item.id), ["new", "old"]);

  const live = eventFromBroadcast({
    eventId: "evt-1",
    platform: "KICK",
    eventType: "subscription",
    actorName: "Nova",
    secondsAdded: 60,
    isTest: false,
  });
  assert.ok(live);
  assert.equal(live?.secondsAdded, 60);
  const shown = mergeAlert([], live);
  const stale = mergeServerEvents([], shown, Date.parse(live.createdAt) + 1000);
  assert.equal(stale.some((event) => event.id === "evt-1"), true);
  const settled = mergeServerEvents([alert("evt-1", live.createdAt)], shown, Date.parse(live.createdAt) + 1000);
  assert.equal(settled.filter((event) => event.id === "evt-1").length, 1);
});
