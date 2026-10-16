const pages = [
  ["commands", "https://www.cylixstudio.com/commands/creovixstudio"],
  ["home", "https://www.cylixstudio.com/"],
  ["login", "https://www.cylixstudio.com/login"],
  ["missing", "https://www.cylixstudio.com/commands/no-such-channel-wave-c"],
];

async function one(url) {
  const started = performance.now();
  const response = await fetch(url, { redirect: "follow", headers: { "accept-encoding": "identity" } });
  const ttfb = performance.now() - started;
  const bodyStarted = performance.now();
  const html = await response.text();
  const bodyMs = performance.now() - bodyStarted;
  return {
    status: response.status,
    ttfb: Math.round(ttfb * 10) / 10,
    bodyMs: Math.round(bodyMs * 10) / 10,
    bytes: html.length,
    cache: response.headers.get("cf-cache-status") || "",
    html,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

const samples = [];
for (let i = 0; i < 12; i += 1) samples.push(await one(pages[0][1]));
const home = await one(pages[1][1]);
const login = await one(pages[2][1]);
const missing = await one(pages[3][1]);
const html = samples[0].html;
const hrefs = [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((match) => match[1]);
let card = html.includes("--card-h:170px") || html.includes("--card-h: 170px");
let grid = html.includes("repeat(6");
for (const href of hrefs) {
  const cssUrl = new URL(href, pages[0][1]).toString();
  const css = await (await fetch(cssUrl)).text();
  if (css.includes("--card-h:170px") || css.includes("--card-h: 170px")) card = true;
  if (css.includes("repeat(6")) grid = true;
}
const names = [...html.matchAll(/_cardName_[^"]*"[^>]*>([^<]+)</g)].map((match) => match[1].trim()).filter(Boolean);
const privateHits = ["service_role", "access_token", "refresh_token", "eyJhb"].filter((needle) => html.includes(needle));
const ttfb = samples.map((row) => row.ttfb);
const kick = await fetch("https://www.cylixstudio.com/api/public/webhooks/kick", { method: "POST", body: "{}" });
console.log(JSON.stringify({
  commands: {
    codes: samples.map((row) => row.status),
    ttfb,
    median: median(ttfb),
    min: Math.min(...ttfb),
    max: Math.max(...ttfb),
    bodyMedian: median(samples.map((row) => row.bodyMs)),
    cache: samples.map((row) => row.cache),
    bytes: samples[0].bytes,
  },
  page: {
    card,
    grid,
    nameCount: names.length,
    hasShop: names.some((name) => name.toLowerCase().includes("shop")),
    privateHits,
    hasSearch: html.includes("search") || html.includes("بحث"),
  },
  home: { status: home.status, ttfb: home.ttfb },
  login: { status: login.status, ttfb: login.ttfb },
  missing: { status: missing.status, ttfb: missing.ttfb, showsMissing: missing.html.includes("missing") || missing.html.length > 1000 },
  kickWebhook: { status: kick.status },
}, null, 2));
