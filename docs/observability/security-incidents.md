# Security incidents

Window: 2026-10-12T00:00:00Z through 2026-10-14T10:02:18Z (UTC). Partial day on 14 Oct. Sources and sampling rules are in `production-log-audit.md`.

No proven successful compromise. No proven credential theft, auth bypass, or data exfiltration. Scanner paths returned application 404s or edge 403s. Issue records explicitly say no matching outbound fetch was observed for the scan patterns.

IP addresses are not listed. A user-agent or a single IP was not treated as proof of an attacker.

## Confirmed

### CS-2026-001

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-001 |
| Timestamp | First adaptive 503 hour 2026-10-13T19:00:00Z; peak 2026-10-13T20:00:00Z (431); last 503 hour 2026-10-14T00:00:00Z (96). Sampled error logs last seen 2026-10-14T00:47:07Z. |
| Category | Availability / webhook handling |
| Severity | HIGH |
| Affected Endpoint | `POST https://www.cylixstudio.com/api/public/webhooks/kick` |
| Evidence | Unsampled HTTP 503 = 612 (524 on 13 Oct, 88 on 14 Oct). Adaptive path count 625 on that URL (`sampleInterval` ~1.03) plus 1 Twitch 503. Worker `exceededResources` = 620 (514 on 13 Oct, 106 on 14 Oct), CPU p50 10 ms. Log message “Worker exceeded CPU time limit.” |
| Occurrence Count | 620 Worker resource failures; 612 HTTP 503 |
| Root Cause | The handler awaited default-command, custom-command, and media modules on every chat line, including ordinary text. Local Node spent 62 ms CPU importing those four modules once. RSA verify was 0.375 ms/call, and stringifying a 20 KB body 200 times was under 1 ms, so logging and crypto were not the 10 ms cap. Production failures sit at exactly 10 ms CPU, which is the Workers Free limit. `waitUntil` still counts toward that limit and was not used as the fix. |
| Recommended Action | Source change skips command and media imports unless the line is command-like or contains a media URL. Signature verification stays. Not deployed. |
| Status | Open |

HTTP 200 on this path (adaptive 6,847) is not success of chat or alerts. See CS-2026-002.

### CS-2026-002

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-002 |
| Timestamp | Sampled warns cluster from about 2026-10-13T23:37Z through 2026-10-14T01:49Z (warn series). Exact first event was not pulled. |
| Category | Bot / webhook handling |
| Severity | MEDIUM |
| Affected Endpoint | `POST /api/public/webhooks/kick` |
| Evidence | Warn `[kick-webhook] chat ignored — no Kick connection`. Extrapolated count 1,720 at `sampleInterval` 10 (about 172 stored lines). Code path logs this when a chat message has no Kick connection. These responses can still be HTTP 200. |
| Occurrence Count | ~1,720 estimated log lines (10% head sample) |
| Root Cause | Proven in code: the warning is only the `platform_connections` lookup for `broadcaster.user_id` with `is_active = true`. It does not check token expiry, OAuth scopes, or in-memory chat state. A database error used to take the same branch and return HTTP 200. Whether the logged ids belong to a channel that should be connected was not proven; Supabase logs were unavailable. |
| Recommended Action | Source now logs `intentionally_ignored` for a missing row and returns HTTP 503 only when the query itself errors, so Kick can retry a failed read. Not deployed. |
| Status | Investigating |

### CS-2026-003

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-003 |
| Timestamp | Inside the same warn window as CS-2026-002. Per-event time not stored here. |
| Category | External bot API rejection |
| Severity | LOW |
| Affected Endpoint | Kick chat send from the Worker (not an edge block) |
| Evidence | Warn `[chat-bot] kick bot send failed 403` with body message `Forbidden`. Extrapolated count 40 at `sampleInterval` 10 (about 4 stored lines). |
| Occurrence Count | ~4 stored samples, ~40 extrapolated |
| Root Cause | Proven: `sendKickChatMessage` posted `type: "bot"` first, with no `broadcaster_user_id`. Kick’s chat API sends bot messages as the channel attached to the token and ignores `broadcaster_user_id`. This app stores the channel user’s OAuth token (`chat:write` is already requested). A user token is not a bot identity, so bot mode returns 403. The warn aggregate did not include `kick user send failed`, so the user fallback may have succeeded. Scopes were not changed. |
| Recommended Action | Source sends `type: "user"` plus `broadcaster_user_id` first, then bot. Error bodies are logged as the Kick `message` field with token-like text redacted. Not deployed. |
| Status | Resolved |

### CS-2026-004

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-004 |
| Timestamp | Not pinned to a minute. The HTTP row is inside 2026-10-12T00:00:00Z–2026-10-14T10:02:18Z. |
| Category | OAuth |
| Severity | MEDIUM |
| Affected Endpoint | `GET /api/auth/kick/callback` on `www.cylixstudio.com` |
| Evidence | Adaptive HTTP 530 × 1. Sampled log `[oauth:kick] callback fail` × 1 stored sample (extrapolated 10). No `DEPLOYMENT_NOT_FOUND`. No log row whose message was `invalid state`. Raw callback events were not downloaded because the handler logs `request.url`, which can contain `code` and `state`. |
| Occurrence Count | 1 HTTP 530; 1 sampled callback-fail log |
| Root Cause | Not proven that the 530 and the log line are the same request. 530 is an edge/origin connection failure, not a proven state-mismatch. |
| Recommended Action | On the next failure, log only the stable `reason` string (`missing_code`, `state_mismatch`, and the other codes already in `oauthHandlers.server.ts`). Do not log the request URL. |
| Status | Investigating |

### CS-2026-005

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-005 |
| Timestamp | Secret-file and source-control issues first observed 2026-10-12T16:26:33Z. WordPress issue first observed 2026-10-12T17:30:16Z, last observed 2026-10-13T16:22:39Z. Secret-file issue last observed 2026-10-13T11:35:49Z. |
| Category | Vulnerability scanning |
| Severity | INFO |
| Affected Endpoint | Apex `cylixstudio.com`, mostly GET. Examples: `/.env`, `/.env.save`, `/.env.bak`, `/.git/config`, `/wp-admin/install.php`, `/wp-login.php`, `/xmlrpc.php`, `/actuator/env`, `/phpinfo.php`, `/.aws/credentials`, `/.ssh/id_rsa`, `/backup.sql`. Also port-suffixed hosts (`:80`, `:443`, `:8080`, `:8443`, `:8880`). |
| Evidence | Unsampled HTTP 404 = 3,002. Adaptive path groups are app 404 (`securityAction=unknown`, origin status 0 or 404), not 200. Issues API: secret-files 326, wordpress 66, known-scanner-path 33, source-control 21, debug-endpoints 4. Each says no matching outbound fetch. |
| Occurrence Count | 3,002 HTTP 404s in the zone total; path counts are sampled and overlap |
| Root Cause | Internet scanners requesting files this app does not have. |
| Recommended Action | Keep returning 404. No IP block was added. Optional later: a custom WAF skip/block rule, only after approval. |
| Status | False Positive |

Confidence: high that these are failed scans. Paths alone do not identify a person.

### CS-2026-006

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-006 |
| Timestamp | Inside the audit window. Hour not split. |
| Category | Edge security block |
| Severity | INFO |
| Affected Endpoint | Mostly `POST /` on `cylixstudio.com` (9 of the managed blocks in the top error groups). One additional `bic` block. |
| Evidence | Adaptive `securityAction=block`, `securitySource=firewallManaged`, HTTP 403, count 24. `securitySource=bic`, HTTP 403, count 1. Unsampled HTTP 403 = 36, so about 11 other 403s are not labeled as managed blocks (5 adaptive rows are 403 with `securityAction=unknown`). |
| Occurrence Count | 25 labeled edge blocks; 36 HTTP 403 total |
| Root Cause | Cloudflare Managed Free Ruleset and Browser Integrity Check. Working as configured. `firewallEventsAdaptive` could not be queried on this zone, so rule IDs are unknown. |
| Recommended Action | None. Do not disable the managed ruleset. |
| Status | False Positive |

### CS-2026-007

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-007 |
| Timestamp | Inside the audit window. |
| Category | Failed probe (GraphQL / catalog) |
| Severity | INFO |
| Affected Endpoint | `POST /graphql`, `/graphql/api`, `/api/graphql`, `/api/gql`, `POST /api`, `GET /v2/_catalog`, `GET /wp-json/gravitysmtp/v1/tests/mock-data` |
| Evidence | Unsampled HTTP 406 = 22. Adaptive groups are 406 with `securityAction=unknown` (the app or the runtime rejected the request; they were not managed-rule blocks). |
| Occurrence Count | 22 |
| Root Cause | Clients sent a content type or method the app does not accept. No GraphQL API is exposed as a successful query. |
| Recommended Action | None while they stay 406/404. |
| Status | False Positive |

## Suspected

### CS-2026-008

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-008 |
| Timestamp | Inside the audit window. |
| Category | Authentication failure |
| Severity | LOW |
| Affected Endpoint | `POST /_serverFn/fc557deb…` (134), `POST /_serverFn/f357e886…` (15), plus five other server-function hashes at 1–2 each. `POST /api/public/webhooks/streamelements` (1). |
| Evidence | Unsampled HTTP 401 = 159. Adaptive path sum is 157. Not edge blocks. `/login` itself returned 200 (page loads: about 8 apex + 5 www). No 401 spike on `/login`. |
| Occurrence Count | 159 |
| Root Cause | Not proven. Server functions return 401 when the session is missing. This pattern is not credential stuffing. StreamElements 401 is one rejected webhook (signature or auth), and it did not succeed. |
| Recommended Action | Map the two high-volume server-function hashes to their function names in a local build if login bugs are investigated. Do not treat the 401s as a breach. |
| Status | Investigating |

### CS-2026-009

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-009 |
| Timestamp | 2026-10-12 through 2026-10-14T10:00:06Z |
| Category | Edge connectivity |
| Severity | LOW |
| Affected Endpoint | `GET /` on `cylixstudio.com` |
| Evidence | Unsampled HTTP 522 = 3, all on 12 Oct. Adaptive group matches GET `/` on the apex, count 3, `securityAction=unknown`. |
| Occurrence Count | 3 |
| Root Cause | Not proven. 522 means the edge did not get a timely origin response. Too few to call an outage. |
| Recommended Action | Re-check if 522 reappears. No code change from this count alone. |
| Status | Open |

### CS-2026-010

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-010 |
| Timestamp | Issue first and last observed 2026-10-13T06:28:51Z (single occurrence). Log aggregate count 2 at `sampleInterval` 1. |
| Category | Worker exception |
| Severity | LOW |
| Affected Endpoint | Unknown. Message is “Network connection lost.” |
| Evidence | Issues API type `exception`, count 1, status active. Invocation metrics show 0 `scriptThrewException`. |
| Occurrence Count | 1 issue occurrence (log aggregate 2) |
| Root Cause | Not proven. Consistent with a client or upstream disconnect, not a crash loop. |
| Recommended Action | Leave it unless it repeats with a stack that does not contain secrets. |
| Status | Open |

### CS-2026-011

| Field | Value |
| --- | --- |
| Incident ID | CS-2026-011 |
| Timestamp | Inside the audit window. |
| Category | Webhook routing |
| Severity | LOW |
| Affected Endpoint | `POST /api/public/webhooks/kick` HTTP 404 × 2; `GET /api/public/webhooks/kick` HTTP 200 × 1 |
| Evidence | Adaptive counts, `sampleInterval` 1. |
| Occurrence Count | 2 POSTs returned 404; 1 GET returned 200 |
| Root Cause | Not proven. Two POSTs did not hit the handler that returns 200/503. The GET 200 is not a signed webhook delivery. |
| Recommended Action | Confirm the public route always exists on www after deploys. |
| Status | Investigating |

## Not found

- No SQL-injection or XSS payload was tied to a 200 response. WAF score filters were not returned as their own successful query (the combined query that included them was rejected with the firewall dataset). Managed blocks that did fire are CS-2026-006.
- No path-traversal request was shown succeeding. `../` style paths were not a top group; double-slash `//…/.env` paths on port hosts returned 308 or 404.
- No admin login success. `/wp-login.php` and `/wp-admin/install.php` are 404.
- No Supabase URL path was a top error path.
- No OAuth code, token, or cookie is recorded in this file.
- No Vercel `DEPLOYMENT_NOT_FOUND`.
