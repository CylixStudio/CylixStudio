import fs from "node:fs";

const toml = fs.readFileSync("C:/Users/igopf/AppData/Roaming/xdg.config/.wrangler/config/default.toml", "utf8");
const token = toml.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const account = "717220aa88c94b3294d34c20d5659d2e";
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

const keysUrl = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/keys?dataset=cloudflare-workers`;
const keysResponse = await fetch(keysUrl, { headers });
const keysBody = await keysResponse.json();
const keys = Array.isArray(keysBody.result) ? keysBody.result.map((row) => row.key ?? row).slice(0, 80) : keysBody;

const from = Date.parse("2026-10-16T20:17:00Z");
const to = Date.parse("2026-10-16T20:30:00Z");
const queryBody = {
  queryId: "cylix-wave-c-paths",
  view: "calculations",
  timeframe: { from, to },
  parameters: {
    datasets: ["cloudflare-workers"],
    filters: [
      { key: "$metadata.service", operation: "eq", type: "string", value: "cylixstudio" },
    ],
    calculations: [
      { operator: "count", alias: "count" },
      { operator: "median", alias: "cpu", key: "$workers.cpuTimeMs", keyType: "number" },
      { operator: "p99", alias: "cpuP99", key: "$workers.cpuTimeMs", keyType: "number" },
      { operator: "max", alias: "cpuMax", key: "$workers.cpuTimeMs", keyType: "number" },
    ],
    groupBys: [{ type: "string", value: "$metadata.url" }],
    limit: 30,
  },
};
const queryResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`, {
  method: "POST",
  headers,
  body: JSON.stringify(queryBody),
});
const queryText = await queryResponse.text();
console.log(JSON.stringify({
  keysStatus: keysResponse.status,
  keysErrors: (keysBody.errors || []).map((error) => error.message),
  keySample: Array.isArray(keys) ? keys.slice(0, 40) : keys,
  queryStatus: queryResponse.status,
  queryBody: queryText.slice(0, 2500),
}, null, 2));
