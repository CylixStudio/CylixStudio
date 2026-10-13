// node --import ./scripts/command-match-loader.mjs ./scripts/assert-points-command-permission.mjs
import assert from "node:assert/strict";
import { canManageLoyaltyPoints, parsePointsCommand, pointsCommandChangesBalance } from "../src/lib/pointsCommand.ts";

function badgeTypes(sender) {
  const badges = sender?.identity?.badges;
  if (!Array.isArray(badges)) return [];
  return badges.map((badge) => {
    if (badge && typeof badge === "object") return String(badge.type ?? badge.text ?? "");
    return String(badge ?? "");
  });
}

const viewer = {
  identityBadges: badgeTypes({
    user_id: 22,
    identity: { badges: [{ type: "subscriber", text: "Subscriber" }, { type: "vip", text: "VIP" }] },
  }),
  senderPlatformId: "22",
  broadcasterUserId: "7",
};
assert.equal(canManageLoyaltyPoints(viewer), false);

const mod = {
  identityBadges: badgeTypes({
    user_id: 22,
    identity: { badges: [{ type: "moderator", text: "Moderator" }] },
  }),
  senderPlatformId: "22",
  broadcasterUserId: "7",
};
assert.equal(canManageLoyaltyPoints(mod), true);

const ownerById = {
  identityBadges: badgeTypes({ user_id: 7, identity: { badges: [] } }),
  senderPlatformId: "7",
  broadcasterUserId: "7",
};
assert.equal(canManageLoyaltyPoints(ownerById), true);

const ownerByBadge = {
  identityBadges: badgeTypes({
    user_id: 99,
    identity: { badges: [{ type: "broadcaster", text: "Broadcaster" }] },
  }),
  senderPlatformId: "99",
  broadcasterUserId: "7",
};
assert.equal(canManageLoyaltyPoints(ownerByBadge), true);

assert.equal(
  canManageLoyaltyPoints({
    identityBadges: ["staff", "editor", "host", "admin", "global_moderator", "og"],
    senderPlatformId: "22",
    broadcasterUserId: "7",
  }),
  false,
);
assert.equal(
  canManageLoyaltyPoints({ identityBadges: ["mod"], senderPlatformId: "22", broadcasterUserId: "7" }),
  true,
);
assert.equal(
  canManageLoyaltyPoints({ identityBadges: [], senderPlatformId: null, broadcasterUserId: "7" }),
  false,
);

assert.equal(parsePointsCommand("!points")?.kind, "balance");
assert.equal(pointsCommandChangesBalance("!points"), false);
assert.equal(pointsCommandChangesBalance("!points @viewer"), false);
assert.equal(pointsCommandChangesBalance("!points add viewer 10"), true);
assert.equal(pointsCommandChangesBalance("!points remove @viewer 3"), true);
assert.equal(pointsCommandChangesBalance("!points add all 5"), true);
assert.equal(pointsCommandChangesBalance("!points remove all 5"), true);
assert.equal(parsePointsCommand("!points set viewer 10"), null);
assert.equal(parsePointsCommand("!addpoints viewer 10"), null);

console.log("points command permission assertions passed");
