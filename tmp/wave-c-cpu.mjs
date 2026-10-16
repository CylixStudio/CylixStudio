import fs from "node:fs";

const toml = fs.readFileSync("C:/Users/igopf/AppData/Roaming/xdg.config/.wrangler/config/default.toml", "utf8");
const match = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!match) {
  console.log(JSON.stringify({ ok: false, reason: "no-token" }));
  process.exit(0);
}
const token = match[1];
const account = "717220aa88c94b3294d34c20d5659d2e";
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

async function gql(query, variables) {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  return { status: response.status, errors: (body.errors || []).map((error) => error.message), data: body.data };
}

const since = "2026-10-16T20:17:00Z";
const byOutcome = await gql(
  `query($account: String!, $since: Time!) {
    viewer {
      accounts(filter: { accountTag: $account }) {
        workersInvocationsAdaptive(
          limit: 100
          filter: { datetime_geq: $since, scriptName: "cylixstudio", scriptVersion: "eefa6648-b3e4-45e3-afb4-c4a56970964e" }
        ) {
          dimensions { outcome status }
          sum { requests errors subrequests }
          quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 }
        }
      }
    }
  }`,
  { account, since },
);

const accountInfo = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}`, { headers });
const accountBody = await accountInfo.json();
const accountSafe = {
  status: accountInfo.status,
  success: accountBody.success,
  errors: (accountBody.errors || []).map((error) => error.message),
  name: accountBody.result?.name ?? null,
  type: accountBody.result?.type ?? null,
};

const settings = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/cylixstudio/settings`,
  { headers },
);
const settingsBody = await settings.json();
const settingsSafe = {
  status: settings.status,
  success: settingsBody.success,
  errors: (settingsBody.errors || []).map((error) => error.message),
  result: settingsBody.result
    ? {
        placement: settingsBody.result.placement ?? null,
        compatibility_date: settingsBody.result.compatibility_date ?? null,
        usage_model: settingsBody.result.usage_model ?? null,
        limits: settingsBody.result.limits ?? null,
      }
    : null,
};

const sub = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/subscriptions`, { headers });
const subBody = await sub.json();
const subscriptions = Array.isArray(subBody.result)
  ? subBody.result.map((row) => ({
      id: row.id,
      state: row.state,
      price: row.price,
      frequency: row.frequency,
      rate_plan: row.rate_plan ? { id: row.rate_plan.id, public_name: row.rate_plan.public_name, currency: row.rate_plan.currency } : null,
    }))
  : null;

console.log(
  JSON.stringify(
    {
      account: accountSafe,
      settings: settingsSafe,
      subscriptionsStatus: sub.status,
      subscriptionsErrors: (subBody.errors || []).map((error) => error.message),
      subscriptions,
      byOutcome,
    },
    null,
    2,
  ),
);
