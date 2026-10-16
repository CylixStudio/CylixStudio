import fs from "node:fs";

const toml = fs.readFileSync("C:/Users/igopf/AppData/Roaming/xdg.config/.wrangler/config/default.toml", "utf8");
const token = toml.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const account = "717220aa88c94b3294d34c20d5659d2e";
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

async function gql(query) {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  const body = await response.json();
  return { errors: (body.errors || []).map((error) => error.message), data: body.data };
}

const since = "2026-10-16T19:00:00Z";
const version = "eefa6648-b3e4-45e3-afb4-c4a56970964e";
const statusQuery = await gql(`query {
  viewer {
    accounts(filter: { accountTag: "${account}" }) {
      workersInvocationsAdaptive(
        limit: 100
        filter: { datetime_geq: "${since}", scriptName: "cylixstudio" }
      ) {
        dimensions { scriptVersion status }
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 }
      }
    }
  }
}`);

const minuteQuery = await gql(`query {
  viewer {
    accounts(filter: { accountTag: "${account}" }) {
      workersInvocationsAdaptive(
        limit: 200
        filter: { datetime_geq: "2026-10-16T20:10:00Z", scriptName: "cylixstudio", scriptVersion: "${version}" }
        orderBy: [datetimeMinute_ASC]
      ) {
        dimensions { datetimeMinute status }
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 }
      }
    }
  }
}`);

console.log(JSON.stringify({ statusQuery, minuteQuery }, null, 2));
