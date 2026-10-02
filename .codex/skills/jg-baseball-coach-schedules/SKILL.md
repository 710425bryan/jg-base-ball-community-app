---
name: jg-baseball-coach-schedules
description: 教練排班、固定範本、自動帶入、教練請假排除與首頁排班摘要的專案流程。
---

# jg-baseball-coach-schedules

Use this skill when adding or changing 教練排班表、固定範本、自動帶入、`/coach-schedules`、Dashboard 教練排班摘要、或 `coach_schedules` 權限。教練請假與通知同步讀 `../jg-baseball-coach-leave/SKILL.md`。

## Read First

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md`
3. `docs/FILE_MAP.md`
4. `docs/MIGRATIONS.md`
5. Task-relevant files:
   - `src/views/CoachSchedulesView.vue`
   - `src/components/home/CoachScheduleDashboardPanel.vue`
   - `src/views/HomeView.vue`
   - `src/views/TrainingDatesView.vue`
   - `src/services/coachSchedulesApi.ts`
   - `src/services/coachScheduleTemplatesApi.ts`
   - `src/components/coach-schedules/CoachScheduleTemplateManager.vue`
   - `src/components/coach-schedules/CoachScheduleAutoFillPreview.vue`
   - `src/components/coach-schedules/CoachScheduleMonthOverview.vue`
   - `src/utils/coachScheduleMonthOverview.ts`
   - `src/composables/useCoachScheduleEditor.ts`
   - `supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql`
   - `supabase/migrations/20261002171951_coach_schedule_venue_templates.sql`
   - `supabase/migrations/20261002180340_coach_schedule_scheduling_coach_eligibility.sql`
   - `src/types/coachSchedule.ts`
   - `src/utils/coachSchedules.ts`
   - `src/router/index.ts`
   - `src/components/RolePermissionsManager.vue`
   - `src/layouts/MainLayout.vue`
   - `supabase_coach_schedules_migration.sql`
   - `supabase_zzz_coach_schedule_match_source_integrity_migration.sql`

## Feature Boundary

- Feature key: `coach_schedules`
- Actions: `VIEW / CREATE / EDIT / DELETE`
- Route: `/coach-schedules`
- Dashboard section: `HomeView` renders `CoachScheduleDashboardPanel` for `coach_schedules:VIEW` users or profile roles `HEAD_COACH` / `COACH`.
- Scheduled coaches are `profiles.id`, not `team_members`. The shared `private.coach_profile_is_schedulable()` checks active/access windows and accepts HEAD_COACH/COACH plus trimmed/legacy Chinese coach labels and the verified exact SCHEDULINGCOACH key (排班教練). Never infer eligibility from role_name, weight or arbitrary VIEW permissions. Listing, saving, templates and leave use the same eligibility; extending it does not grant feature/action permissions.

## Data Flow

- `list_coach_schedule_admin_month(p_month)` returns admin candidates and saved assignments for a month.
- `list_coach_schedule_dashboard(p_month)` returns saved monthly schedules:
  - `coach_schedules:VIEW`: all coaches.
  - Eligible HEAD_COACH / COACH / exact SCHEDULINGCOACH without `VIEW`: only assignments where `coach_profile_id = auth.uid()`.
  - Other users: empty list.
- `list_schedulable_coaches()` returns active coach profiles for multi-selects.
- `save_coach_schedule_event(p_event, p_coach_profile_ids)` creates or updates the event and replaces assignments.
- `delete_coach_schedule_event(p_event_id)` deletes a saved event and cascades assignments.
- Card filters intersect the selected source with an independent「未指派教練」toggle. Count empty `coach_profile_ids` within the selected source using RPC events, never draft forms; both persisted/candidate empty assignments qualify, including cancelled rows with their status label. Keep draft selections visible until a successful save reloads assignments; switching filters must not reset drafts or call RPCs. Use a filter-specific empty message and omit the former candidate/saved/assigned passive statistics.
- The visible month-overview button opens a compact read-only full-month Dialog independent of the card source and unassigned filters. Fetch a separate current `list_coach_schedule_admin_month()` snapshot on opening/foreground/error retry; page events may preserve older saved data while retaining dirty forms. Never apply the overview snapshot to card forms. Show dates/times, all source kinds, venues/titles, saved assignment names, unassigned and cancelled states. Use the existing blue location-training / amber match colors in rows and source badges, retaining text labels. Normal footer has only close, without a refresh button; retry exists only in the error state. Reject stale responses after close/month change and show loading/error/retry instead of old-month data. Keep phone scrolling inside the Dialog and 44px controls.

## Source Integrity and Program Labels

- Admin and Dashboard RPC events include nullable `program_key` / `program_label`. The metadata retains participating programs for shared lessons; the key identifies the representative source, not the entire group. Per user request, admin cards and Dashboard summaries do not display program badges (國中部／中港總部／合班).
- `supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql` groups training locations by date, physical `venue_id`, normalized start time and trimmed course title. Use the latest end time. Different titles/times/dates/venues, unknown venue IDs and archived sources remain separate. Do not apply this rule to matches or manual schedules.
- The private slot resolver drives candidate listing, save validation and source reconciliation. A unique constraint plus transaction advisory lock prevents duplicate writes. Track every source venue ID; deleting a representative source reanchors the shared schedule, and only deleting the final source removes it. A split keeps coaches on the original lesson and leaves the moved candidate unassigned.
- Merge coach sets and notes, preserving original events and assignments in private audit. Keep the oldest event ID. Conflicting statuses remain scheduled if any merged event was scheduled; originals remain auditable. Do not rewrite player assignments, attendance or billing.
- An already-saved candidate rejects stale create requests unless the payload is an identical retry. The latest coach-leave migration requires saved `updated_at` on edits for ALL source types; older clients lacking a revision must refresh to the matching frontend version.
- The earlier `20260924043936_coach_schedule_program_source_integrity.sql` repaired invalid source links; its per-program split and per-source cleanup have been superseded by the shared-slot migration.
- The one-time repair relinks only a unique replacement in the SAME session with identical date, time, title and location and no existing saved target. Unmatched legacy records become manual schedules, preserving event IDs, original source IDs for traceability, notes and coach assignments.
- SQL regression: `pnpm test:coach-schedules:sql` runs historical source repair, shared-slot, coach-leave/template and notification Outbox cases in isolated PGlite. It never connects to production; real multiple-session lock contention still needs staging PostgreSQL verification.

## Candidate Rules

- Training date candidates come from `get_training_month_dates()`, so `/training-dates` remains the source of truth for which dates are training days.
- If a date has `training_location_session_venues`, those venue blocks are the candidates for that day; do not also show the generic `週六訓練` candidate.
- Saved `training_location` schedule events keep coach assignments and schedule notes, but source fields (`schedule_date`, time range, title, location, and location URL) must stay synced from `training_location_session_venues` / `training_location_sessions`.
- `matches.match_level = '特訓課'` is shown as `training_class`; other `matches` rows are shown as `match`.
- Match and training-class schedules use `matches.id` as the source identity. Do not deduplicate them by date or title. Database triggers validate the source, cascade schedule cleanup after match deletion, and keep `source_type` aligned when `match_level` changes.
- `matches.coaches` is only reference text for admins. Do not use it for Dashboard ownership or permission checks.
- Manual schedule events are allowed for exceptions, but should still save through the RPC and assign profile IDs.

## Templates and Leave Guards

- Templates match eligible `training_date` / `training_location` activities by active physical venue ID only, without weekday, start time, source-type or title conditions. One active template is allowed per venue. Enrichment resolves location activities from authoritative source venue IDs and generic training dates by exact active `training_venues.name = btrim(event.location)`; never use fuzzy matching or arbitrarily choose among trimmed duplicate names. Keep source identity and shared-slot merging unchanged.
- `list/save/delete_coach_schedule_template` use existing `coach_schedules` actions; updates/deletes require `updated_at`. The CREATE-only manager contains exactly venue, fixed coaches, optional template name and active switch. Blank names use the canonical venue name. Event-card「存成範本」only seeds venue/coaches and clears ID/revision; incomplete activity times do not block copying.
- The template fixed-coach, event-card assigned-coach and manual-dialog assigned-coach multi-selects use the shared Element Plus select with `el-option-group`. `coachScheduleCoachOptions.ts` groups only the supplied eligible coaches, canonicalizes trimmed/legacy coach roles, and reuses the shared role weight/key ordering with metadata role names. Refresh roles through the permission store when loading the parent page or template manager; never fetch once per event card. Reactive changes reorder groups without changing selected profile IDs. Sort within groups by display nickname/name, full name and ID. Display sorting never changes eligibility, access or assignments; retain one search input, cross-group multi-selection, and the event-card leave-disabled options/labels.
- `list_coach_schedule_template_venues()` uses coach_schedules:VIEW and only returns active venue ID/name, independent of the selected month and training_locations permissions. Use the shared Element Plus searchable allow-create select. `save_coach_schedule_template()` requires `match_mode: 'venue'`; resolve/create new venue names and save the template in one transaction. Trim input edges and reuse exact names without changing existing venue metadata. Cancellation or failed saves leave no new venue; deleting a template retains the catalog. Do not expose raw venue tables or let this RPC edit addresses, maps or active state.
- `preview_coach_schedule_auto_fill(p_month)` shows today/future CURRENT candidates with no assigned coaches and normal status, with proposed profile IDs, exclusions, vacancy count and `time_incomplete`. Past, cancelled and already-assigned events are excluded. Reserve each coach across the proposed batch to prevent overlapping assignments.
- Incomplete/invalid end times use conservative full-day conflict and leave checks; show this explicitly. They may be confirmed when the venue template matches and no full-day conflict exists. Do not silently assume a duration or ban all incomplete events.
- `confirm_coach_schedule_auto_fill(p_month,p_fingerprint,p_event_keys)` takes the shared transaction lock, recomputes the fingerprint and rejects stale batches. Venue-mode fingerprints use `venue-v2:` and include sorted venue IDs/names/active state/revisions; reject old prefixes before receipt lookup. Only selected rows with available coaches are saved. New rows require CREATE; saved empty rows require EDIT; receipts make exact retries idempotent without restoring removed coaches. A BEFORE statement trigger makes training_venues writes take the same lock before row locks, preventing catalog/confirmation races and inverse lock ordering.
- The venue-template migration refuses a nonempty legacy template table rather than choosing or combining coach sets. Do not edit deployed migrations; recheck the preflight before deployment and report exact local/remote migration versions.
- Single-event save checks all-source revisions, current coach eligibility, effective source times, leave overlap and other bookings. Cancelled events do not occupy time. Half-open time intervals allow adjacent events.
- Coach leave is a separate profile-based system. Create/edit removes overlapping today/future normal assignments atomically with private audit and an event-version change. Cancelling/reducing a leave NEVER restores the old assignment; the scheduler must explicitly assign again.
- Candidate RPCs add `venue_id`, unavailable profile IDs and reason-free `assignment_changes`. Only coach-leave RPCs disclose private reasons to the owner or coach-leave managers. Slot source changes also recheck leave. Match mutations acquire the same advisory lock in BEFORE statement order before any row locks.

## Safety Rules

- Frontend route guards and `permissionsStore.can()` are UX only. RLS and security definer RPCs are the real data boundary.
- Do not directly write `coach_schedule_events`, `coach_schedule_assignments` or `coach_schedule_templates`; authenticated raw DML is revoked in the latest migration. Use the permission-checked service RPCs.
- Do not remove or bypass the match-source integrity triggers in `supabase_zzz_coach_schedule_match_source_integrity_migration.sql`. A calendar sync may recreate a deleted match with a new UUID, so the old UUID's saved schedule must be removed when the source match is deleted.
- Do not expose arbitrary profile lists to ordinary users. Coach listing is admin-only through `list_schedulable_coaches()`.
- Do not infer coach identity from display names, nicknames, `team_members`, or comma-separated `matches.coaches`.
- Keep notification schedule-VIEW audience tied to `private.coach_profile_is_schedulable()` so SCHEDULINGCOACH is not lost in a second role allowlist. It does not grant private leave reasons or management permissions. The eligibility migration changes only two private helpers; public RPCs, existing role permissions and worker implementations remain unchanged.
- When changing candidate logic, verify interactions with `training_dates`, `training_locations`, `training`, and `matches`.

## Verification

- Targeted tests:
  - `pnpm exec vitest run src/utils/coachSchedules.test.ts src/views/HomeView.test.ts`
- Type check:
  - `pnpm exec vue-tsc --noEmit`
- Build when safe:
  - `pnpm build`
  - Note: this repo's build updates `public/version.json`; do not run it if that would overwrite unrelated dirty version changes.
