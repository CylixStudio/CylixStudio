import fs from "node:fs";

const demo = fs.readFileSync("E:/Store/Cylix/CylixStudio-Demo/src/hooks/useWidgetStream.ts", "utf8");
const mainPath = "E:/Store/Cylix/CylixStudio/src/hooks/useWidgetStream.ts";
const main = fs.readFileSync(mainPath, "utf8");
const start = demo.indexOf("  const pullRef = useRef");
const end = demo.indexOf("  const shownFrame =");
if (start < 0 || end < 0) throw new Error("demo markers missing");
let effect = demo.slice(start, end).replace(
  "if (!publicToken || isDemoToken(publicToken)) return;",
  "if (!publicToken) return;",
);
const mainStart = main.indexOf("function previewFromAlert");
const mainEnd = main.indexOf("  const shownFrame =");
if (mainStart < 0 || mainEnd < 0) throw new Error("main markers missing");
fs.writeFileSync(mainPath, main.slice(0, mainStart) + effect + main.slice(mainEnd));
console.log("ported");
