# Monitoring recommendations

Nothing in this document was enabled. No alert, Logpush job, cron, paid product, WAF rule, or sampling change was made. The zone is on the Free Website plan. Workers behavior matches the Free CPU and daily request limits. The subscriptions API returned authentication error 10000, so the Workers SKU was not read from billing.

## What the current plan already supports

- Zone HTTP daily aggregates (`httpRequests1dGroups`) for about 52 weeks. This audit found traffic only on 2026-10-12, 2026-10-13, and 2026-10-14.
- Security analytics via `httpRequestsAdaptiveGroups` for 31 days of history and a 30-day query window ([Security Analytics limits](https://developers.cloudflare.com/waf/analytics/security-analytics/)). Counts are sampled.
- Worker invocation metrics (`workersInvocationsAdaptive`): requests, errors, CPU, wall time, duration, memory, subrequests. This is the unsampled source for 503-class Worker failures.
- Workers Logs and traces, already on, head sample 0.1, query strings redacted. Workers Logs on Free: **200,000 events/day, 3-day retention** ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)). Traces: 7-day retention documented. Both are included without turning on a new product. A query that shows `sampleInterval` 10 matches this 10% sample.
- Workers Issues, already detecting scanner patterns and one “Network connection lost.” exception. Six issues were active. No notification automation was created.
- Managed Free WAF, normalization, and DDoS L7 rulesets. Security level is medium.
- Dashboard graphs for the same Worker metrics. No extra product.

Stored log volume in this window was far under 200,000 events/day (about 4,900 Worker log events on 13 Oct, plus about 15,700 OTel events that day).

## Free-plan gaps

- **Head sampling cannot prefer errors.** The decision happens when the request starts ([traces FAQ](https://developers.cloudflare.com/workers/observability/traces/)). A 503 can be absent from logs. Keep using invocation metrics for error totals.
- **Log retention is 3 days on Workers Free**, not 7. This audit could see logs back to 12 Oct only because the site’s traffic started that day.
- **`firewallEventsAdaptive` is not available** on this zone (GraphQL: no access to the path). Another Cloudflare doc lists that dataset as Pro, Business, and Enterprise in Log Explorer. Rule IDs for the 25 blocks were not readable. Do not upgrade for this unless you want those events.
- **No Logpush** (0 jobs). Logpush and alerting were not created. They need an explicit approval, and some destinations are paid.
- **No tail-based sampling, no custom alert, no notification on the Issues automations endpoint.** Creating those would be a new integration.
- **Supabase logs are not in Cloudflare.** The Supabase CLI has no access token on this machine.
- **Daily request cap is 100,000** on Workers Free. 13 Oct used about 25,200 Worker invocations. That is headroom today. The failure mode that actually fired is **10 ms CPU**, which returns error 1102 / HTTP 503 ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
- **Subrequest cap** is 50 external calls per invocation on Free. This window averaged about 4–5. It is not proven as the 503 cause.
- Adaptive path counts with a high `sampleInterval` (the `/.env.save` group was ~70) must not be used as exact scanner totals. Use the unsampled 404 total (3,002) for volume.

## Alerts to consider later (do not enable yet)

Proposed only. Each one needs your approval before any Cloudflare notification, email, or webhook exists.

1. Worker `exceededResources` or HTTP 503 on `/api/public/webhooks/kick` above a small hourly count. This is the only HIGH issue. Page on the second burst, not on scanner 404s.
2. HTTP 5xx share above about 1% for 15 minutes, using invocation or zone analytics, not sampled logs.
3. Daily Worker requests above 80,000 so the 100,000 Free cap is visible before error 1027.
4. Do not alert on 404 volume. Scanner 404s are the bulk of 4xx and are a false positive for paging.

Workers Issues already groups scans. Wiring those to chat or email is an automation create call and was not done.

## Sampling and retention if you change them later

- Leave `head_sampling_rate` at 0.1 until log volume is a problem. Raising it to 1 improves Kick and OAuth investigations and still fits the Free 200,000 events/day at today’s traffic. It does not create a paid product. It does increase stored logs. Do not change it without asking.
- Keep `redact_query_string: true`. OAuth callbacks put `code` and `state` in the query string. The app also logs `request.url` on callback failure; that is an application log, not a Cloudflare query-string setting. A future code change should log the stable reason only.
- Do not add Logpush, a trace exporter, or a higher CPU limit in `wrangler.jsonc` as part of monitoring setup. Paid CPU (`limits.cpu_ms`) is a billing change.

## Queue comparison (not enabled)

Cloudflare Queues was not created. The Kick webhook volume in this window was about 7,500 `POST /api/public/webhooks/kick` deliveries (6,847 HTTP 200 + 625 HTTP 503 + a handful of 499/404) across roughly two days, with one hour at about 431 failures. A queue would add a produce operation and a consumer invocation per event. The consumer is still a Worker. On this account the Free CPU cap is 10 ms per invocation, and `waitUntil` does not raise it, so a queue does not make the same JavaScript fit. It would add latency and, on current Cloudflare pricing, Queues is a paid Workers add-on. The source change instead keeps ordinary chat off the command and media modules (62 ms CPU to import those modules once in local Node, versus 0.375 ms per RSA verify). Revisit a queue only if command-only traffic still hits the cap after this handler is deployed.

## 24-hour watch after the Kick webhook deploy (2026-10-14)

Do not enable a paid alert, Logpush, or a notification policy for this. Read the same unsampled Worker metrics and the existing Workers Logs sample. Compare with the audit window of 2026-10-12 00:00 UTC through 2026-10-14 10:02 UTC.

Previous numbers to beat:

- `POST /api/public/webhooks/kick`: about 625 HTTP 503 and 6,847 HTTP 200.
- Worker `exceededResources`: 620. CPU p50 on those rows was exactly 10 ms. Success CPU p50 was about 3.4 ms.
- Sampled warn “chat ignored — no Kick connection”: about 1,720 extrapolated. That string is gone. The new line is `[kick-webhook] outcome` with `intentionally_ignored` and `kick_connection_not_found`.
- Sampled `kick bot send failed 403`: about 40 extrapolated. Sends now try `type: "user"` first.

Check these once after the first busy hour, then again at 24 hours. Use `workersInvocationsAdaptive` for 503 and CPU, not the 10% log sample.

| Signal | Success bar |
| --- | --- |
| Kick HTTP 503 | No hour near the old peak of about 431. A full day stays well under 625. |
| `exceededResources` | No repeat of 620 in a day. A handful during a cold start is worth a second look, not an immediate rollback. |
| Worker CPU time | Success p50 stays under the 10 ms cap. Rows at exactly 10 ms mean the cap is still firing. |
| No Kick connection | Only `outcome: "intentionally_ignored"` and `reason: "kick_connection_not_found"`. A linked channel must not appear there. |
| Query failure | `outcome: "failed"` and `reason: "kick_connection_query_failed"` with HTTP 503. That is a retry, not a missing connection. |
| Kick chat 403 | `kick send failed user 403` is a new problem. `bot 403` alone, after a user 200, is the fallback and is not a failure. |
| Command success | `[chat-bot] kick chat response sent` or command `status: "replied"` still appears for `!` / `#` / `?` commands. |
| Ignored vs failed | Ordinary chat is `processed`. Missing connection is `intentionally_ignored`. Signature and query failures are `failed`. `failed` must stay rare next to `processed`. |

Rollback: redeploy the previous Worker version. Do not change DNS, the database, WAF, or OAuth scopes. In-memory event dedupe does not survive a new isolate, so a Kick retry on another isolate can send a second chat reply or apply points twice. Giveaway entry is an upsert on the same viewer and does not double-count. There is no existing chat-event table that can dedupe this without also inserting a loyalty event. No migration was added.

## How to re-run this audit

Use GraphQL zone daily totals for the request count and status map. Use `workersInvocationsAdaptive` filtered to script `cylixstudio` for CPU and `exceededResources`. Use adaptive groups only for paths, and record `sampleInterval`. Use Workers telemetry for messages, and do not export event bodies that contain URLs. Skip `firewallEventsAdaptive` on this Free zone until a query succeeds.
