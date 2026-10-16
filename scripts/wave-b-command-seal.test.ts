import assert from "node:assert/strict";
import test from "node:test";

import { withCommandEnabled } from "../src/lib/commandEnabled.ts";
import { acceptCommandToggle, confirmCommandToggle } from "../src/lib/commandToggle.ts";
import {
  readSealLinkCache,
  SBC_LINK_TTL_MS,
  sealLinkCacheKey,
  writeSealLinkCache,
} from "../src/lib/sbcSealCache.ts";

const CERT = "https://eauthenticate.saudibusiness.gov.sa/certificate-details/public-seal";

test("withCommandEnabled flips one row and keeps the rest", () => {
  const rows = [
    { id: "points", enabled: true, name: "points" },
    { id: "shop", enabled: true, name: "shop" },
  ];
  const next = withCommandEnabled(rows, "points", false);
  assert.equal(next[0]?.enabled, false);
  assert.equal(next[1]?.enabled, true);
  assert.equal(rows[0]?.enabled, true);
  assert.equal(withCommandEnabled(next, "points", false), next);
});

test("a failed toggle restores the previous rows and is not success", () => {
  const baseline = [
    { id: "points", enabled: true },
    { id: "shop", enabled: true },
  ];
  const failed = confirmCommandToggle(baseline, "points", false, { ok: false, error: "forced_failure" });
  assert.equal(failed.success, false);
  assert.equal(failed.commands[0]?.enabled, true);
  assert.equal(confirmCommandToggle(baseline, "points", false, null).success, false);
  const saved = confirmCommandToggle(baseline, "points", false, { ok: true });
  assert.equal(saved.success, true);
  assert.equal(saved.commands[0]?.enabled, false);
  assert.equal(baseline[0]?.enabled, true);
});

test("a locked toggle does not accept a second click", () => {
  assert.equal(acceptCommandToggle(false), true);
  assert.equal(acceptCommandToggle(true), false);
});

test("seal cache expires, stays per user, and rejects private or foreign links", () => {
  const now = 1_000_000;
  const raw = writeSealLinkCache(CERT, "user-a", now);
  assert.ok(raw);
  assert.equal(readSealLinkCache(raw, "user-a", now + 1000), CERT);
  assert.equal(readSealLinkCache(raw, "user-b", now + 1000), null);
  assert.equal(readSealLinkCache(raw, "user-a", now + SBC_LINK_TTL_MS), null);
  assert.equal(writeSealLinkCache("https://example.com/certificate-details/x", "user-a", now), null);
  assert.equal(writeSealLinkCache(CERT, "", now), null);
  assert.equal(
    writeSealLinkCache(`${CERT}?token=short-lived`, "user-a", now),
    null,
  );
  assert.equal(sealLinkCacheKey("user-a") === sealLinkCacheKey("user-b"), false);
  assert.equal(raw?.includes("token"), false);
  assert.equal(raw?.includes("@"), false);
});
