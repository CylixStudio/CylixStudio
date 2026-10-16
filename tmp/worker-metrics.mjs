import fs from "node:fs";

const toml = fs.readFileSync("C:/Users/igopf/AppData/Roaming/xdg.config/.wrangler/config/default.toml", "utf8");
const match = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!match) {
  console.log(JSON.stringify({ ok: false, reason: "no-token" }));
  process.exit(0);
}
const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
const query = `query($account: String!, $since: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(
        limit: 100
        filter: { datetime_geq: $since, scriptName: "cylixstudio" }
      ) {
        dimensions { scriptVersion status }
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
      }
    }
  }
}`;
const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { authorization: `Bearer ${match[1]}`, "content-type": "application/json" },
  body: JSON.stringify({
    query,
    variables: { account: "717220aa88c94b3294d34c20d5659d2e", since },
  }),
});
const body = await response.json();
const errors = (body.errors || []).map((error) => error.message);
const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? null;
console.log(JSON.stringify({ status: response.status, errors, rows }, null, 2));
