# CylixStudio production log audit

Audit time: 2026-10-14T10:02:18Z (13:02 UTC+3). Production was not changed: no deploy, DNS edit, Worker config edit, WAF change, IP block, alert, Logpush job, or cron.

Account: Creovix0@gmail.com's Account (`717220aa88c94b3294d34c20d5659d2e`). Zone `cylixstudio.com` (`d8a11e3d76e35dbf298e9d585decb172`), plan **Free Website**, status active, security level **medium**. Worker `cylixstudio`, usage model `standard`, compatibility date `2026-10-12`. Custom domains: `cylixstudio.com` and `www.cylixstudio.com` (both production). No zone Worker routes. `workers.dev` subdomain enabled, previews enabled. Latest deployment seen: 2026-10-14T06:09:04Z via Wrangler. Cron schedules: none. Logpush jobs: 0 account, 0 zone.

Wrangler 4.149.0 is logged in as the same account (OAuth). Cloudflare MCP `plugin-cloudflare-cloudflare` was used (`whoami`, `search`, `docs`, `execute`).

## Sources and windows

All times below are UTC unless noted.

| Source | Window | Completeness |
| --- | --- | --- |
| GraphQL `httpRequests1dGroups` | `date` 2026-01-01 through 2026-10-14. Queried 2026-10-14T10:00:06Z. A probe from 2025-10-01 was rejected: this dataset cannot span more than 52 weeks, 1 day, 1 hour. | Unsampled daily zone totals. Only three days returned rows: 2026-10-12, 2026-10-13, and 2026-10-14 (partial, through the query). 2026-10-14 is not a full day. |
| GraphQL `httpRequestsAdaptiveGroups` | Status/host/cache/security: 2026-09-15T00:00:00Z–2026-10-14T10:00:06Z. Paths, webhooks, rare statuses: 2026-10-12T00:00:00Z–2026-10-14T10:02:18Z. | Sampled estimates. `count` is the extrapolated count; `sampleInterval` near 1 is close to a full count. High intervals (for example ~70 on `/.env.save`) are rough. Free-plan documented max query window for this dataset is 30 days; retention is 31 days. This is the path source. It is not the authoritative total. |
| GraphQL `workersInvocationsAdaptive` | 2026-09-15T00:00:00Z–2026-10-14T10:00:06Z, script `cylixstudio`. Per-day split uses 2026-10-12T00:00:00Z–2026-10-14T10:02:18Z. | Unsampled Worker invocation totals (requests that reached the Worker). Edge blocks are not included. |
| Workers Observability usage | 2026-10-12T00:00:00Z–2026-10-14T10:01:07Z | Stored telemetry events after head sampling. Not a request count. |
| Workers Observability telemetry query | Same start through 2026-10-14T10:02:12Z. `dry: true`. No saved queries were created (query list remained empty). | Head sample rate **0.1** for logs and traces (`redact_query_string: true`). Aggregates whose `sampleInterval` is 10 are about a 10× extrapolation of stored samples. Free-plan Workers Logs retention is **3 days** and 200,000 log events/day ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)). Traces retention documented as 7 days. |
| Workers Issues API | Active issues for service `cylixstudio` | Platform-detected issues. Counts are the issue service’s occurrence counts, not HTTP totals. |
| `firewallEventsAdaptiveGroups` | Attempted for 2026-10-12 onward | **Unavailable.** GraphQL returned: zone does not have access to the path. Security action on `httpRequestsAdaptiveGroups` was available and is used instead. |
| Account subscriptions API | Attempted | **Unavailable.** HTTP authentication error 10000. Workers Free vs Paid was inferred from the 10 ms CPU ceiling, not from billing. |
| Supabase logs | Not queried | **Unavailable.** Supabase CLI is not logged in (`AccessTokenRequiredError`). No project logs were read. |

Authoritative HTTP totals are the unsampled daily status map. Path rows are adaptive estimates and will not add up to those totals.

## Totals (unsampled daily status map)

Window with traffic: **2026-10-12 00:00:00Z through 2026-10-14T10:00:06Z** (14 Oct is partial).

**Total requests: 34,566.**

| Day | Requests | Cached | Threats (zone field) | Page views | Uniques (sum of daily uniques, not distinct across days) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-10-12 | 746 | 82 | 2 | 66 | 90 |
| 2026-10-13 | 28,796 | 2,621 | 18 | 259 | 168 |
| 2026-10-14 (partial) | 5,024 | 336 | 11 | 120 | 89 |
| Sum | 34,566 | 3,039 | 31 | 445 | 347 |

Bytes: 258,451,944. Encrypted requests were requested; the summed field is included in the raw daily query and was not the focus of the error audit.

### Status counts (unsampled)

| Status | Count |
| ---: | ---: |
| 200 | 28,045 |
| 204 | 323 |
| 302 | 26 |
| 304 | 1,541 |
| 307 | 3 |
| 308 | 710 |
| 400 | 17 |
| 401 | 159 |
| 403 | 36 |
| 404 | 3,002 |
| 405 | 1 |
| 406 | 22 |
| 499 | 65 |
| 503 | 612 |
| 522 | 3 |
| 530 | 1 |

No rows for 408, 409, 422, 429, 500, 502, 504, or 524.

- **4xx (400–499, including 499): 3,302**
- **5xx (500–599): 616** (503 + 522 + 530)
- 5xx share of requests: 1.78%

Per day, 5xx was 3 on 12 Oct (all 522), 525 on 13 Oct (524×503 + 1×530), and 88 on 14 Oct (all 503, all inside the 00:00Z hour in the adaptive breakdown).

## Where traffic went

Adaptive host × status (estimates, 15 Sep–14 Oct query; traffic only exists on the three days above):

- `www.cylixstudio.com` carries the app: about 27,223 HTTP 200, 1,452 HTTP 304, 625 HTTP 503, 467 HTTP 404, 268 HTTP 204, 156 HTTP 401.
- `cylixstudio.com` apex is mostly scanners and redirects: about 2,005 HTTP 404, 963 HTTP 200, 103 HTTP 304, 87 HTTP 308, 23 HTTP 403.
- Hosts with an explicit port (`:80`, `:443`, `:8080`, `:8443`, `:8880`) are scanner-style requests. They mostly 404 or 308. They are not a second site.

Adaptive `requestSource`: eyeball 34,871; `edgeWorkerFetch` 182. Those subrequests match in-repo calls to YouTube Data API (`www.googleapis.com`, paths `/youtube/v3/videos`, `/channels`, `/search`, HTTP 200) and the Saudi Business Center seal (`eauthenticate.saudibusiness.gov.sa` `/EAuthSealApi/seal`, HTTP 200, about 30). They are Worker outbound calls, not visitors opening those hosts on this zone.

Adaptive cache status: none 30,798; hit 3,070; miss 848; dynamic 331; bypass 3; revalidated 2; expired 1. Almost all dynamic API and webhook traffic is uncached. Daily cached requests (3,039) match the adaptive hit count closely.

Security action on adaptive data: almost every request is `securityAction=unknown`. Proven edge blocks: **24** `block` / `firewallManaged` (HTTP 403) and **1** `block` / `bic` (HTTP 403). Managed rulesets present: Cloudflare Managed Free Ruleset, Normalization, DDoS L7. No custom ruleset was listed. Nine of the managed blocks were `POST /` on the apex.

## Top 10 error paths

Adaptive estimates, 2026-10-12T00:00:00Z–2026-10-14T10:02:18Z. Prefer the unsampled status totals above when they disagree.

| Rank | Method | Host | Path | Status | Est. count | Notes |
| ---: | --- | --- | --- | ---: | ---: | --- |
| 1 | POST | www | `/api/public/webhooks/kick` | 503 | 625 | `sampleInterval` ~1.03. Matches Worker CPU failures. |
| 2 | GET | apex | `/.env.save` | 404 | 212 | `sampleInterval` ~70.7. Low confidence. App 404, not an edge block. |
| 3 | POST | www | `/_serverFn/fc557deb…` | 401 | 134 | TanStack server function. App 401. |
| 4 | GET | apex | `/.git/config` | 404 | 36 | App 404. |
| 5 | GET | apex | `/` | 404 | 30 | Plus a separate group of 19 with origin status 404. |
| 6 | GET | apex | `/.env.bak` | 404 | 25 | App 404. |
| 7 | GET | apex | `/.env` | 404 | 23 | App 404. |
| 8 | GET | apex | `/wp-admin/install.php` | 404 | 22 | App 404. |
| 9 | GET | apex | `/config/.env` (tied with `/2024/.env`, `/wp/.env`, `/customers/.env`) | 404 | 19 each | App 404. |
| 10 | POST | www | `/api/live-counter/lookup` | 400 | 16 | Unsampled 400s are 17. |

Other proven non-404 errors:

- `POST /api/public/webhooks/kick` also returned 200 × 6,847 (`sampleInterval` ~1.01), 499 × 8, 404 × 2.
- `POST /api/public/webhooks/twitch` 503 × 1 at 2026-10-13T17:00:00Z.
- `POST /api/public/webhooks/streamelements` 401 × 1.
- `GET /api/auth/kick/callback` 530 × 1.
- `GET /` on the apex 522 × 3.
- `GET` one server function 405 × 1.
- Several `POST /graphql`, `/api/graphql`, `/api/gql`, `/v2/_catalog` returned 406 (sum lines up with unsampled 406 = 22).

## Worker runtime

Unsampled invocations for `cylixstudio`:

| Status | Requests | Errors field | Subrequests | Client disconnects |
| --- | ---: | ---: | ---: | ---: |
| success | 29,145 | 0 | 120,345 | 0 |
| clientDisconnected | 310 | 0 | 1,112 | 310 |
| exceededResources | 620 | 620 | 4,312 | 0 |

No `scriptThrewException` or `internalError` row. **0 invocation-level unhandled exceptions** in this dataset.

`exceededResources` by day: 0 on 12 Oct, **514 on 13 Oct**, **106 on 14 Oct** (partial). CPU quantiles on those rows sit on the Workers Free ceiling: p50 **10,000 µs (10 ms)**, p99 about 10–16 ms. Success-path CPU p50 is 3,358 µs (3.4 ms) and p99 is 54,574 µs (54.6 ms). Cloudflare documents a 10 ms CPU limit on Workers Free, with occasional rollover above it ([limits](https://developers.cloudflare.com/workers/platform/limits/)).

Success-path request duration p50 **732 ms**, p99 **2.06 s**. Wall time p50 **756 ms**, p99 **2.12 s**. Duration (GB-s quantile) p50 0.095, p99 0.265. Memory p50 **22.2 MB**, p99 **55.3 MB** (limit 128 MB).

Per-day Worker requests (all statuses): 12 Oct 228, 13 Oct 25,191, 14 Oct (partial) 4,670. Free daily request cap is 100,000. 13 Oct is about 25% of that cap. The cap was not hit (no 1027 in the status map).

Subrequests on 13 Oct were about 113,900 across ~25,200 invocations (about 4–5 each). Free limit is 50 external subrequests per invocation. The average does not prove any single request hit 50. The platform log text for the error group is **“Worker exceeded CPU time limit.”** (extrapolated log count 900 at `sampleInterval` 10). The unsampled invocation count **620** is the number to use.

503 hours (adaptive, path `/api/public/webhooks/kick` on www except the one Twitch row):

| Hour (UTC) | Est. count |
| --- | ---: |
| 2026-10-13T17:00:00Z | 1 (Twitch webhook) |
| 2026-10-13T19:00:00Z | 6 |
| 2026-10-13T20:00:00Z | 431 |
| 2026-10-13T23:00:00Z | 92 |
| 2026-10-14T00:00:00Z | 96 |

No later 503 hour appeared. Sampled error logs continue until about 2026-10-14T00:47:07Z. The 06:09Z deploy is after the burst ended, so it is not proven to be the fix. A new Kick burst can hit the same 10 ms limit.

## Logs (sampled)

Stored observability events (usage API, not extrapolated):

| UTC day | `cloudflare-workers` | `otel` | `real-time-issues` |
| --- | ---: | ---: | ---: |
| 2026-10-12 | 219 | 213 | 107 |
| 2026-10-13 | 4,915 | 15,723 | 338 |
| 2026-10-14 (partial) | 1,269 | 1,782 | 0 |

Usage `events` total returned: **24,566**.

Query-level log aggregates for `cylixstudio` (extrapolated): info 48,642 (`sampleInterval` ~2.3), error 1,987 (`sampleInterval` ~2.6), warn 1,760 (`sampleInterval` 10). Do not treat these as request counts. Head sampling decides before the outcome is known, so errors are not over-sampled.

Error messages that were safe to group (no URLs with query strings were stored in the written record):

| Message | Extrapolated count | sampleInterval |
| --- | ---: | ---: |
| Worker exceeded CPU time limit. | 900 | 10 |
| POST https://www.cylixstudio.com/api/public/webhooks/kick | 440 | 10 |
| Secret-file scan pattern, no matching outbound fetch | 325 | 1 |
| exception | 119 | ~1.08 |
| cylixstudio POST 503 | 69 | ~1.15 |
| WordPress scan pattern, no outbound fetch | 62 | 1 |
| Known-scanner-path pattern, no outbound fetch | 33 | 1 |
| Source-control scan pattern, no outbound fetch | 20 | 1 |
| Debug-endpoint scan pattern, no outbound fetch | 4 | 1 |
| Network connection lost. | 2 | 1 |

The “exception” aggregate was **not** confirmed as `scriptThrewException` (that invocation status is 0). It was not opened as raw events, because OAuth logs in this codebase include `request.url`, which can carry `code` and `state`.

Warn messages:

| Message | Extrapolated count | sampleInterval |
| --- | ---: | ---: |
| `[kick-webhook] chat ignored — no Kick connection` | 1,720 | 10 |
| `[chat-bot] kick bot send failed 403` with Kick body `{"data":{},"message":"Forbidden"}` | 40 | 10 |

OAuth log lines (each `sampleInterval` 10, so this is consistent with about one stored sample each): `[oauth:kick] start`, cookie set for Kick state and verifier, `[oauth:kick] callback fail`, `[oauth:streamlabs] start`, cookie set for Streamlabs state. Needle `invalid state`: no rows. Needle `DEPLOYMENT_NOT_FOUND`: no rows. Needle `twitch` did not surface an OAuth failure string (one unrelated `POST 503` row matched).

Individual OAuth event bodies were **not** downloaded.

Issues API (active): vulnerability-scan groupings for secret-files (326), wordpress (66), known-scanner-path (33), source-control (21), debug-endpoints (4), all titled low risk, plus one exception “Network connection lost.” (count 1). First/last observation times are in `security-incidents.md`. The scan issues say no matching outbound fetch was observed.

## Source follow-up (2026-10-14, not deployed)

Local measurements, not production CPU timers:

| Stage | Result |
| --- | --- |
| RSA verify, before key cache, 40 calls | 15 ms CPU total, 0.375 ms/call (`process.cpuUsage`) |
| RSA verify after key cache, 200 calls | Under 1 ms CPU total (timer resolution) |
| `JSON.stringify` of a 20 KB body, 200 times | Under 1 ms CPU |
| Import default commands + custom commands + media ingest + platform ingest | 62 ms CPU, 760 ms wall, once, unbundled Node |
| Import parse + signature modules | 15 ms CPU, 41 ms wall, once, unbundled Node |

The 62 ms import is what every cold isolate paid when every chat line awaited those handlers. Ordinary sentences now skip them. Command lines, `!`/`#` commands, single-token suffix commands, shop/wheel/mark words, and media links still run the handlers. Signature verification is unchanged. Duplicate Kick event ids are ignored for the life of the isolate (cap 2,000), after the handler finishes. A missing Kick connection stays HTTP 200 with outcome `intentionally_ignored`. A failed connection query returns HTTP 503 so Kick can retry the read. Chat send uses the user token first.

`waitUntil` still counts toward the Free 10 ms CPU limit. It was not treated as a way around that limit. No queue was added.

## What this audit could not see

- Supabase Auth, Postgres, and API logs.
- Raw firewall event rows (`firewallEventsAdaptive`).
- Billing subscription confirmation.
- Full OAuth failure reasons (withheld so `code` / `state` / cookies are not copied).
- Any request outside 2026-10-12 through the query time. Earlier history in the daily dataset is empty, not missing pages.
- Unsampled path totals. Scanner path counts with a large `sampleInterval` are estimates.
- Whether HTTP 200 Kick webhooks updated chat, timers, or alerts. The app logs “chat ignored” on many of those 200s.
