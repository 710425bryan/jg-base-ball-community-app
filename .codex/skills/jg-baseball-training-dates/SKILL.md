---
name: jg-baseball-training-dates
description: "Monthly training date and training program settings workflow for jg-base-ball-community-app. Use when changing 訓練項目設定、訓練日期設定、/training-program-settings、/training-dates、training_program_settings、training_month_date_settings、get_training_month_dates、save_training_month_dates、個人首頁本月訓練日期、或 send-training-date-notifications。"
---

# JG Baseball Training Dates Workflow

## Overview

用這個 skill 處理訓練項目設定與每月訓練日期設定。此功能只管理「哪個 program 預設在哪天 / 哪些月份日期是訓練日」，不取代 `/training-locations` 的場地與人員配置。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「訓練日期設定」
3. `docs/FILE_MAP.md`
4. `src/views/TrainingProgramSettingsView.vue`
5. `src/views/TrainingDatesView.vue`
6. `src/services/trainingProgramsApi.ts`
7. `src/services/trainingDatesApi.ts`
8. `src/utils/trainingPrograms.ts`
9. `src/utils/trainingMonthDates.ts`
10. `src/utils/trainingDateNotification.ts`
11. `supabase_training_dates_migration.sql`
12. `supabase_zzzzzzzzzzzzzzzzzz_training_program_scope_migration.sql`
13. `supabase/functions/send-training-date-notifications/index.ts`
14. 若改首頁呈現，再讀 `src/services/myHome.ts`、`src/types/myHome.ts`、`src/components/home/MyHomeTodayPanel.vue`

## 功能邊界

- 後台路由為 `/training-program-settings` 與 `/training-dates`。
- feature key 為 `training_dates`，actions 為 `VIEW / EDIT`。
- `training_program_settings` 管理 program 名稱、舊資料 `team_group` fallback、預設星期、時間與場地；執行時不可把週六 / 週日、時間或場地寫死在畫面邏輯。
- `role = 校隊` 不新增 DB 角色；中港 / 新泰身分優先存於 `team_members.training_program`，`team_group` 只作所屬群組（熊隊）使用。舊資料沒有 `training_program` 時才以 `team_group = 國中校隊` 對應 program，找不到對應時校隊與計次月費成員 fallback 到中港總部 program。
- 資料表 `training_month_date_settings` 以 `(month_start, program_key)` 管理每個 program 的月份日期。
- 未設定月份依該 program 的 `default_weekdays` 顯示預設訓練日。
- `ensure_training_month_date_setting()` 會在沒有設定時建立該 program 月份預設；DB cron `training-month-date-defaults-daily` 於台灣時間每日 00:05 執行，換月後自動補當月設定，不覆蓋手動設定，也不發通知。
- 個人首頁依 linked member program 顯示當月份訓練日期；場地配置仍由 `/training-locations` 管理並顯示在既有本週場地區塊。

## 通知規則

- 只有訓練日期新增或取消時才發送通知。
- 通知由 `send-training-date-notifications` 發給該 program 綁定有效球員 / 校隊的有效 profiles。
- event key 與 dashboard link 必須帶 `program_key`，避免中港與國中同月異動互相去重或高亮錯誤。
- 通知事件寫入 `push_dispatch_events`，feature/action 為 `training_dates:VIEW`，且必須填入 `target_user_id` 與 `target_member_ids`。
- 通知中心只能顯示 `target_user_id = auth.uid()` 的訓練日期通知。

## 驗證

- `pnpm exec vitest run src/utils/trainingPrograms.test.ts src/utils/trainingMonthDates.test.ts src/components/home/MyHomeTodayPanel.test.ts src/composables/useNotificationFeed.test.ts`
- `pnpm exec vue-tsc --noEmit`
- `pnpm build`
