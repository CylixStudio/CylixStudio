// node scripts/assert-public-commands-layout.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "src/routes/commands.page.module.css");
const routePath = join(root, "src/routes/commands.$slug.tsx");
const css = readFileSync(cssPath, "utf8");
const route = readFileSync(routePath, "utf8");

assert.match(route, /import pageStyles from "\.\/commands\.page\.module\.css"/);
assert.doesNotMatch(route, /custom-commands/);
assert.match(route, /if \(width >= 1024\) return 6;/);
assert.doesNotMatch(route, /return 5;/);

const wideBlocks = [...css.matchAll(/@media \(min-width: 1024px\) \{[\s\S]*?\n\}/g)].map((match) => match[0]);
const wideGrid = wideBlocks.find((block) => block.includes(".grid"));
assert.ok(wideGrid, "wide .grid rule is missing");
assert.match(wideGrid, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
assert.doesNotMatch(wideGrid, /repeat\(5/, "wide breakpoint regressed to 5 columns");
assert.doesNotMatch(css, /repeat\(5,/);
assert.match(css, /--card-h:\s*170px/);
assert.doesNotMatch(css, /--card-h:\s*120px/);
assert.match(css, /\.body a[\s\S]*color:\s*#8993a3/);
assert.match(css, /width:\s*min\(1548px,\s*94vw\)/);

const fixture = join(root, "tmp/commands-page/layout-fixture.html");
const cards = Array.from({ length: 18 }, (_, index) => `<li><article class="card"><p class="cardName">!item${index}</p><p class="body"><a href="https://example.com/${index}">https://example.com/${index}</a></p></article></li>`).join("");
writeFileSync(
  fixture,
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><ul class="grid" style="width:1400px">${cards}</ul></body></html>`,
);

const capture = join(root, "tmp/commands-page/capture.mjs");
const fileUrl = `file:///${fixture.replace(/\\/g, "/")}`;
const child = spawn(process.execPath, [capture, fileUrl, join(root, "tmp/commands-page/layout-measure.png"), "1650", "927"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
});
child.stderr.on("data", (chunk) => {
  output += chunk;
});
const code = await new Promise((resolve) => child.on("close", resolve));
assert.equal(code, 0, output);
const measured = JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1));
assert.equal(measured.columns, 6, output);
assert.ok(measured.cardH >= 165 && measured.cardH <= 175, output);
assert.equal(measured.link, "rgb(137, 147, 163)", output);

console.log("public commands layout assertions passed");
