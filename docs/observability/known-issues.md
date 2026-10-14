# Known issues

Status values: Open, Investigating, Resolved, False Positive. Counts are from the 2026-10-12T00:00:00Z–2026-10-14T10:02:18Z audit. A source fix for CS-2026-001, CS-2026-002, and CS-2026-003 was written on 2026-10-14 and was not deployed.

| Incident ID | Timestamp | Category | Severity | Affected Endpoint | Evidence | Occurrence Count | Root Cause | Recommended Action | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CS-2026-001 | 2026-10-13T19:00:00Z–2026-10-14T00:47:07Z | Worker CPU | HIGH | `POST /api/public/webhooks/kick` | 620 `exceededResources`, CPU p50 exactly 10 ms. Local Node: importing default commands, custom commands, media ingest, and platform ingest cost 62 ms CPU. RSA verify was 0.375 ms/call. | 620 invocations / 612 HTTP 503 | Every chat line awaited command and media handlers, so a cold isolate evaluated that graph inside the Free 10 ms cap. `waitUntil` does not raise the cap. Source now runs those handlers only for command-like lines and media links. | Deploy the source change. Do not add a paid queue; it would not raise the 10 ms cap. | Open |
| CS-2026-002 | ~2026-10-13T23:37Z–2026-10-14T01:49Z | Kick chat | MEDIUM | `POST /api/public/webhooks/kick` | Warn only when `platform_connections` has no active row for `broadcaster.user_id`. Token expiry is not read on this path. Lookup is Supabase, not isolate memory. | ~1,720 extrapolated log lines | Missing active Kick row for that broadcaster id. A query error used to be logged as the same warning and returned HTTP 200. | Source now returns 503 only when the query errors, and logs `intentionally_ignored` when no row exists. Still unknown whether those ids should have matched a connection. Supabase logs were not available. | Investigating |
| CS-2026-003 | Same warn window as CS-2026-002 | Kick chat API | LOW | `POST https://api.kick.com/public/v1/chat` | Warn was `kick bot send failed 403` with message `Forbidden`. No `kick user send failed` row in the warn aggregate. | ~4 stored / ~40 extrapolated | Code sent `type: "bot"` first. Kick docs: bot mode ignores `broadcaster_user_id` and posts as the channel on the token. This app stores a user OAuth token, so bot mode is not the channel send. | Source sends `type: "user"` with `broadcaster_user_id` first and falls back to bot. Scopes were not changed. Not deployed. | Resolved |
| CS-2026-004 | Inside audit window | OAuth | MEDIUM | `GET /api/auth/kick/callback` | HTTP 530 × 1; one sampled `[oauth:kick] callback fail` | 1 HTTP 530 | Not proven (530 vs app-level fail may differ) | Log only the stable reason code. Do not log `request.url`. | Investigating |
| CS-2026-005 | 2026-10-12T16:26Z–2026-10-13T16:22Z | Scanner 404s | INFO | Apex secret, git, WordPress, PHP, and backup paths | 3,002 HTTP 404; issue groups report no outbound fetch | 3,002 HTTP 404 | Scanners; app has no such files | Keep 404. Do not block IPs from this audit. | False Positive |
| CS-2026-006 | Inside audit window | WAF block | INFO | `POST /` on apex and other managed-rule matches | 24 `firewallManaged` blocks, 1 `bic` block, 36 HTTP 403 total | 36 HTTP 403 | Managed Free Ruleset / Browser Integrity Check | Leave managed rules enabled. | False Positive |
| CS-2026-007 | Inside audit window | Content negotiation | INFO | `/graphql`, `/api/graphql`, `/api/gql`, `/v2/_catalog` | Unsampled HTTP 406 = 22, not a WAF block | 22 | Unsupported content type or method | None while status stays 406. | False Positive |
| CS-2026-008 | Inside audit window | Auth 401 | LOW | `/_serverFn/…` and one StreamElements webhook | Unsampled HTTP 401 = 159; `/login` was HTTP 200 | 159 | Likely missing session on server functions; one rejected webhook | Map server-function hashes before calling them login bugs. | Investigating |
| CS-2026-009 | 2026-10-12 | Edge timeout | LOW | `GET /` on apex | Unsampled HTTP 522 = 3 | 3 | Unknown | Watch for a repeat. | Open |
| CS-2026-010 | 2026-10-13T06:28:51Z | Exception | LOW | Unknown | Issues API “Network connection lost.” count 1. Zero `scriptThrewException` invocations. | 1 | Unknown | No code change from one disconnect. | Open |
| CS-2026-011 | Inside audit window | Webhook route | LOW | `POST /api/public/webhooks/kick` | Adaptive HTTP 404 × 2 | 2 | Unknown | Confirm the route stayed mounted across deploys. | Investigating |
| CS-2026-012 | Inside audit window | Client abort | INFO | Mixed, including 8 Kick webhook 499s | Unsampled HTTP 499 = 65. Worker `clientDisconnected` = 310 (includes non-499 disconnects). | 65 HTTP 499 / 310 disconnects | Client closed the connection | None. | False Positive |
| CS-2026-013 | Inside audit window | Live counter | LOW | `POST /api/live-counter/lookup` | Adaptive HTTP 400 × 16; unsampled HTTP 400 = 17. Handler returns 400 for bad JSON, unknown platform, or lookup failure, and 401 for a missing bearer (those 401s are not this row). | 17 | Not split by error string | Add a stable error code in logs if it keeps happening. | Open |
| CS-2026-014 | 2026-10-13T17:00:00Z | Twitch webhook | LOW | `POST /api/public/webhooks/twitch` | Adaptive HTTP 503 × 1 | 1 | Same CPU class is possible, not proven for this single call | Include this path in any Kick CPU fix test. | Open |
| CS-2026-015 | Inside audit window | Method | INFO | One `/_serverFn/…` | HTTP 405 × 1, GET | 1 | GET on a POST-only server function | None. | False Positive |
| CS-2026-016 | 2026-10-12–14 | Sampling gap | INFO | All routes | Logs and traces `head_sampling_rate` 0.1. Errors are not guaranteed to be stored. | n/a | Head sampling decides before the outcome | See monitoring recommendations. Do not raise sampling in this audit. | Open |
| CS-2026-017 | Source inspection 2026-10-14 | Message timers | HIGH | Worker `scheduled` | Migration file written, not applied. Cron is not in `triggers.crons`. Until `last_sent_slot` exists, the schedule query fails closed and does not send. The commands page no longer posts. | n/a (source, not a log sample) | Timers used to follow the open Studio page and wall-clock `last_sent_at`, with no compare-and-set. | Apply the migration, deploy the Worker, then add cron `* * * * *`. Do not enable cron before the column exists if you want sends; the code still will not send without it. | Open |

## Fix status summary

- **Open:** CS-2026-001 (source fixed, not deployed), CS-2026-009, CS-2026-010, CS-2026-013, CS-2026-014, CS-2026-016, CS-2026-017 (migration file written, not applied; cron not enabled; sends fail closed until `last_sent_slot` exists; not deployed).
- **Investigating:** CS-2026-002, CS-2026-004, CS-2026-008, CS-2026-011.
- **Resolved:** CS-2026-003 (send order fixed in source; not deployed).
- **False Positive:** CS-2026-005, CS-2026-006, CS-2026-007, CS-2026-012, CS-2026-015.

Scanner 404s and managed-rule 403s were not changed. Server-function 401s, live-counter 400s, the single Twitch 503, and the OAuth callback 530 were not changed.

## CS-2026-017 message timers (Open)

Migration file `supabase/migrations/20261014150000_message_timer_last_sent_slot.sql` is written and was not applied. Production database was not changed. Cron is not in active `triggers.crons`. The Worker was not deployed.

`last_sent_at` is still only a timestamp. The schedule selects `last_sent_slot`. If that column is missing at runtime, the query or the claim update fails closed and Kick chat is not called. Existing timer rows are not rewritten by the migration.

Only `runScheduledMessageTimers` may send. `tickMessageTimers` returns `fired: 0`. The commands page no longer calls it. Test mode still ticks local preview state and does not post to Kick.

Airtime rule: slot `n` is due at `started_at + n * interval`. Only the current `n` can send, and only when that due time is strictly after both this stream's start and the timer's `updated_at`. Enabling a timer, or changing its message or interval, bumps `updated_at`, so earlier slots of this stream are not backfilled. A new livestream id or a new `started_at` starts elapsed time over. Offline and UNKNOWN do not send and do not flush a backlog.

The claim keeps the slot when Kick returns an error. Dedupe means at most one attempt for that slot, not a guaranteed delivery. The next interval can send. The same stream cannot move to an earlier index.

Live status is `GET https://api.kick.com/public/v1/livestreams?broadcaster_user_id=` for the single active Kick `platform_user_id` on that timer's user. HTTP 200 with `data: []` is OFFLINE. Any other failure, a missing `started_at`, or a mismatched broadcaster id is UNKNOWN.

Rotation: each minute runs one group whose worst-case subrequests stay at or under 45 (Free cap is 50). A one-minute cron is 1,440 requests per day, inside the Free 100,000 request cap. CPU limit is 10 ms per cron. Wall limit is 15 minutes. `limits.cpu_ms` was not set. Queues were not added. Channels that do not fit this minute are in a later group, and every timer is in exactly one group.

Later dashboard step, not done: Workers & Pages → cylixstudio → Settings → Triggers → Cron Triggers → `* * * * *`.

```sql
ALTER TABLE public.message_timers
  ADD COLUMN IF NOT EXISTS last_sent_slot text;

COMMENT ON COLUMN public.message_timers.last_sent_slot IS
  'Atomic claim: channelId|timerId|streamSessionId|intervalMinutes|intervalIndex';
```

The service client runs this update. It was not executed against production:

```sql
UPDATE public.message_timers
SET last_sent_slot = $claim,
    last_sent_at = $due_at
WHERE id = $id
  AND user_id = $user_id
  AND enabled = true
  AND last_sent_slot IS NOT DISTINCT FROM $expected
  AND last_sent_slot IS DISTINCT FROM $claim
RETURNING id;
```

`$expected` is the slot read for that run (`NULL` when the row has never claimed). A second isolate that races the same claim updates zero rows and does not send.

Fixture run on 2026-10-14, no live Kick chat: `node --import ./scripts/command-match-loader.mjs ./scripts/message-timer-live-tests.mjs` passed 17 checks, including offline, live slot, new stream, timer edit with no backfill, one winner for a racing claim, a locked update that keeps the newer slot, Kick failure keeping the slot, and the commands page not sending. The same run measured worst waits of 7, 17, and 84 minutes for 40, 100, and 500 channels. `assert-message-starts-with-trigger.mjs` passed 60 assertions. `npm run build:cloudflare` succeeded.

Local measurement, not production: Node planned 40 one-timer channels in 12.6 ms wall and reserved at most 43 subrequests. `wrangler dev --local` (workerd, compatibility date capped at 2026-10-13) ran the same planner. The handler log showed 25 ms wall, 40 of 40 channels covered across 7 minutes, and 43 reserved subrequests. That log did not include a Workers CPU-time field. The probe performed no fetch. That workerd run was not repeated on the readiness check.

## Readiness (2026-10-14)

Not applied. Not deployed. Cron is off. The production Supabase project was not used for a race test. No local Postgres, Docker, or non-production database URL was available, so the concurrent `UPDATE` was not executed against a database. The predicate was checked with a row-lock model in the fixture script.

Remaining risk: with one timer per channel, the Free subrequest budget visits 6 channels per minute. About 40 channels wait up to 7 minutes, 100 wait up to 17 minutes, and 500 wait up to 84 minutes. A 15-minute timer on a channel in the last group of 500 can miss intervals. Queues and paid CPU were not added. A leftover Node process running the previous build can still post from the commands-page poll until that process is stopped. The current source does not. Relay sockets still start under `npm start` and stay off on Workers. They do not send timers.
