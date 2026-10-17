import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const main = path.resolve(process.argv[3] || ".");
const demo = path.resolve(process.argv[2] || "../CylixStudio-Demo");
const excluded = new Set(["node_modules", ".git", ".output", ".tanstack", ".wrangler", "dist", "tmp", "artifacts", ".tmp-ui", ".demo-data", ".vercel"]);
function inventory(root, relative = "") {
  const files = {};
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name === ".env" || (entry.name.startsWith(".env.") && entry.name !== ".env.example") || entry.name.endsWith(".log")) continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(files, inventory(root, name));
    else {
      const bytes = fs.readFileSync(path.join(root, name));
      const input = /\.(tsx?|jsx?|jsonc?|css|md|sql|mjs|txt|toml|yml|yaml)$/.test(name) ? bytes.toString("utf8").replace(/\r\n/g, "\n") : bytes;
      files[name] = createHash("sha256").update(input).digest("hex");
    }
  }
  return files;
}
const a = inventory(demo), b = inventory(main);
console.log(JSON.stringify({
  counts: [Object.keys(a).length, Object.keys(b).length],
  onlyDemo: Object.keys(a).filter(x => !b[x]),
  changed: Object.keys(a).filter(x => b[x] && a[x] !== b[x]),
  onlyMain: Object.keys(b).filter(x => !a[x]),
  same: Object.keys(a).filter(x => b[x] && a[x] === b[x]).length,
}, null, 2));
