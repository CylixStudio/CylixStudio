import { readFileSync } from "node:fs";

const html = readFileSync(`${process.env.TEMP}/cylix-commands.html`, "utf8");
const names = [...html.matchAll(/_cardName_[^"]*"[^>]*>([^<]*)</g)].map((match) => match[1].trim()).filter(Boolean);
console.log(JSON.stringify({ cardCount: names.length, cardNames: names, demo: html.includes("!demo") }));
