import fs from "node:fs";

const text = fs.readFileSync(
  "C:/Users/igopf/.cursor/projects/e-Store-Cylix-CylixStudio/terminals/801657.txt",
  "utf8",
);
const parts = text.split("\n{").slice(1);
const rows = [];
for (const part of parts) {
  try {
    const obj = JSON.parse("{" + part);
    const url = new URL(obj.event?.request?.url ?? "https://invalid.local/");
    const path = url.pathname.replace(/\/overlay\/[^/]+/g, "/overlay/:token");
    rows.push({
      method: obj.event?.request?.method,
      path,
      cpu: obj.cpuTime,
      wall: obj.wallTime,
      outcome: obj.outcome,
    });
  } catch {
    /* partial object */
  }
}
console.log(JSON.stringify(rows, null, 2));
console.log("count", rows.length);
