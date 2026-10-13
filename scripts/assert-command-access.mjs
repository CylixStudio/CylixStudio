// node --import ./scripts/command-match-loader.mjs ./scripts/assert-command-access.mjs
import assert from "node:assert/strict";
import { senderMayRun } from "../src/lib/commandAccess.ts";
import { catalogDefaultCommands } from "../src/lib/defaultCommands.ts";
import { pointsCommandPermitted } from "../src/lib/pointsCommand.ts";
import { alertClearsMinimum, catalogChatAlerts, renderChatAlert } from "../src/lib/chatTextAlerts.ts";

const viewer = {
  identityBadges: ["subscriber", "vip"],
  senderPlatformId: "22",
  broadcasterUserId: "7",
};
const moderator = {
  identityBadges: ["moderator"],
  senderPlatformId: "22",
  broadcasterUserId: "7",
};
const broadcaster = {
  identityBadges: [],
  senderPlatformId: "7",
  broadcasterUserId: "7",
};

assert.equal(
  pointsCommandPermitted({ kind: "add", ...viewer, addMinRole: "broadcaster" }),
  false,
);
assert.equal(
  pointsCommandPermitted({ kind: "add", ...moderator, addMinRole: "broadcaster" }),
  false,
);
assert.equal(
  pointsCommandPermitted({ kind: "add", ...broadcaster, addMinRole: "broadcaster" }),
  true,
);
assert.equal(
  pointsCommandPermitted({ kind: "balance", ...viewer, lookupMinRole: "everyone" }),
  true,
);
assert.equal(
  pointsCommandPermitted({ kind: "remove", ...viewer }),
  false,
);
assert.equal(
  pointsCommandPermitted({ kind: "remove", ...moderator }),
  true,
);
assert.equal(
  senderMayRun({ minRole: "moderator", identityBadges: ["staff", "editor", "admin"], senderPlatformId: "22", broadcasterUserId: "7" }),
  false,
);
assert.equal(senderMayRun({ minRole: "og", identityBadges: ["vip"], senderPlatformId: "22", broadcasterUserId: "7" }), false);
assert.equal(senderMayRun({ minRole: "vip", identityBadges: ["og"], senderPlatformId: "22", broadcasterUserId: "7" }), true);

const defaults = catalogDefaultCommands("ar");
assert.equal(defaults.length, 10);
assert.deepEqual(
  defaults.map((command) => [command.trigger, command.minRole]),
  [
    ["!addcom", "moderator"],
    ["!commands", "everyone"],
    ["!delcom", "moderator"],
    ["!editcom", "moderator"],
    ["!followage", "everyone"],
    ["!level", "everyone"],
    ["!points", "everyone"],
    ["!points add", "broadcaster"],
    ["!promo", "moderator"],
    ["!shop", "everyone"],
  ],
);

assert.equal(renderChatAlert("hi $(name) $(amount)", { name: "Ali", amount: 12 }), "hi Ali 12");
assert.equal(renderChatAlert("x".repeat(500), {}).length, 480);
assert.equal(alertClearsMinimum("kicks", 0, 0), true);
assert.equal(alertClearsMinimum("kicks", 50, 100), false);
assert.equal(alertClearsMinimum("kicks", 100, 100), true);
assert.equal(alertClearsMinimum("raid", 3, 10), false);
assert.equal(alertClearsMinimum("raid", 10, 10), true);
assert.equal(alertClearsMinimum("follow", 0, 99), true);
assert.equal(catalogChatAlerts().length, 7);
assert.equal(catalogChatAlerts().every((alert) => alert.enabled === false), true);

console.log("command access and chat alert assertions passed");
