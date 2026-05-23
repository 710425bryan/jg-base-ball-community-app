---
name: jg-baseball-training-dates
description: "Monthly training date settings workflow for jg-base-ball-community-app. Use when changing 訓練日期設定、/training-dates、training_month_date_settings、get_training_month_dates、save_training_month_dates、個人首頁本月訓練日期、或 send-training-date-notifications。"
---

# JG Baseball Training Dates Workflow

## Overview

用這個 skill 處理每月訓練日期設定。此功能只管理「哪幾天是訓練日」，不取代 `/training-locations` 的場地與人員配置。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「訓練日期設定」
3. `docs/FILE_MAP.md`
4. `src/views/TrainingDatesView.vue`
5. `src/services/trainingDatesApi.ts`
6. `src/utils/trainingMonthDates.ts`
7. `src/utils/trainingDateNotification.ts`
8. `supabase_training_dates_migration.sql`
9. `supabase/functions/send-training-date-notifications/index.ts`
10. 若改首頁呈現，再讀 `src/services/myHome.ts`、`src/types/myHome.ts`、`src/components/home/MyHomeTodayPanel.vue`

## 功能邊界

- 後台路由為 `/training-dates`。
- feature key 為 `training_dates`，actions 為 `VIEW / EDIT`。
- 資料表為 `training_month_date_settings`，每筆代表一個月份。
- 未設定月份預設顯示該月所有星期六。
- `ensure_training_month_date_setting()` 會在沒有設定時建立該月預設週六；DB cron `training-month-date-defaults-daily` 於台灣時間每日 00:05 執行，換月後自動補當月設定，不覆蓋手動設定，也不發通知。
- 個人首頁一次顯示當月份全部訓練日期；場地配置仍由 `/training-locations` 管理並顯示在既有本週場地區塊。

## 通知規則

- 只有訓練日期新增或取消時才發送通知。
- 通知由 `send-training-date-notifications` 發給綁定有效球員 / 校隊的有效 profiles。
- 通知事件寫入 `push_dispatch_events`，feature/action 為 `training_dates:VIEW`，且必須填入 `target_user_id` 與 `target_member_ids`。
- 通知中心只能顯示 `target_user_id = auth.uid()` 的訓練日期通知。

## 驗證

- `pnpm exec vitest run src/utils/trainingMonthDates.test.ts src/components/home/MyHomeTodayPanel.test.ts src/composables/useNotificationFeed.test.ts`
- `pnpm exec vue-tsc --noEmit`
- `pnpm build`
