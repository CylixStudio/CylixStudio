// node --import ./scripts/command-match-loader.mjs ./scripts/assert-message-starts-with-trigger.mjs
import assert from "node:assert/strict";
import { messageStartsWithTrigger } from "../src/lib/messageStartsWithTrigger.ts";
import { matchCustomCommand } from "../src/lib/customCommands.ts";
import { matchDefaultCommand, mergeRuntimeDefaultCommands } from "../src/lib/defaultCommands.ts";
import { isPointsCommandAttempt, parsePointsCommand } from "../src/lib/pointsCommand.ts";
import { matchMarkCommand } from "../src/lib/markPoints.ts";
import { matchWheelCommand } from "../src/lib/wheelCommand.ts";
import { parseBuyArgument, parseShopDirectoryCommand } from "../src/lib/shopBuy.ts";
import { giveawayKeywordMatches } from "../src/lib/giveaway.server.ts";

const cases = [
  ["ح", "ح", true],
  ["ح كيف الحال", "ح", false],
  ["حب", "ح", false],
  ["ح", "حب", false],
  ["سلام", "سلام", true],
  ["سلام عليكم", "سلام", false],
  ["سلام عليكم", "سلام عليكم", true],
  ["سلام عليكم ورحمة", "سلام عليكم", false],
  ["!discord", "!discord", true],
  ["!Discord", "!discord", true],
  ["!discord test", "!discord", false],
  ["#shop", "#shop", true],
  ["#shop الآن", "#shop", false],
  ["test", "testing", false],
  ["testing", "test", false],
  ["مرحبا", "أهلاً مرحبا", false],
  ["أهلاً مرحبا", "مرحبا", false],
  ["pc", "pc", true],
  ["PC", "pc", true],
  ["pc setup", "pc", false],
  ["م يستاهل", "!م", false],
  ["م", "!م", false],
  ["!م", "!م", true],
  ["!م الان", "!م", false],
  ["مرحبا", "م", false],
  ["hello", "h", false],
  ["!m extra", "!m", false],
  ["!M", "!m", true],
  ["!more", "!m", false],
  ["#name", "#name", true],
  ["#name extra", "#name", false],
  ["!name", "#name", false],
  ["name", "#name", false],
  ["name#", "#name", false],
  ["?question", "?question", true],
  ["?question extra", "?question", false],
  ["?Question", "?question", true],
  ["question?", "?question", false],
  ["!question", "?question", false],
  ["question", "?question", false],
  ["؟question", "?question", false],
  ["m", "m", true],
  ["m extra", "m", false],
  ["!m", "m", false],
  ["#m", "m", false],
  ["?m", "m", false],
  ["more", "m", false],
  ["shopping", "shop", false],
  ["shop", "shopping", false],
  ["!point", "!points", false],
  ["!points", "!point", false],
  ["!marks", "!mark", false],
  ["!mark", "!marks", false],
  ["م يستاهل", "m", false],
  ["م يستاهل", "#m", false],
  ["م يستاهل", "?m", false],
  ["!m!", "!m", false],
  ["m!", "!m", false],
  ["!م.", "!م", false],
  ["م،", "م", false],
];

for (const [message, trigger, expected] of cases) {
  assert.equal(
    messageStartsWithTrigger(message, trigger),
    expected,
    `${JSON.stringify(message)} vs ${JSON.stringify(trigger)}`,
  );
}

function command(name, prefix) {
  return {
    id: "1",
    name,
    prefix,
    response: "ok",
    enabled: true,
    platforms: ["KICK", "TWITCH"],
    roles: ["Everyone"],
    cooldownSeconds: 0,
    createdAt: "",
    updatedAt: "",
  };
}

const bang = command("م", "!");
assert.equal(matchCustomCommand("م يستاهل", [bang], "!", "KICK"), null);
assert.equal(matchCustomCommand("م", [bang], "!", "KICK"), null);
assert.equal(matchCustomCommand("!م", [bang], "!", "KICK")?.name, "م");
assert.equal(matchCustomCommand("!م الان", [bang], "!", "KICK"), null);
assert.equal(matchCustomCommand("مرحبا", [command("م", "")], "!", "KICK"), null);
assert.equal(matchCustomCommand("م", [command("م", "")], "!", "KICK")?.name, "م");
assert.equal(matchCustomCommand("م يستاهل", [command("م", "")], "!", "KICK"), null);
assert.equal(matchCustomCommand("!more", [command("m", "!")], "!", "KICK"), null);
assert.equal(matchCustomCommand("!m extra", [command("m", "!")], "!", "KICK"), null);
assert.equal(matchCustomCommand("!m", [command("m", "!")], "!", "KICK")?.name, "m");
assert.equal(matchCustomCommand("!M", [command("m", "!")], "!", "KICK")?.name, "m");
assert.equal(matchCustomCommand("م يستاهل", [command("م", null)], "!", "KICK"), null);
assert.equal(matchCustomCommand("!م الان", [command("م", null)], "!", "KICK"), null);
assert.equal(matchCustomCommand("!م", [command("م", null)], "!", "KICK")?.name, "م");

const table = [
  ["ح", "", "ح", "ح", true],
  ["ح", "", "ح كيف الحال", null, false],
  ["سلام", "", "سلام", "سلام", true],
  ["سلام", "", "سلام عليكم", null, false],
  ["discord", "!", "!discord", "discord", true],
  ["discord", "!", "!discord test", null, false],
  ["shop", "#", "#shop", "shop", true],
  ["shop", "#", "#shop الآن", null, false],
  ["test", "", "testing", null, false],
  ["مرحبا", "", "أهلاً مرحبا", null, false],
  ["pc", "", "pc", "pc", true],
  ["pc", "", "pc setup", null, false],
];
for (const [name, prefix, message, expectedName] of table) {
  const matched = matchCustomCommand(message, [command(name, prefix)], "!", "KICK");
  assert.equal(matched?.name ?? null, expectedName, message);
  assert.equal(matchCustomCommand(message, [command(name, prefix)], "!", "TWITCH")?.name ?? null, expectedName);
}

const hash = command("name", "#");
assert.equal(matchCustomCommand("#name", [hash], "!", "KICK")?.name, "name");
assert.equal(matchCustomCommand("#name extra", [hash], "!", "KICK"), null);
assert.equal(matchCustomCommand("!name", [hash], "!", "KICK"), null);
assert.equal(matchCustomCommand("name", [hash], "!", "KICK"), null);
assert.equal(matchCustomCommand("name#", [hash], "!", "KICK"), null);

const question = command("question", "?");
assert.equal(matchCustomCommand("?question", [question], "!", "KICK")?.name, "question");
assert.equal(matchCustomCommand("?question extra", [question], "!", "KICK"), null);
assert.equal(matchCustomCommand("?Question", [question], "!", "KICK")?.name, "question");
assert.equal(matchCustomCommand("question?", [question], "!", "KICK"), null);
assert.equal(matchCustomCommand("!question", [question], "!", "KICK"), null);
assert.equal(matchCustomCommand("question", [question], "!", "KICK"), null);
assert.equal(matchCustomCommand("؟question", [question], "!", "KICK"), null);

const direct = command("m", "");
assert.equal(matchCustomCommand("m", [direct], "!", "KICK")?.name, "m");
assert.equal(matchCustomCommand("m extra", [direct], "!", "KICK"), null);
assert.equal(matchCustomCommand("M extra", [direct], "!", "KICK"), null);
assert.equal(matchCustomCommand("!m", [direct], "!", "KICK"), null);
assert.equal(matchCustomCommand("#m", [direct], "!", "KICK"), null);
assert.equal(matchCustomCommand("?m", [direct], "!", "KICK"), null);
assert.equal(matchCustomCommand("more", [direct], "!", "KICK"), null);
assert.equal(matchCustomCommand("م يستاهل", [direct], "!", "KICK"), null);
assert.equal(matchCustomCommand("م يستاهل", [command("m", "!")], "!", "KICK"), null);
assert.equal(matchCustomCommand("م يستاهل", [command("m", "#")], "!", "KICK"), null);
assert.equal(matchCustomCommand("م يستاهل", [command("m", "?")], "!", "KICK"), null);
assert.equal(matchCustomCommand("m!", [command("m", "!")], "!", "KICK"), null);
assert.equal(matchCustomCommand("#name", [command("name", null)], "#", "KICK")?.name, "name");
assert.equal(matchCustomCommand("?question", [command("question", null)], "?", "KICK")?.name, "question");
assert.equal(matchCustomCommand("!question", [command("question", null)], "?", "KICK"), null);

const overlap = [command("ح", ""), command("حب", "")];
assert.equal(matchCustomCommand("ح", overlap, "!", "KICK")?.name, "ح");
assert.equal(matchCustomCommand("حب", overlap, "!", "KICK")?.name, "حب");
assert.equal(matchCustomCommand("ح كيف الحال", overlap, "!", "KICK"), null);

const runtime = mergeRuntimeDefaultCommands([], "en");
assert.equal(matchDefaultCommand("!followage", runtime, "KICK")?.command.id, "followage");
assert.equal(matchDefaultCommand("!followage extra", runtime, "KICK"), null);
assert.equal(matchDefaultCommand("!lurk", runtime, "KICK")?.command.id, "lurk");
assert.equal(matchDefaultCommand("!lurk now", runtime, "KICK"), null);
assert.equal(matchDefaultCommand("!welcome", runtime, "KICK")?.command.id, "welcome");
assert.equal(matchDefaultCommand("!welcome friend", runtime, "KICK"), null);
assert.equal(matchDefaultCommand("!commands", runtime, "KICK")?.command.id, "commands");
assert.equal(matchDefaultCommand("commands", runtime, "KICK")?.command.id, "commands");
assert.equal(matchDefaultCommand("الأوامر", runtime, "KICK")?.command.id, "commands");
assert.equal(matchDefaultCommand("!commands extra", runtime, "KICK"), null);
assert.equal(matchDefaultCommand("!so", runtime, "KICK")?.command.id, "so");
assert.equal(matchDefaultCommand("!so", runtime, "KICK")?.argument, "");
assert.equal(matchDefaultCommand("!so streamer", runtime, "KICK")?.argument, "streamer");
assert.equal(matchDefaultCommand("!so streamer extra", runtime, "KICK"), null);
assert.equal(matchDefaultCommand("!SO Streamer", runtime, "TWITCH")?.command.id, "so");

assert.deepEqual(parsePointsCommand("!points"), { kind: "balance" });
assert.deepEqual(parsePointsCommand("!points add @user 5"), { kind: "add", target: "user", amount: 5 });
assert.deepEqual(parsePointsCommand("!points remove all 3"), { kind: "remove", target: "all", amount: 3 });
assert.equal(parsePointsCommand("!points add"), null);
assert.equal(parsePointsCommand("!points add @user"), null);
assert.equal(parsePointsCommand("!points add @user 5 extra"), null);
assert.equal(isPointsCommandAttempt("!points add"), true);
assert.equal(isPointsCommandAttempt("!points"), true);
assert.equal(isPointsCommandAttempt("!point"), false);
assert.equal(isPointsCommandAttempt("!points!"), false);
assert.equal(parsePointsCommand("!point"), null);

assert.equal(matchMarkCommand("!mark")?.kind, "mark");
assert.equal(matchMarkCommand("!mark hello there")?.note, "hello there");
assert.equal(matchMarkCommand("/emark note")?.kind, "emark");
assert.equal(matchMarkCommand("!marks"), null);
assert.equal(matchMarkCommand("!markextra"), null);

assert.equal(matchWheelCommand("wheel"), true);
assert.equal(matchWheelCommand("!spin"), true);
assert.equal(matchWheelCommand("wheel now"), false);
assert.equal(parseShopDirectoryCommand("!shop"), true);
assert.equal(parseShopDirectoryCommand("shop"), true);
assert.equal(parseShopDirectoryCommand("متجر"), true);
assert.equal(parseShopDirectoryCommand("!shop extra"), false);
assert.equal(parseBuyArgument("!buy item name"), "item name");
assert.equal(parseBuyArgument("!buy"), "");
assert.equal(parseBuyArgument("!buy!"), null);
assert.equal(giveawayKeywordMatches("+1", "+1"), true);
assert.equal(giveawayKeywordMatches("I want +1", "+1"), false);

console.log(`ok ${cases.length} trigger assertions`);
