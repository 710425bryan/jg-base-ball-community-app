---
name: jg-baseball-training-locations
description: "Training venue and player assignment workflow for jg-base-ball-community-app. Use when changing 場地與人員配置、/training-locations、training_venues、training_location_sessions、training_location_assignments、個人首頁本週訓練場地、或 send-training-location-notifications。"
---

# JG Baseball Training Locations Workflow

## Overview

用這個 skill 處理一般練習與特訓都可用的場地與人員配置。此功能獨立於 `/training` 報名點數流程，重點是多場地分組、個人首頁可見性、以及指定球員/家長通知。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「場地與人員配置」
3. `docs/FILE_MAP.md`
4. `src/views/TrainingLocationsView.vue`
5. `src/services/trainingLocationsApi.ts`
6. `src/types/trainingLocation.ts`
7. `src/utils/trainingLocationNotification.ts`
8. `supabase_training_locations_migration.sql`
9. 若改連動點名，再讀 `supabase_zzzzzzzzz_training_location_attendance_migration.sql`、`src/views/AttendanceListView.vue`、`src/views/RollCallView.vue`
10. `supabase/functions/send-training-location-notifications/index.ts`
11. 若改首頁呈現，再讀 `src/services/myHome.ts`、`src/types/myHome.ts`、`src/components/home/MyHomeTodayPanel.vue`

## 功能邊界

- 常用場地存在 `training_venues`。
- 訓練主檔存在 `training_location_sessions`，可為一般練習或特訓；若建立連動點名，會透過 `attendance_events.training_location_session_id` / `training_location_session_venue_id` 串到現有點名系統。
- 多場地區塊存在 `training_location_session_venues`。
- 球員指派存在 `training_location_assignments`，同一訓練同一球員只能被指派一次。
- 個人首頁只顯示登入者 linked member 的本週已發布配置。
- 每個場地區塊各自建立一張點名單，點名名單以該場地最新 `training_location_assignments` 為準，不帶入全隊或其他場地球員。

## 權限規則

- feature key：`training_locations`。
- actions：`VIEW / CREATE / EDIT / DELETE`。
- 前端 route guard、按鈕顯示與資料 RPC 都要檢查同一組 feature/action。
- 個人首頁可見性不靠 `training_locations:VIEW`，只靠 `profiles.linked_team_member_ids`。
- 建立場地配置點名單需 `training_locations:EDIT` + `attendance:CREATE`；開啟與操作點名單仍依 `attendance:VIEW / EDIT / DELETE`。

## 通知規則

- 自動通知由 `send-training-location-notifications` 在台灣時間前一天 20:10 執行。
- 手動通知走同一支 Edge Function。
- 只通知該球員 linked 的有效 profiles；同一 profile 綁多名球員時合併成一則通知。
- 當天已請假的球員只有在假單時段與場地訓練時間重疊時才排除通知 / 標示已請假；場地與 session 都沒有開始 / 結束時間、或使用預設上午時間 `09:00 - 12:30` 時，請假判斷收斂為上午區段，下午假不排除上午場地。
- `push_dispatch_events` 需寫入 `target_user_id` 與 `target_member_ids`，通知中心只能顯示 `target_user_id = auth.uid()` 的場地通知。
- event key 使用 session、target user、session updated_at 組成，避免同一版本重複發送。

## 驗證

- `pnpm exec vitest run src/utils/trainingLocationNotification.test.ts src/composables/useNotificationFeed.test.ts`
- `pnpm exec vue-tsc --noEmit`
- 人工檢查無權限 route guard、有權限新增/發布/手動通知、多場地可個別建立點名單且只含該場地球員、修改配置後該場地點名名單同步、個人首頁 linked member 本週場地、請假球員不通知。
