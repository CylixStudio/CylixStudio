// NOT an OBS or dashboard preview. Headless shared-session run on the real wall clock.
// node --import ./scripts/command-match-loader.mjs ./scripts/subathon-timer-wall-check.mjs
import assert from "node:assert/strict";

import { SubathonTimerSession, encodeRunning, formatDuration } from "../src/lib/timer.ts";

const MINUTES = 15;
const TOTAL_MS = MINUTES * 60 * 1000;

function read() {
  return { wallMs: Date.now(), perfMs: performance.now() };
}

const session = new SubathonTimerSession();
const origin = session.now(read());
const endAt = origin + TOTAL_MS;
const encoded = encodeRunning(endAt, TOTAL_MS);
session.adopt(
  {
    status: "RUNNING",
    accumulatedSeconds: encoded.remaining_seconds,
    startedAt: encoded.started_at,
    pausedAt: null,
    expiresAt: encoded.expires_at,
    totalAddedSeconds: 0,
    maxTimeSeconds: null,
    revision: origin,
  },
  "sync",
  origin,
);
session.lockNtpOffset([
  { t0: origin, t1: origin + 16, serverTime: origin + 8 },
  { t0: origin + 20, t1: origin + 36, serverTime: origin + 28 },
]);

let previous = session.project(read()).displayedSeconds;
let lastPrint = -1;
const startedPerf = performance.now();

function sample(forceLabel) {
  const view = session.project(read());
  const elapsed = Math.round(performance.now() - startedPerf);
  assert.ok(view.displayedSeconds <= previous, `displayed increased ${previous} -> ${view.displayedSeconds}`);
  assert.equal(view.endAtMs, endAt);
  const minute = Math.floor(elapsed / 60000);
  if (forceLabel || (minute !== lastPrint && minute % 5 === 0)) {
    lastPrint = minute;
    console.log(JSON.stringify({
      label: forceLabel ?? `minute-${minute}`,
      note: "headless shared session, not OBS",
      elapsedMs: elapsed,
      endAtMs: view.endAtMs,
      remainingMs: view.remainingMs,
      displayedSeconds: view.displayedSeconds,
      displayed: formatDuration(view.displayedSeconds),
      serverOffsetMs: view.serverOffsetMs,
      revision: view.revision,
    }));
  }
  previous = view.displayedSeconds;
  return view;
}

sample("start");

await new Promise((resolve, reject) => {
  const timer = setInterval(() => {
    try {
      const elapsed = performance.now() - startedPerf;
      sample();
      if (elapsed >= TOTAL_MS) {
        clearInterval(timer);
        resolve();
      }
    } catch (error) {
      clearInterval(timer);
      reject(error);
    }
  }, 1000);
});

const end = sample("minute-15");
assert.equal(end.displayedSeconds, 0);
console.log(JSON.stringify({ label: "wall-check-passed", note: "headless shared session, not OBS" }));
