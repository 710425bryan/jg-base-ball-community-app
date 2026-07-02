---
name: jg-baseball-roster-users-team-groups
description: "Player roster, users, profile binding, team groups, roster cache, sensitive member fields, and account access workflow for jg-base-ball-community-app. Use when changing PlayersView, UsersView, TeamGroupSettingsDialog, playerRoster store, teamGroups store, playerRosterApi, teamGroupsApi, profileAccess, team_members, team_members_safe, profiles, linked_team_member_ids, joined_date, team_group, app roles shown in roster/user flows, or sensitive fields national_id, guardian_phone, contact_line_id."
---

# JG Baseball Roster Users Team Groups

## Overview

用這個 skill 處理球員名單、使用者管理、profile 綁定、team group 設定、名單快取與敏感欄位。Google Form / Sheet 匯入規則仍讀 `jg-baseball-player-sync`，但日常 roster / users / team groups 維護讀本 skill。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「球員、使用者與角色權限」
3. `docs/FILE_MAP.md`
4. `src/views/PlayersView.vue`
5. `src/views/UsersView.vue`
6. `src/components/players/TeamGroupSettingsDialog.vue`
7. `src/components/RolePermissionsManager.vue`
8. `src/stores/playerRoster.ts`
9. `src/stores/teamGroups.ts`
10. `src/services/playerRosterApi.ts`
11. `src/services/teamGroupsApi.ts`
12. `src/utils/playerSync.ts`、`src/utils/profileAccess.ts`、`src/utils/teamGroups.ts`
13. `src/types/teamGroup.ts`
14. 相關 migration：`supabase_team_members_cache_meta_migration.sql`、`supabase_team_group_settings_migration.sql`、`supabase_team_group_settings_reorder_migration.sql`、`supabase_team_group_settings_create_rpc_hotfix.sql`、`supabase_team_group_rename_migration.sql`、`supabase_team_group_non_player_cleanup_migration.sql`、`supabase_profiles_binding_last_seen_migration.sql`
15. 若改 Google Form / Sheet 同步，再讀 `jg-baseball-player-sync` skill
16. 若改 role / feature / action，再讀 `jg-baseball-auth-permissions` skill

## 功能邊界

- 球員主檔存在 `team_members`。
- 非敏感展示名單優先使用 `team_members_safe` 或安全 RPC。
- 名單 cache meta 使用 `get_team_members_cache_meta()`，只回 row count / latest changed at。
- 使用者主檔存在 `profiles`，綁定球員使用 `profiles.linked_team_member_ids`。
- 使用者新增 / 更新 / 刪除優先走 `admin_insert_profile()`、`admin_update_profile()`、`admin_delete_user()`。
- team group 設定透過 `team_group_settings` 與 `teamGroupsApi` RPC 管理，前端共用 `teamGroups` store。
- team group 只適用在 eligible role，非球員類角色不應保留無效分組。
- 球員年級存在 `team_members.grade`；新增 / 空值時依 `birth_date` 預設，出生日期 9 月 2 日以後晚一屆，名單年級每年 6 月 19 日由 DB 排程自動升級，表單可手動調整。
- 球員名單的 U-level 標籤由 `src/utils/playerULevel.ts` 依 `birth_date` 和今年生日是否已到計算；不使用 `grade`、9 月 2 日入學切點或 `is_early_enrollment`。

## 不可破壞規則

- 敏感欄位包含 `national_id`、`guardian_phone`、`contact_line_id`；除非流程需要完整個資且 DB 權限一致，否則不直接擴散。
- `team_members_safe` 是預設展示來源；不要為了表格方便改回 raw `team_members`。
- linked member 綁定會影響 `/my-records`、`/my-payments`、`/my-leave-requests`、`/training`、`/equipment-addons` 與個人首頁。
- Google 同步不得覆蓋人工維護欄位：`is_primary_payer`、`is_half_price`、`fee_billing_mode`、既有 `joined_date`、既有 `grade`。
- `fee_billing_mode` 可為 `role_default`、`monthly_fixed`、`monthly_per_session`、`no_fee`；新增球員預設 `role_default`，既有球員同步不得覆蓋人工設定。
- 刪除或改名 team group 前要確認轉移規則，避免球員留在不存在的組別。
- 角色權限 UI 與 roster/users 管理要保持 `app_roles`、`app_role_permissions` 一致。

## 工作流程

1. 判斷修改點是球員欄位、名單顯示、使用者 profile、綁定成員、team group、快取或權限 UI。
2. 先確認是否需要 raw `team_members`；若只是顯示或選項，優先走 `team_members_safe`。
3. 若改球員欄位，同步更新 form、table/card、type normalize、player sync 保護欄位與 migration。
4. 若改使用者綁定，同步檢查所有個人功能是否依 linked member 正確限制。
5. 若改 team group，同步檢查 `PlayersView`、`TrainingView`、`TrainingLocationsView`、`LeaveRequestsView`、`RollCallView` 的分組選項。
6. 若改 cache meta，確認更新 trigger 與 `playerRoster` store invalidation 行為。

## 驗證

- 基本檢查：`pnpm exec vue-tsc --noEmit`
- 名單同步 / 快取 / 組別：`pnpm exec vitest run src/utils/playerSync.test.ts src/stores/playerRoster.test.ts src/stores/teamGroups.test.ts`
- 使用者可登入狀態：`pnpm exec vitest run src/utils/profileAccess.test.ts src/stores/auth.test.ts`
- 人工 sanity check：完整個資權限、linked member 個人功能、team group 新增/改名/排序/刪除轉移、Google sync 不覆蓋人工欄位。
