// node --import ./scripts/command-match-loader.mjs ./scripts/assert-message-starts-with-trigger.mjs
import assert from "node:assert/strict";
import { messageStartsWithTrigger } from "../src/lib/messageStartsWithTrigger.ts";
import { matchCustomCommand } from "../src/lib/customCommands.ts";

const cases = [
  ["م يستاهل", "!م", false],
  ["م", "!م", false],
  ["!م", "!م", true],
  ["!م الان", "!م", true],
  ["مرحبا", "م", false],
  ["hello", "h", false],
  ["!m extra", "!m", true],
  ["!more", "!m", false],
  ["#name", "#name", true],
  ["#name extra", "#name", true],
  ["!name", "#name", false],
  ["name", "#name", false],
  ["name#", "#name", false],
  ["?question", "?question", true],
  ["?question extra", "?question", true],
  ["?Question", "?question", true],
  ["question?", "?question", false],
  ["!question", "?question", false],
  ["question", "?question", false],
  ["؟question", "?question", false],
  ["m extra", "m", true],
  ["!m", "m", false],
  ["#m", "m", false],
  ["?m", "m", false],
  ["more", "m", false],
  ["م يستاهل", "m", false],
  ["م يستاهل", "#m", false],
  ["م يستاهل", "?m", false],
  ["!m!", "!m", true],
  ["m!", "!m", false],
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
    platforms: ["KICK"],
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
assert.equal(matchCustomCommand("!م الان", [bang], "!", "KICK")?.name, "م");
assert.equal(matchCustomCommand("مرحبا", [command("م", "")], "!", "KICK"), null);
assert.equal(matchCustomCommand("م يستاهل", [command("م", "")], "!", "KICK")?.name, "م");
assert.equal(matchCustomCommand("!more", [command("m", "!")], "!", "KICK"), null);
assert.equal(matchCustomCommand("!m extra", [command("m", "!")], "!", "KICK")?.name, "m");
assert.equal(matchCustomCommand("!M extra", [command("m", "!")], "!", "KICK")?.name, "m");
assert.equal(matchCustomCommand("م يستاهل", [command("م", null)], "!", "KICK"), null);
assert.equal(matchCustomCommand("!م الان", [command("م", null)], "!", "KICK")?.name, "م");
assert.equal(messageStartsWithTrigger("!م.", "!م"), true);
assert.equal(messageStartsWithTrigger("م،", "م"), true);

const hash = command("name", "#");
assert.equal(matchCustomCommand("#name", [hash], "!", "KICK")?.name, "name");
assert.equal(matchCustomCommand("#name extra", [hash], "!", "KICK")?.name, "name");
assert.equal(matchCustomCommand("!name", [hash], "!", "KICK"), null);
assert.equal(matchCustomCommand("name", [hash], "!", "KICK"), null);
assert.equal(matchCustomCommand("name#", [hash], "!", "KICK"), null);

const question = command("question", "?");
assert.equal(matchCustomCommand("?question", [question], "!", "KICK")?.name, "question");
assert.equal(matchCustomCommand("?question extra", [question], "!", "KICK")?.name, "question");
assert.equal(matchCustomCommand("?Question", [question], "!", "KICK")?.name, "question");
assert.equal(matchCustomCommand("question?", [question], "!", "KICK"), null);
assert.equal(matchCustomCommand("!question", [question], "!", "KICK"), null);
assert.equal(matchCustomCommand("question", [question], "!", "KICK"), null);
assert.equal(matchCustomCommand("؟question", [question], "!", "KICK"), null);

const direct = command("m", "");
assert.equal(matchCustomCommand("m", [direct], "!", "KICK")?.name, "m");
assert.equal(matchCustomCommand("m extra", [direct], "!", "KICK")?.name, "m");
assert.equal(matchCustomCommand("M extra", [direct], "!", "KICK")?.name, "m");
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

console.log(`ok ${cases.length} trigger assertions`);
