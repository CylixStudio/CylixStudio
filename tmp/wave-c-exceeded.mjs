import fs from "node:fs";

const toml = fs.readFileSync("C:/Users/igopf/AppData/Roaming/xdg.config/.wrangler/config/default.toml", "utf8");
const token = toml.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const account = "717220aa88c94b3294d34c20d5659d2e";
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

const query = `query {
  viewer {
    accounts(filter: { accountTag: "${account}" }) {
      workersInvocationsAdaptive(
        limit: 20
        filter: { datetime_geq: "2026-10-16T19:00:00Z", scriptName: "cylixstudio" }
      ) {
        sum {
          requests
          errors
          subrequests
          exceededResources
          clientDisconnects
        }
      }
    }
  }
}`;
const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { ...headers },
  body: JSON.stringify({ query }),
});
const body = await response.json();
const settings = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/account-settings`, { headers });
const settingsBody = await settings.json();
console.log(JSON.stringify({
  graphqlErrors: (body.errors || []).map((error) => error.message),
  sum: body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? null,
  accountSettingsStatus: settings.status,
  accountSettingsErrors: (settingsBody.errors || []).map((error) => error.message),
  accountSettings: settingsBody.result ?? null,
}, null, 2));
