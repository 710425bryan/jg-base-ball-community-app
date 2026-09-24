# jg-baseball-coach-schedules

Use this skill when adding or changing 教練排班表、教練上課日、`/coach-schedules`、Dashboard 教練排班摘要、或 `coach_schedules` 權限。

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
- Scheduled coaches are `profiles.id`, not `team_members`. Candidate coach accounts are active `HEAD_COACH` / `COACH` profiles inside their access window.

## Data Flow

- `list_coach_schedule_admin_month(p_month)` returns admin candidates and saved assignments for a month.
- `list_coach_schedule_dashboard(p_month)` returns saved monthly schedules:
  - `coach_schedules:VIEW`: all coaches.
  - `HEAD_COACH` / `COACH` without `VIEW`: only assignments where `coach_profile_id = auth.uid()`.
  - Other users: empty list.
- `list_schedulable_coaches()` returns active coach profiles for multi-selects.
- `save_coach_schedule_event(p_event, p_coach_profile_ids)` creates or updates the event and replaces assignments.
- `delete_coach_schedule_event(p_event_id)` deletes a saved event and cascades assignments.

## Source Integrity and Program Labels

- Admin and Dashboard RPC events include nullable `program_key` / `program_label`. The metadata retains participating programs for shared lessons; the key identifies the representative source, not the entire group. Per user request, admin cards and Dashboard summaries do not display program badges (國中部／中港總部／合班).
- `supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql` groups training locations by date, physical `venue_id`, normalized start time and trimmed course title. Use the latest end time. Different titles/times/dates/venues, unknown venue IDs and archived sources remain separate. Do not apply this rule to matches or manual schedules.
- The private slot resolver drives candidate listing, save validation and source reconciliation. A unique constraint plus transaction advisory lock prevents duplicate writes. Track every source venue ID; deleting a representative source reanchors the shared schedule, and only deleting the final source removes it. A split keeps coaches on the original lesson and leaves the moved candidate unassigned.
- Merge coach sets and notes, preserving original events and assignments in private audit. Keep the oldest event ID. Conflicting statuses remain scheduled if any merged event was scheduled; originals remain auditable. Do not rewrite player assignments, attendance or billing.
- An already-saved candidate rejects stale create requests unless the payload is an identical retry. The frontend sends the saved `updated_at` on edits to reject stale revisions. Older clients without revisions retain their existing edit behavior; do not claim all stale edits are protected until the frontend is deployed.
- The earlier `20260924043936_coach_schedule_program_source_integrity.sql` repaired invalid source links; its per-program split and per-source cleanup have been superseded by the shared-slot migration.
- The one-time repair relinks only a unique replacement in the SAME session with identical date, time, title and location and no existing saved target. Unmatched legacy records become manual schedules, preserving event IDs, original source IDs for traceability, notes and coach assignments.
- SQL regression: `pnpm test:coach-schedules:sql` runs both historical source repair and current shared-slot cases in isolated PGlite. It never connects to production.

## Candidate Rules

- Training date candidates come from `get_training_month_dates()`, so `/training-dates` remains the source of truth for which dates are training days.
- If a date has `training_location_session_venues`, those venue blocks are the candidates for that day; do not also show the generic `週六訓練` candidate.
- Saved `training_location` schedule events keep coach assignments and schedule notes, but source fields (`schedule_date`, time range, title, location, and location URL) must stay synced from `training_location_session_venues` / `training_location_sessions`.
- `matches.match_level = '特訓課'` is shown as `training_class`; other `matches` rows are shown as `match`.
- Match and training-class schedules use `matches.id` as the source identity. Do not deduplicate them by date or title. Database triggers validate the source, cascade schedule cleanup after match deletion, and keep `source_type` aligned when `match_level` changes.
- `matches.coaches` is only reference text for admins. Do not use it for Dashboard ownership or permission checks.
- Manual schedule events are allowed for exceptions, but should still save through the RPC and assign profile IDs.

## Safety Rules

- Frontend route guards and `permissionsStore.can()` are UX only. RLS and security definer RPCs are the real data boundary.
- Do not directly write `coach_schedule_events` or `coach_schedule_assignments` from frontend code; use `coachSchedulesApi`.
- Do not remove or bypass the match-source integrity triggers in `supabase_zzz_coach_schedule_match_source_integrity_migration.sql`. A calendar sync may recreate a deleted match with a new UUID, so the old UUID's saved schedule must be removed when the source match is deleted.
- Do not expose arbitrary profile lists to ordinary users. Coach listing is admin-only through `list_schedulable_coaches()`.
- Do not infer coach identity from display names, nicknames, `team_members`, or comma-separated `matches.coaches`.
- When changing candidate logic, verify interactions with `training_dates`, `training_locations`, `training`, and `matches`.

## Verification

- Targeted tests:
  - `pnpm exec vitest run src/utils/coachSchedules.test.ts src/views/HomeView.test.ts`
- Type check:
  - `pnpm exec vue-tsc --noEmit`
- Build when safe:
  - `pnpm build`
  - Note: this repo's build updates `public/version.json`; do not run it if that would overwrite unrelated dirty version changes.
