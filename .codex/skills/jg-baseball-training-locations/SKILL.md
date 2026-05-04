---
name: jg-baseball-training-locations
description: "Training venue and player assignment workflow for jg-base-ball-community-app. Use when changing 場地與人員配置、/training-locations、training_venues、training_location_sessions、training_location_assignments、個人首頁本週訓練場地、或 send-training-location-notifications。"
---

# JG Baseball Training Locations Workflow

## Overview

用這個 skill 處理一般練習與特訓都可用的場地與人員配置。此功能獨立於 `/training` 報名點數流程，重點是多場地分組、個人首頁可見性、以及指定球員/家長通知。

## 必讀檔案

1. `AGENT.md`
2. `docs/PROJECT_LOGIC.md` 的「場地與人員配置」
3. `docs/FILE_MAP.md`
4. `src/views/TrainingLocationsView.vue`
5. `src/services/trainingLocationsApi.ts`
6. `src/types/trainingLocation.ts`
7. `src/utils/trainingLocationNotification.ts`
8. `supabase_training_locations_migration.sql`
9. `supabase/functions/send-training-location-notifications/index.ts`
10. 若改首頁呈現，再讀 `src/services/myHome.ts`、`src/types/myHome.ts`、`src/components/home/MyHomeTodayPanel.vue`

## 功能邊界

- 常用場地存在 `training_venues`。
- 訓練主檔存在 `training_location_sessions`，可為一般練習或特訓，不依賴 `matches` 或 `attendance_events`。
- 多場地區塊存在 `training_location_session_venues`。
- 球員指派存在 `training_location_assignments`，同一訓練同一球員只能被指派一次。
- 個人首頁只顯示登入者 linked member 的本週已發布配置。

## 權限規則

- feature key：`training_locations`。
- actions：`VIEW / CREATE / EDIT / DELETE`。
- 前端 route guard、按鈕顯示與資料 RPC 都要檢查同一組 feature/action。
- 個人首頁可見性不靠 `training_locations:VIEW`，只靠 `profiles.linked_team_member_ids`。

## 通知規則

- 自動通知由 `send-training-location-notifications` 在台灣時間前一天 20:10 執行。
- 手動通知走同一支 Edge Function。
- 只通知該球員 linked 的有效 profiles；同一 profile 綁多名球員時合併成一則通知。
- 當天已請假的球員必須排除通知，請假判斷使用 `leave_requests.start_date <= training_date <= end_date`。
- `push_dispatch_events` 需寫入 `target_user_id` 與 `target_member_ids`，通知中心只能顯示 `target_user_id = auth.uid()` 的場地通知。
- event key 使用 session、target user、session updated_at 組成，避免同一版本重複發送。

## 驗證

- `pnpm exec vitest run src/utils/trainingLocationNotification.test.ts src/composables/useNotificationFeed.test.ts`
- `pnpm exec vue-tsc --noEmit`
- 人工檢查無權限 route guard、有權限新增/發布/手動通知、個人首頁 linked member 本週場地、請假球員不通知。
