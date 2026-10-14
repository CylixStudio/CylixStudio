// node --import ./scripts/command-match-loader.mjs ./scripts/subathon-timer-tests.mjs
import assert from "node:assert/strict";
import { mock } from "node:test";

import {
  SubathonTimerSession,
  displayedSeconds,
  encodeRunning,
  formatDuration,
  remainingMsAt,
  snapshotFromRow,
  startDisplayLoop,
  toFrame,
} from "../src/lib/timer.ts";
import { pauseUpdate, startUpdate } from "../src/lib/timer.server.ts";

const HOUR = 3600;

function log(label, view, extra = {}) {
  console.log(
    JSON.stringify({
      label,
      endAtMs: view.endAtMs,
      remainingMs: view.remainingMs,
      displayedSeconds: view.displayedSeconds,
      displayed: formatDuration(view.displayedSeconds),
      revision: view.revision,
      serverOffsetMs: view.serverOffsetMs,
      reason: extra.reason ?? null,
      eventId: extra.eventId ?? null,
      source: extra.source ?? null,
      deltaMs: extra.deltaMs ?? null,
    }),
  );
}

function logMutations(session, label) {
  for (const entry of session.entries) {
    log(label, entry, {
      reason: entry.reason,
      eventId: entry.eventId,
      source: entry.source,
      deltaMs: entry.deltaMs,
    });
  }
}

function clock(startWall) {
  let wall = startWall;
  let perf = 0;
  const read = () => ({ wallMs: wall, perfMs: perf });
  return {
    read,
    advance(ms) {
      wall += ms;
      perf += ms;
    },
    jumpWall(ms) {
      wall += ms;
    },
  };
}

function runningSnapshot(nowMs, seconds, revision) {
  const encoded = encodeRunning(nowMs + seconds * 1000, seconds * 1000);
  return {
    status: "RUNNING",
    accumulatedSeconds: encoded.remaining_seconds,
    startedAt: encoded.started_at,
    pausedAt: null,
    expiresAt: encoded.expires_at,
    totalAddedSeconds: 0,
    maxTimeSeconds: null,
    revision,
  };
}

function arm(seconds, startWall = 1_700_000_000_000) {
  const time = clock(startWall);
  const session = new SubathonTimerSession();
  const now = session.now(time.read());
  const snap = runningSnapshot(now, seconds, now);
  const view = session.adopt(snap, "sync", now);
  return { time, session, now, snap, view };
}

function assertNeverIncreases(samples) {
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(
      samples[i] <= samples[i - 1],
      `displayed second increased ${samples[i - 1]} -> ${samples[i]} at step ${i}`,
    );
  }
}

function rowFrom(snapshot, id = "timer-1") {
  return {
    id,
    subathon_id: "sub-1",
    status: snapshot.status,
    remaining_seconds: snapshot.accumulatedSeconds,
    started_at: snapshot.startedAt,
    paused_at: snapshot.pausedAt,
    expires_at: snapshot.expiresAt,
    total_added_seconds: snapshot.totalAddedSeconds,
    last_tick_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(snapshot.revision || 1).toISOString(),
  };
}

function contextOf(snapshot) {
  return {
    subathonId: "sub-1",
    userId: "user-1",
    maxTimeSeconds: null,
    initialSeconds: HOUR,
    row: rowFrom(snapshot),
  };
}

/**
 * The previous client applied `remainingSeconds` from a snapshot computed at
 * serverTime, and set offset = serverTime - Date.now(). Delay makes that
 * integer one second higher than the second the view has already reached.
 */
function legacyStaleSecond() {
  const bank = 7_057;
  const localNow = 10_200;
  const localDisplay = bank - Math.floor(localNow / 1000);
  const serverTime = 9_400;
  const snapshotDisplay = bank - Math.floor(serverTime / 1000);
  return { localDisplay, snapshotDisplay, gained: snapshotDisplay - localDisplay };
}

function testLegacyCause() {
  const legacy = legacyStaleSecond();
  assert.equal(legacy.gained, 1);
  log("legacy-stale-second", {
    endAtMs: null,
    remainingMs: legacy.localDisplay * 1000,
    displayedSeconds: legacy.snapshotDisplay,
    revision: 0,
    serverOffsetMs: legacy.serverTime ?? -800,
  }, { reason: "stale_remaining_seconds", source: "sync", deltaMs: 1000 });
  console.log(JSON.stringify({ label: "legacy-proof", ...legacy, note: "stale ceil integer is +1" }));
}

function testSixtyMinutes() {
  const { time, session, view } = arm(HOUR);
  const endAt = view.endAtMs;
  const samples = [view.displayedSeconds];
  log("60m-start", view, { reason: "snapshot", source: "sync" });
  for (let second = 1; second <= HOUR; second += 1) {
    time.advance(1000);
    const next = session.project(time.read());
    samples.push(next.displayedSeconds);
    assert.equal(next.endAtMs, endAt);
    assert.equal(next.serverOffsetMs, 0);
    assert.equal(next.displayedSeconds, HOUR - second);
    assert.equal(next.remainingMs, (HOUR - second) * 1000);
    if (second % 600 === 0) log("60m-tick", next, { reason: "natural_countdown", source: "display" });
  }
  assertNeverIncreases(samples);
  assert.equal(samples.at(-1), 0);
  logMutations(session, "60m-mutation");
}

function testFifteenMinuteTicks() {
  const seconds = 15 * 60;
  const { time, session, view } = arm(seconds);
  log("15m-start", view, { reason: "snapshot", source: "sync" });
  let previous = view.displayedSeconds;
  for (let second = 1; second <= seconds; second += 1) {
    time.advance(1000);
    const next = session.project(time.read());
    log("15m-tick", next, { reason: "natural_countdown", source: "display" });
    assert.equal(next.displayedSeconds, previous - 1);
    assert.equal(next.serverOffsetMs, 0);
    previous = next.displayedSeconds;
  }
  assert.equal(previous, 0);
}

function testDelayedInterval() {
  const { time, session, view } = arm(HOUR);
  const samples = [];
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const stop = startDisplayLoop(session, time.read, (next) => {
      samples.push(next.displayedSeconds);
      log("delayed-interval", next, { reason: "natural_countdown", source: "display" });
    }, 1000);
    time.advance(1000);
    mock.timers.tick(1000);
    time.advance(2500);
    mock.timers.tick(2500);
    stop();
  } finally {
    mock.timers.reset();
  }
  assert.ok(samples.length >= 2);
  assertNeverIncreases(samples);
  assert.equal(samples[0], view.displayedSeconds - 1);
  assert.equal(samples.at(-1), view.displayedSeconds - 3);
}

function ntpPair(clientAt, serverAt, rttMs) {
  return {
    t0: clientAt,
    t1: clientAt + rttMs,
    serverTime: serverAt + rttMs / 2,
  };
}

function testDeviceSkew(sign) {
  const serverNow = 1_700_000_000_000;
  const skew = sign * 5 * 60 * 1000;
  const time = clock(serverNow + skew);
  const session = new SubathonTimerSession();
  session.now(time.read());
  const locked = session.lockNtpOffset([
    ntpPair(serverNow + skew, serverNow, 80),
    ntpPair(serverNow + skew + 250, serverNow + 250, 140),
  ]);
  assert.equal(locked, -skew);
  const serverViewSeconds = HOUR;
  const snap = runningSnapshot(serverNow, HOUR, serverNow);
  const first = session.adopt(snap, "sync", session.now(time.read()));
  assert.ok(Math.abs(first.displayedSeconds - serverViewSeconds) <= 1);
  assert.equal(first.serverOffsetMs, -skew);
  assert.equal(first.endAtMs, serverNow + HOUR * 1000);
  const again = session.lockNtpOffset([
    ntpPair(serverNow + skew + 8_000, serverNow + 1_000, 3_000),
    { t0: serverNow + skew + 9_000, t1: serverNow + skew + 9_400, serverTime: serverNow + 50_000 },
  ]);
  assert.equal(again, locked);
  assert.equal(session.serverOffsetMs, locked);
  const frame = toFrame(snap, serverNow + 60_000);
  frame.serverTime = serverNow + 60_000;
  const replayed = session.adoptFrame(frame, "realtime", session.now(time.read()));
  assert.equal(session.serverOffsetMs, locked);
  assert.equal(replayed.endAtMs, first.endAtMs);
  const samples = [first.displayedSeconds];
  for (let second = 1; second <= 30; second += 1) {
    time.advance(1000);
    const next = session.project(time.read());
    samples.push(next.displayedSeconds);
    assert.equal(next.serverOffsetMs, locked);
    assert.equal(next.endAtMs, first.endAtMs);
    const serverDisplayed = HOUR - second;
    assert.ok(Math.abs(next.displayedSeconds - serverDisplayed) <= 1);
  }
  assertNeverIncreases(samples);
  log(sign > 0 ? "skew-fast" : "skew-slow", session.project(time.read()), {
    reason: "natural_countdown",
    source: "display",
  });
}

function testRepeatedSnapshots() {
  const { time, session, snap, view } = arm(HOUR);
  const before = session.entries.length;
  const samples = [view.displayedSeconds];
  for (let i = 0; i < 40; i += 1) {
    time.advance(250);
    const frame = toFrame(snap, time.read().wallMs);
    frame.remainingSeconds = view.displayedSeconds + 1;
    const next = session.adoptFrame(frame, "realtime", session.now(time.read()));
    samples.push(next.displayedSeconds);
    assert.equal(next.endAtMs, view.endAtMs);
  }
  assert.equal(session.entries.length, before);
  assertNeverIncreases(samples);
  log("repeated-snapshots", session.project(time.read()), { reason: "natural_countdown", source: "realtime" });
}

function testOutOfOrder() {
  const { time, session, snap, now } = arm(HOUR);
  const added = {
    ...snap,
    accumulatedSeconds: snap.accumulatedSeconds + 30,
    revision: now + 3_000,
  };
  const stale = {
    ...snap,
    accumulatedSeconds: snap.accumulatedSeconds + 10,
    revision: now + 1_000,
  };
  const corrected = session.adopt(added, "realtime", session.now(time.read()));
  log("out-of-order-new", corrected, { reason: "server_correction", source: "realtime", deltaMs: 30_000 });
  const ignored = session.adopt(stale, "realtime", session.now(time.read()));
  assert.equal(ignored.remainingMs, corrected.remainingMs);
  assert.equal(ignored.displayedSeconds, corrected.displayedSeconds);
  assert.ok(session.entries.some((entry) => entry.reason === "stale_snapshot"));
  logMutations(session, "out-of-order");
}

function testTwoTabs() {
  const start = 1_700_000_000_000;
  const time = clock(start);
  const left = new SubathonTimerSession();
  const right = new SubathonTimerSession();
  const now = left.now(time.read());
  right.now(time.read());
  const snap = runningSnapshot(now, HOUR, now);
  const a = left.adopt(snap, "realtime", now);
  const b = right.adopt(snap, "realtime", right.now(time.read()));
  assert.equal(a.endAtMs, b.endAtMs);
  assert.equal(a.displayedSeconds, b.displayedSeconds);
  for (let i = 0; i < 25; i += 1) {
    time.advance(1000);
    const lv = left.project(time.read());
    const rv = right.project(time.read());
    assert.equal(lv.endAtMs, rv.endAtMs);
    assert.equal(lv.remainingMs, rv.remainingMs);
    assert.equal(lv.displayedSeconds, rv.displayedSeconds);
    assert.equal(lv.displayedSeconds, HOUR - (i + 1));
  }
  log("two-tabs", left.project(time.read()), { reason: "natural_countdown", source: "realtime" });
}

function testRemount() {
  const { time, session, snap, view } = arm(2 * HOUR);
  time.advance(90_000);
  const beforeClose = session.project(time.read());
  assert.ok(beforeClose.displayedSeconds < view.displayedSeconds);
  const reopened = new SubathonTimerSession();
  const now = reopened.now(time.read());
  const after = reopened.adopt(snap, "sync", now);
  assert.equal(after.endAtMs, view.endAtMs);
  assert.equal(after.remainingMs, view.endAtMs - now);
  assert.ok(after.remainingMs < view.remainingMs);
  assert.ok(after.displayedSeconds <= beforeClose.displayedSeconds);
  log("obs-reopen", after, { reason: "snapshot", source: "sync" });
}

function testPauseResume() {
  const { time, session } = arm(2 * HOUR);
  for (let i = 0; i < 100; i += 1) {
    time.advance(17);
    const running = session.project(time.read());
    const paused = session.pause(session.now(time.read()));
    assert.equal(paused.remainingMs, running.remainingMs);
    assert.equal(paused.displayedSeconds, running.displayedSeconds);
    time.advance(53);
    const held = session.project(time.read());
    assert.equal(held.remainingMs, paused.remainingMs);
    assert.equal(held.displayedSeconds, paused.displayedSeconds);
    const resumed = session.resume(session.now(time.read()));
    assert.equal(resumed.remainingMs, paused.remainingMs);
    assert.equal(resumed.displayedSeconds, paused.displayedSeconds);
    assert.equal(resumed.serverOffsetMs, 0);
  }
  logMutations(session, "pause-resume");
}

function testAddAndRemove() {
  const running = arm(HOUR);
  const before = running.session.project(running.time.read());
  const added = running.session.adjust(30, running.session.now(running.time.read()), "manual");
  assert.equal(added.remainingMs - before.remainingMs, 30_000);
  assert.equal(added.displayedSeconds - before.displayedSeconds, 30);
  assert.equal(added.endAtMs - before.endAtMs, 30_000);
  const removed = running.session.adjust(-30, running.session.now(running.time.read()), "manual");
  assert.equal(removed.remainingMs, before.remainingMs);
  assert.equal(removed.displayedSeconds, before.displayedSeconds);
  const webhook = running.session.applyWebhook("evt-30", 30, running.session.now(running.time.read()));
  assert.equal(webhook.remainingMs - before.remainingMs, 30_000);
  assert.equal(webhook.displayedSeconds - before.displayedSeconds, 30);
  const duplicate = running.session.applyWebhook("evt-30", 30, running.session.now(running.time.read()));
  assert.equal(duplicate.remainingMs, webhook.remainingMs);
  assert.equal(duplicate.displayedSeconds, webhook.displayedSeconds);
  assert.ok(running.session.entries.some((entry) => entry.reason === "duplicate_webhook" && entry.eventId === "evt-30"));
  logMutations(running.session, "add-remove");

  const paused = arm(HOUR);
  paused.session.pause(paused.session.now(paused.time.read()));
  const held = paused.session.project(paused.time.read());
  paused.time.advance(4_000);
  const whilePaused = paused.session.applyWebhook("evt-paused", 30, paused.session.now(paused.time.read()));
  assert.equal(whilePaused.remainingMs - held.remainingMs, 30_000);
  assert.equal(whilePaused.displayedSeconds - held.displayedSeconds, 30);
  paused.time.advance(4_000);
  const still = paused.session.project(paused.time.read());
  assert.equal(still.remainingMs, whilePaused.remainingMs);
  logMutations(paused.session, "add-while-paused");
}

function testReconnectAndReload() {
  const { time, session, snap, view } = arm(3 * HOUR);
  time.advance(45_000);
  const offline = session.project(time.read());
  assert.ok(offline.displayedSeconds < view.displayedSeconds);
  const replay = session.adopt(snap, "sync", session.now(time.read()));
  assert.equal(replay.endAtMs, view.endAtMs);
  assert.equal(replay.remainingMs, offline.remainingMs);
  assert.ok(replay.displayedSeconds < view.displayedSeconds);

  const later = session.now(time.read());
  const row = snapshotFromRow(
    {
      status: "RUNNING",
      remaining_seconds: snap.accumulatedSeconds,
      started_at: snap.startedAt,
      paused_at: null,
      expires_at: snap.expiresAt,
      total_added_seconds: 0,
      updated_at: new Date(snap.revision).toISOString(),
    },
    null,
  );
  const reloaded = new SubathonTimerSession();
  const loaded = reloaded.adopt(row, "sync", later);
  assert.equal(loaded.endAtMs, view.endAtMs);
  assert.equal(loaded.remainingMs, view.endAtMs - later);
  log("reconnect", replay, { reason: "snapshot", source: "sync" });
  log("reload", loaded, { reason: "snapshot", source: "sync" });
}

function testDeviceClock() {
  const { time, session, view } = arm(HOUR);
  time.jumpWall(60 * 60 * 1000);
  time.advance(1000);
  const next = session.project(time.read());
  assert.equal(next.endAtMs, view.endAtMs);
  assert.equal(next.remainingMs, view.remainingMs - 1000);
  assert.equal(next.displayedSeconds, view.displayedSeconds - 1);
  assert.equal(next.serverOffsetMs, 0);
  log("device-clock", next, { reason: "natural_countdown", source: "display" });
}

function testReachZero() {
  const { time, session, view } = arm(3);
  const endAt = view.endAtMs;
  for (let i = 0; i < 3; i += 1) {
    time.advance(1000);
    session.project(time.read());
  }
  const zero = session.project(time.read());
  assert.equal(zero.remainingMs, 0);
  assert.equal(zero.displayedSeconds, 0);
  assert.equal(zero.status, "ENDED");
  assert.equal(zero.endAtMs, endAt);
  time.advance(10_000);
  const stayed = session.project(time.read());
  assert.equal(stayed.remainingMs, 0);
  assert.equal(stayed.displayedSeconds, 0);
  assert.equal(session.entries.filter((entry) => entry.reason === "reach_zero").length, 1);
  log("reach-zero", stayed, { reason: "reach_zero", source: "display" });
}

function testTenWidgets() {
  const time = clock(1_700_000_000_000);
  const sessions = Array.from({ length: 10 }, () => new SubathonTimerSession());
  const origin = sessions[0].now(time.read());
  for (const session of sessions) session.now(time.read());
  const views = sessions.map((session, index) =>
    session.adopt(runningSnapshot(origin, (index + 1) * 60, origin + index), "sync", origin),
  );
  const thirdBefore = views[3].remainingMs;
  const fourthBefore = views[4].remainingMs;
  sessions[3].applyWebhook("widget-3", 30, sessions[3].now(time.read()));
  assert.equal(sessions[3].viewAt(origin).remainingMs, thirdBefore + 30_000);
  assert.equal(sessions[4].viewAt(origin).remainingMs, fourthBefore);
  for (let step = 0; step < 20; step += 1) {
    time.advance(1000);
    const now = sessions[0].now(time.read());
    for (let index = 0; index < sessions.length; index += 1) {
      const view = sessions[index].project(time.read());
      if (index === 3) {
        assert.equal(view.displayedSeconds, displayedSeconds(thirdBefore + 30_000 - (step + 1) * 1000));
      } else {
        assert.equal(view.displayedSeconds, (index + 1) * 60 - (step + 1));
      }
      assert.equal(view.serverOffsetMs, 0);
    }
  }
  log("ten-widgets", sessions[3].project(time.read()), { reason: "webhook_add", source: "webhook", eventId: "widget-3" });
}

function testMultiHour() {
  const hours = 6;
  const seconds = hours * HOUR;
  const { time, session, view } = arm(seconds);
  const endAt = view.endAtMs;
  let previous = view.displayedSeconds;
  for (let second = 1; second <= seconds; second += 1) {
    time.advance(1000);
    const next = session.project(time.read());
    assert.equal(next.endAtMs, endAt);
    assert.equal(next.displayedSeconds, previous - 1);
    assert.equal(next.remainingMs, (seconds - second) * 1000);
    assert.equal(next.serverOffsetMs, 0);
    if (second % HOUR === 0) log("multi-hour", next, { reason: "natural_countdown", source: "display" });
    previous = next.displayedSeconds;
  }
  assert.equal(previous, 0);
}

function testServerRoundTripAndReset() {
  const { session, time, view } = arm(HOUR);
  time.advance(1234);
  const now = session.now(time.read());
  const running = session.project(time.read());
  const ctx = contextOf({
    ...sessionSnapshot(session, now),
    revision: now,
  });
  const pausedPatch = pauseUpdate(ctx, now);
  const pausedRow = { ...ctx.row, ...pausedPatch, updated_at: new Date(now).toISOString() };
  const pausedSnap = snapshotFromRow(pausedRow, null);
  assert.equal(remainingMsAt(pausedSnap, now), running.remainingMs);
  assert.equal(displayedSeconds(running.remainingMs), displayedSeconds(remainingMsAt(pausedSnap, now)));
  const resumeAt = now + 800;
  const resumedPatch = startUpdate({ ...ctx, row: pausedRow }, resumeAt);
  const resumedRow = { ...pausedRow, ...resumedPatch, updated_at: new Date(resumeAt).toISOString() };
  const resumedSnap = snapshotFromRow(resumedRow, null);
  assert.equal(remainingMsAt(resumedSnap, resumeAt), running.remainingMs);

  session.reset(90, now);
  const resetView = session.project(time.read());
  assert.equal(resetView.remainingMs, 90_000);
  assert.notEqual(resetView.endAtMs, view.endAtMs);
  time.advance(5_000);
  const idle = session.project(time.read());
  assert.equal(idle.remainingMs, 90_000);
  log("server-roundtrip", { ...running, endAtMs: view.endAtMs }, { reason: "pause", source: "manual" });
  logMutations(session, "reset");
}

function sessionSnapshot(session, nowMs) {
  const view = session.viewAt(nowMs);
  const encoded = encodeRunning(view.endAtMs, view.remainingMs);
  return {
    status: "RUNNING",
    accumulatedSeconds: encoded.remaining_seconds,
    startedAt: encoded.started_at,
    pausedAt: null,
    expiresAt: encoded.expires_at,
    totalAddedSeconds: 0,
    maxTimeSeconds: null,
    revision: view.revision,
  };
}

function testCorrectionDistinctFromCountdown() {
  const { time, session, view } = arm(HOUR);
  time.advance(2500);
  const before = session.project(time.read());
  assert.ok(before.displayedSeconds <= view.displayedSeconds);
  const corrected = session.correct(30, session.now(time.read()), "correction-1");
  assert.equal(corrected.remainingMs - before.remainingMs, 30_000);
  assert.equal(corrected.displayedSeconds - before.displayedSeconds, 30);
  assert.equal(corrected.serverOffsetMs, 0);
  const entry = session.entries.find((item) => item.reason === "server_correction");
  assert.ok(entry);
  assert.equal(entry.eventId, "correction-1");
  assert.equal(entry.deltaMs, 30_000);
  logMutations(session, "server-correction");
}

const tests = [
  ["legacy cause", testLegacyCause],
  ["60 minute countdown", testSixtyMinutes],
  ["15 minute ticks", testFifteenMinuteTicks],
  ["delayed interval", testDelayedInterval],
  ["clock five minutes fast", () => testDeviceSkew(1)],
  ["clock five minutes slow", () => testDeviceSkew(-1)],
  ["repeated snapshots", testRepeatedSnapshots],
  ["out of order", testOutOfOrder],
  ["two tabs", testTwoTabs],
  ["obs remount", testRemount],
  ["pause resume", testPauseResume],
  ["add and remove", testAddAndRemove],
  ["reconnect and reload", testReconnectAndReload],
  ["device clock", testDeviceClock],
  ["reach zero", testReachZero],
  ["ten widgets", testTenWidgets],
  ["multi hour", testMultiHour],
  ["server round trip", testServerRoundTripAndReset],
  ["server correction", testCorrectionDistinctFromCountdown],
];

for (const [name, run] of tests) {
  console.log(`\n# ${name}`);
  run();
}

console.log("\nsubathon timer tests passed");
