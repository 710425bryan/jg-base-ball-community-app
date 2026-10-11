# Supabase timeout recovery — 2026-10-09

Project: `qwxzwomzoyfkorbwsscv` (`jg-base-ball-community-app`). Times in this report are Asia/Taipei unless explicitly UTC.

The baseline, execution ledger and original follow-up below describe the 2026-10-09 checkpoint. Later release preparation and database verification are recorded in the dated 2026-10-12 follow-up; they do not retroactively complete the original timeout or notification acceptance criteria.

## Scope and acceptance

The user authorized phased execution of the reviewed maintenance and prevention plan on 2026-10-09. Production scope: bounded maintenance of `net._http_response`, retention of completed `cron.job_run_details` older than 30 days except the latest 10 records of each current job, and follow-up verification. Frontend request deduplication and its migrations are prepared and tested locally before release. No project restart, destructive table rebuild, paid compute change, or mass notification replay is included.

- Functional: images, home snapshot, notifications, equipment list, and fee reminders each receive at least 10 spaced sequential checks. HTTP/SQL success, contents, and permission checks are separate evidence.
- Short term: at least 30 minutes without the same production timeouts; cleanup and notification processing progress. Initial target: RPC p95 below 2 seconds, with sample count and measurement scope reported.
- Long term: at least 24 hours including a normal peak, then 7 days of retention/alert evidence. Missing samples are gaps, not healthy results.
- General VACUUM reuses space; immediate physical file shrinkage is not an acceptance requirement.

## Baseline

- 12:10: equipment, notification feed, home snapshot, and fee reminder RPCs hit the authenticated role's 8-second statement timeout. A separate `last_seen_at` update waited approximately 3.3 seconds on a row lock.
- 12:55:17–12:59:52: four completed `pg_net` response cleanup calls consumed 255.152 seconds and 80,582 PostgreSQL shared-block reads (about 629.55 MiB). This is a counter delta, not the historical average or a physical-disk throughput measurement.
- 13:09:28: `net._http_response` 264 MB; `cron.job_run_details` 1,376 MB. Response TTL is 6 hours. Cron timezone is GMT. No retention job was present.
- 13:09:28 cleanup counters, worker role `postgres`: calls 327877; total execution time 97371064.0846069 ms; shared blocks read 126715019. Stats reset was 2026-06-08; later comparisons must use deltas and detect counter resets.
- 12:59–13:09: four PostgreSQL statement-timeout log records; latest at 13:07:39.548. Baseline window is not a successful observation window.

## Execution ledger

| Time | Action | Result |
| --- | --- | --- |
| 13:09 | Baseline and permissions/catalog checks | Captured; worker still waiting on data-file reads. |
| 13:09–13:12 | Full ANALYZE attempt through MCP | Exceeded intended 30-second limit; cancelled only the exact maintenance backend and verified it disappeared. `SET LOCAL statement_timeout` in the same API batch did not provide the intended initial statement deadline. No business backend was cancelled. |
| 13:12:37 | ANALYZE only `created` | Completed. Estimated dead rows 186,606; live rows 588. Avoided sampling HTTP payload columns. |
| 13:13:22 | Normal response-table VACUUM | Completed in approximately 12 seconds with `TRUNCATE FALSE`, `PARALLEL 0`, 256 KiB buffer usage. No exclusive table rebuild. Buffer usage is not an I/O rate limit. |
| 13:13:34–13:14:45 | Compare cleanup counters | Four calls used 0.839 ms total with zero additional shared-block reads, versus 255.152 seconds before maintenance. Queue and expired responses were zero at the checkpoint. |
| 13:17 | Deploy retention | Migration `20261009051707_cron_run_history_retention.sql` applied. First batch scanned 500 rows in 285 ms, deleted zero recent rows. |
| 13:19–13:24 | Initial bounded history sweep | Scanned 203,556 rows and deleted 55,000 eligible historical completed runs. Cursor persisted at runid 387198. Sweep is **not complete**. |
| 13:21 | Activate nightly maintenance | `pg-net-response-maintenance` at 03:20 and `cron-run-history-retention` at 03:30 Taiwan time. First actual cron executions are still pending. |
| 13:21–13:25 | Original Storage metadata endpoint | 10/10 HTTP 200, sequential with 30-second spacing; maximum 5.355 seconds. Success alone does not pass the latency criterion. |
| 13:24–13:27 | Cleanup pressure and verification failure | Cron-history autovacuum scanned the 174,350-block heap. A monitor CLI probe timed out; this is a measurement gap. New PostgreSQL statement timeouts at 13:26:53 and 13:26:54, plus home RPC HTTP 500, invalidate the initial short-term stability window. |
| 13:25 | Stop extra bootstrap calls | Local bootstrap stopped; confirmed no retention statement remained active. Persisted cursor allows nightly continuation. Existing autovacuum was left to finish. |
| 13:35:20–13:45:28 | Background cleanup then statistics | Cron-history autovacuum completed at 13:35:20, followed by autoanalyze until 13:45:28. At 13:45:57 last_autoanalyze was populated and n_mod_since_analyze was zero. No background worker was cancelled. |
| 13:14:45–13:44:45 | First full 30-minute window | **Failed**: 25 PostgreSQL statement timeouts, latest 13:44:01.451, and one confirmed Storage 544 at 13:24:51.719. The corresponding external probe ultimately returned 200, illustrating why client HTTP status alone is insufficient. |
| 13:46 | New observation window | Begin a fresh window after background maintenance completes; no further bulk maintenance. This is a new attempt, not removal of the failed interval. |
| 13:47:10 | Post-analysis cleanup baseline | 327983 calls; 97840175.378367 ms total execution; 126782866 shared blocks read. Use these counters for the new window. |
| 13:48 | Queue checkpoint | Zero queued HTTP requests and zero responses past the six-hour TTL. |
| 13:50 | Lightweight observer first successful CLI checkpoint | Both queries completed; core 5.79 seconds and retention 5.56 seconds are client/API elapsed times, not RPC or SQL latency. Unknown checks remain explicit. |
| 13:46–14:16 | Fresh full 30-minute backend window | Zero PostgreSQL statement timeouts and zero Storage 544 records. All 94 requests across the four important RPCs returned 200. Only 88 carry timing values; latency sampling continues. |
| 13:47:10–14:16:04 | Cleanup counter comparison | 113 calls, 198.064 ms total, mean 1.753 ms; 11 additional shared-block reads (88 KiB). Counters remained comparable. |
| 14:17:13 | Final queue/TTL checkpoint | Queue empty; oldest response 08:18:22, newer than the 08:17:13 six-hour expiry cutoff. No expired response observed. |
| 14:48:18 | Apply user's historical notification decision | Exactly 11 historical coach-leave events changed from pending to recorded, retaining the in-app records. No worker invocation or push delivery. Independent post-check confirmed zero eligible historical claims, zero deliveries, unchanged content and unchanged feed/claim definitions. |

### Current interpretation

Response cleanup was a major contributor: removing dead tuples reduced its measured work dramatically. This does **not** establish that every source of load is solved. The first backlog cleanup overlapped a large autovacuum and user-visible latency increased. This correlation warrants slower off-peak cleanup; it is not proof that autovacuum alone caused every timeout. Do not run another daytime bulk sweep, full ANALYZE, or manual cron-history VACUUM merely to make table size fall.

The daily retention procedure has a 20-second **soft budget checked between batches**, up to 10,000 deletes or 100,000 scanned rows per call, 500 rows per transaction, and a 500 ms lock timeout. The global server statement timeout was verified as 120 seconds; current role settings are expected to inherit it, but the first actual maintenance cron session is still unverified. These are different limits. Retention preserves 30 days and the latest 10 rows for each current job; unknown statuses, running jobs, and missing completion timestamps are retained.

A read-only schedule inventory estimates 6,078 new cron execution records per normal day (6,079 on the annual job's execution day), assuming each scheduled invocation starts once. The 10,000-delete daily cap leaves at most 3,922 rows/day of steady-state catch-up capacity; the soft time budget and scans of recent protected rows can reduce actual throughput. Seven days of successful runs will not by itself establish that the existing backlog is cleared. Review actual deleted/scanned deltas and sweep completion after the first night before considering additional bounded off-peak runs.

For the seven-day capacity check, compare actual additions with deletions: while eligible backlog remains, deleting less than the estimated 42,546 weekly additions indicates insufficient catch-up unless actual additions are lower. Record scans, deletions, elapsed time and sweep completion separately. A recent-row-only scan may legitimately delete zero rows for one night, but repeated successful scans are not a retention-capacity pass. The 10,000 cap is per procedure call; adding more calls requires a shared daily budget if the daily limit is to remain unchanged.

### Local implementation validation

- Frontend auth/notification deduplication: final 46 tests across five files passed; TypeScript and production build passed. Also fixed hidden-tab dirty refresh and last-seen-only profile changes triggering a feed reset. Build emitted existing Browserslist/chunk-size warnings.
- Retention migration and activation contracts: 76 isolated SQL assertions passed, including cutoff boundaries, latest-ten preservation, rollback/cursor atomicity, privileges, and idempotence. This is not an actual pg_cron scheduler integration test.
- Last-seen database throttle: 13 isolated SQL assertions passed; the migration draft was local only at this 2026-10-09 checkpoint. Its reconciled filename and subsequent verification are recorded in the 2026-10-12 follow-up below.
- Observer: 13 Node tests passed, including counter resets, gaps, simulated alerts, strict sanitized stdin, project isolation and output path checks. Actual CLI and MCP-to-stdin collection both verified; automated alert delivery is still pending.
- Historical coach notification disposition: 40 isolated PostgreSQL checks passed, including fingerprint/drift rejection, zero-delivery guards, rollback, rerun refusal, retained feed visibility and permission checks. A new revision of the same old leave created after the cutoff remains claimable. These are isolated checks, not an actual device push test.
- No commit, push, frontend deployment, or last-seen production migration was performed. Browser checks use the existing logged-in localhost client against the production backend; they are not proof of a new frontend release.

## Follow-up state

- Functional verification: ten spaced sequential ADMIN rounds completed, with all five operation results present. Cross-role notification visibility/content verification for ordinary users, coaches and managers is incomplete; anonymous rejection checks do not replace it. This is a successful controlled rendering/read-path check, not full notification end-to-end acceptance.
- Short-term observation: the first full window failed. The new 13:46–14:16 window has no same timeout and cleanup keeps progressing. The database error-free criterion is met for this interval; full short-term acceptance remains open because notification processing is blocked, some RPC timing samples are missing and home/fee timing samples are limited. Continue collecting samples rather than treating this as the long-term SLO.
- 24-hour acceptance: pending; earliest checkpoint is 2026-10-10 13:46 if this fresh window remains valid, and a normal usage peak must also be observed. Elapsed time alone is insufficient.
- 7-day acceptance: pending; earliest checkpoint is 2026-10-16 13:46 if this fresh window remains valid. Require retention throughput, sweep progress and alert/coverage records; do not infer a pass from seven successful scheduler statuses.
- Frontend and last-seen migration deployment: not performed.
- Monitoring: Codex heartbeat `supabase-timeout-24-7` created and active, every five minutes, initially through 2026-10-16 14:00 Taiwan. Extend its end if the final stable start is later. It depends on its host being available and is not an always-on monitoring service.
- Historical notification finding: 13:32 found 11 pending `coach_leave_requests` Outbox events, oldest 2026-10-03 00:08 Taiwan, latest update 2026-10-06 15:07; target/sent/failed counts all zero, no pending deliveries. These predate today's incident and were disposed as recorded-only at 14:48:18 below; they are no longer an unresolved pending backlog.
- Notification cause confirmed: cron job 26 is active every minute; migration and service-only RPCs exist; the complete deployed Edge Function list lacks `process-coach-leave-notification-outbox`. Its existing source passed 20 worker/utility tests, 508 coach SQL checks and typecheck, but was not deployed or invoked. It has no dry-run/date cutoff/event-ID filter; deployment without a historical disposition guard can immediately send the old events to currently eligible subscriptions.
- User decision applied on 2026-10-09 at 14:48:18: retain the 11 historical coach events in the in-app feed only; send Web Push for new events only. The guarded one-time administrative DML in `scripts/suppress-coach-leave-historical-push-20261009.sql` locked and verified the exact pristine set through cutoff `2026-10-06T07:07:21.743675Z`, then changed only status to `recorded` and completion/update times. Independent production post-check: 11 recorded, zero deliveries, zero claim-eligible historical events, all delivery counts zero, no locks and all completion timestamps present. Protected event content and feed/claim definitions matched their preflight digests. No notifications were sent or marked sent. Post-cutoff events, including new revisions of old leave requests, were not changed. The heartbeat remains read-only and cannot reapply this operation or deploy workers.
- Even if the new database stability window passes, the missing coach worker and incomplete cross-role/device checks mean notification end-to-end acceptance has not passed. The historical disposition is complete; new coach Web Push delivery is not restored.
- Separate worker release prerequisite: `docs/EDGE_FUNCTIONS.md:14,83` says not to auto-deploy before historic VAPID material is rotated/moved to secrets and auth modes are versioned. The fresh read-only check found the coach worker absent and no Edge secrets named `COACH_LEAVE_OUTBOX_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` or `VAPID_SUBJECT`; Vault configuration has not been confirmed. Existing shared/training notification sources still contain hard-coded private VAPID material, and leave-webhook gateway auth mode is not versioned. No secret values were read or output. Credential rotation and existing-subscription compatibility need a separate concrete release scope; no worker was deployed or invoked. A local test pass does not establish Edge/gateway/device delivery.

### Failed-window RPC evidence (13:14:45–13:44:45)

Gateway upstream-service-time is milliseconds ([Envoy header reference](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/router_filter.html#x-envoy-upstream-service-time)); it includes upstream processing/network effects and is not a pure SQL execution timer. Project-wide requests include other clients; these counts do not mean ten controlled UI rounds succeeded. Expected anonymous rejections are omitted below.

| RPC | HTTP 200 samples | HTTP 500 samples | Successful-request p95 |
| --- | ---: | ---: | ---: |
| `get_my_home_snapshot` | 12 | 2 | 18,778 ms |
| `get_notification_feed` | 33 | 5 | 25,939 ms |
| `list_equipments_with_inventory_snapshot` | 21 | 0 | 30,725 ms |
| `get_fee_management_reminders` | 7 | 0 | 18,750 ms |

These all miss the initial two-second target. Early UI rounds and ten external HTTP 200 responses are diagnostic evidence, not a functional acceptance pass. The localhost HMR process also briefly left stale Realtime channels during editing; a fresh reload restored it. Do not classify that local HMR event as a production database outage.
- Negative authorization checks at 13:31: anonymous home/notification/fee RPC requests returned 401/42501; equipment returned 400/P0001 from its missing-auth guard. None returned business rows. Maintenance functions deny both anon and authenticated EXECUTE. This does not substitute for a full multi-role end-to-end permission matrix.

### Fresh-window controlled functional checks

Each round navigated to the home page, reloaded it, checked loaded personal home and fee-reminder panels, checked visible image decoding, opened the notification center, then navigated to equipment and checked loaded inventory. The existing ADMIN localhost session used the production backend. Ten rendered notifications were consistently visible; this consistency does not prove every role's allowed content or delivery of the separate pending coach events.

| Round | Checkpoint time | Images | Home | Notification feed | Equipment | Fee reminders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 13:47:36 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 2 | 13:49:56 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 3 | 13:52:24 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 4 | 13:54:35 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 5 | 13:56:45 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 6 | 13:59:38 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 7 | 14:02:56 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 8 | 14:05:09 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 9 | 14:08:12 | Loaded | Loaded | 10 rendered | Loaded | Loaded |
| 10 | 14:10:58 | Loaded | Loaded | 10 rendered | Loaded | Loaded |

The original public Storage metadata path was separately requested ten times, sequentially about 150 seconds apart, from 13:46:45 to 14:09:21. All returned 200; end-to-end elapsed times were 969, 822, 585, 616, 681, 611, 935, 476, 820 and 857 ms. Bodies were discarded. Raw timing-only evidence is in the ignored `.codex/runtime/supabase-recovery/storage-functional-20261009.jsonl`. Browser image checks alone could use cached content; the direct checks and server logs are separate evidence.

### Fresh full-window RPC evidence (13:46–14:16)

| RPC | HTTP 200 / total | Valid timing samples | Missing timing | Observed p95 | Observed maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| `get_my_home_snapshot` | 15 / 15 | 14 | 1 | 497 ms | 497 ms |
| `get_notification_feed` | 38 / 38 | 36 | 2 | 345 ms | 410 ms |
| `list_equipments_with_inventory_snapshot` | 26 / 26 | 24 | 2 | 307 ms | 454 ms |
| `get_fee_management_reminders` | 15 / 15 | 14 | 1 | 514 ms | 514 ms |

All available timings are below two seconds. These are project-wide gateway upstream timings, not a full browser duration or pure SQL duration. Six requests lack timing data; their latency is unknown. In particular, the 14 home/fee samples are limited, so latency sampling remains open and the heartbeat continues observation. No population-level 95% guarantee is inferred. Follow-up log checks overlap five minutes to catch late arrivals without duplicate alerts; observation gaps and unusually delayed logs remain explicit.

## Prevention and incident runbook

| Check | Action / trigger | Acceptance / recovery boundary |
| --- | --- | --- |
| Response cleanup | Compare interval call time and shared-block reads, never lifetime averages. Inspect estimated dead rows and last maintenance. | Mean >1 second or >16 MiB read per call is an initial investigation threshold; no claim that the threshold proves the cause. |
| Nightly maintenance | 03:20 response VACUUM + ANALYZE only `created`; 03:30 bounded history cleanup. | Confirm actual cron succeeded/end times, no overlaps/timeouts, and persisted cursor progress. A scheduled job existing is not proof it ran. |
| Historical retention | Keep 30 days and current-job latest ten; use persisted keyset cursor. | Old backlog must eventually complete a sweep. Until then retention is installed, not fully caught up. Resume daytime bootstrap only after separate load evidence and a smaller work budget. |
| User-visible latency | Aggregate important RPC successes/errors and upstream-service-time milliseconds with sample count and window. | Initial p95 <2 seconds, plus ten sequential functional checks per operation. Show low samples and expected anonymous rejections separately. |
| Notification pipeline | Compare event/delivery states and bounded worker execution logs; inspect feature-specific worker configuration. | No stuck eligible events; target/permission/content evidence is distinct from worker HTTP 200. No mass replay to test recovery. |
| Alerting | Independent local heartbeat reads DB statistics and service logs. On a new timeout, stalled cleanup, job failure or observation outage, record evidence and notify. | Unit tests simulate alerts; real scheduler delivery and continuous coverage still require observation. Stable unchanged results remain quiet. |
| Recurrence | Record timestamp/request ID, distinguish Storage 544 pool timeout, SQL 57014, row locks, and slow-but-successful responses; inspect worker wait and active vacuum before any maintenance. | Stop extra maintenance if errors rise. Cancel only the specifically identified maintenance statement if necessary. Do not terminate unknown sessions or restart the project by default. |
| Escalation | Persistent errors after bounded maintenance: collect a sanitized incident window and platform CPU/I/O/connection evidence for Supabase support. | Compute changes, table rewrites, full vacuum, broad timeout increases, frontend/worker releases and notification replay need their own concrete scope. |

Run `node scripts/supabase-recovery-observer.mjs` once per checkpoint. Its 15-second timeout limits the CLI client, not guaranteed server execution. A failed read is a gap. The lightweight core avoids queue/response/cron-history scans and uses `pg_stat_statements(false)` with JIT disabled for the monitoring transaction. For an MCP read, use the exported SQL and pass the sanitized `snapshot` object (plus optional `retention`) to `--snapshot-stdin`; it performs no database query and rejects extra fields. Runtime JSON is ignored by Git.

Normal VACUUM frees tuples for reuse without requiring physical size reduction; it can still generate substantial I/O. See [PostgreSQL routine vacuuming](https://www.postgresql.org/docs/17/routine-vacuuming.html) and [Supabase pg_net behavior](https://supabase.com/docs/guides/database/extensions/pg_net). Do not disable autovacuum to hide contention.

Do not publish response bodies, session tokens, cron command contents, Vault secrets, or member personal data in this report. Record only timing, counts, result classifications, and redacted diagnostics. For Storage failures use the structured `res.statusCode` / `error.statusCode` fields; arbitrary text containing 544 can be a false positive.

## 2026-10-12 follow-up — release preparation and database verification

- Frontend auth last-seen deduplication and notification refresh coordination are included in the prepared 1.1.76 release. This checkpoint records preparation, not a completed commit, push or frontend deployment.
- Live preflight found that `touch_profile_last_seen()` already used the intended five-minute condition for the authenticated user's own profile. Migration `20261011161534_profile_last_seen_write_throttle.sql` was applied to reconcile migration history, retaining the existing function body, owner and ACL. The 13 isolated SQL checks passed again after matching the local filename to the server-assigned version. This was not the first activation of the online throttle.
- Training VIEW enforcement was deployed as `20261011161249_training_view_permission_gate.sql`. Post-checks confirmed the expected gates on 17 RPCs, four restrictive raw-table policies, eight training attendance policies, and the training notification feed source; six internal helpers retain service-role execution while denying direct anonymous/authenticated execution. Existing ADMIN bypass, linked-member limits and backend automation remain covered by 394 passing isolated SQL checks.
- Read-only production permission probes confirmed that a linked COMMITTEE account without VIEW receives `42501` from the tested training read RPCs and cannot read the protected training tables/feed. A VIEW account can read its linked member's records and is denied access outside that scope. These probes returned only pass/fail results and did not modify business records.
- Pre/post counts and content fingerprints were unchanged for training settings, registrations and blocks, all 348 point transactions, and all 441 role-permission rows. These checks establish preservation during the migration; they do not imply a new permission grant or a point adjustment.
- The retention, last-seen and historical coach-notification SQL suites passed 76, 13 and 40 isolated checks respectively. No retention activation, maintenance sweep, historical notification suppression script or notification replay was executed in this follow-up. The 2026-10-09 operations remain separate historical actions.
- This follow-up does not add a new latency observation window, verify nightly retention throughput, complete 24-hour/seven-day timeout acceptance, or establish device push delivery. Current training Edge Function and release status are tracked separately in `docs/specs/2026-10-11-training-view-permission.md` and `docs/EDGE_FUNCTIONS.md`.
