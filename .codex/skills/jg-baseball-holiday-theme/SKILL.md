---
name: jg-baseball-holiday-theme
description: "Holiday theme workflow for jg-base-ball-community-app. Use when adding or changing 節日主題設定、`/holiday-theme-settings`、全站動畫、首頁/後台 hero overlay、橫幅、`holiday_theme_config`、`notify-holiday-theme`、或 `holiday_theme_settings` / `holiday_theme` 權限與通知規則。"
---

# JG Baseball Holiday Theme

## Overview

用這個 skill 處理節日主題 v2 多活動設定、首頁與後台節日視覺、全站動畫、橫幅，以及自動/手動節日推播。這個功能同時碰到公開資料、安全 RPC、權限與通知去重，修改時要把四者一起檢查。

## 讀取順序

1. 先讀 `AGENT.md`。
2. 讀 `src/composables/useHolidayTheme.ts`、`src/utils/holidayMotionLayout.ts`。
3. 讀 `src/views/HolidayThemeSettingsView.vue` 與 `src/components/settings/HolidayThemePreviewStage.vue`。
4. 讀套用點：`src/views/LandingView.vue`、`src/views/HomeView.vue`、`src/App.vue`、`src/layouts/PublicLayout.vue`、`src/layouts/MainLayout.vue`。
5. 若牽涉通知，讀 `supabase/functions/notify-holiday-theme/index.ts`、`logic.ts` 與 `supabase/functions/_shared/push.ts`。
6. 若牽涉 DB，讀最新的節日主題 migration 與 `app_role_permissions` seed。

## Config 規則

- 設定 row 固定為 `system_settings.key = 'holiday_theme_config'`。
- payload 使用 v2 多活動格式，保留欄位：`version`、`activities[]`、`manualEnabled`、`scheduleEnabled`、`scheduleStartAt`、`scheduleEndAt`、`activeTheme`、`playerId`、`playerName`、`title`、`messages`、`ribbonTitle`、`ribbonMessages`、`palette`、`motionPreset`、`showGlobalRibbon`、`notifyOnStart`、`notificationAutoSentAt`。
- `useHolidayTheme` 必須保留 legacy single-theme config 自動轉 v2、Asia/Taipei datetime 解析、最多 4 則文案、第一筆目前生效活動優先、30 秒刷新與 visibility 回前景重讀。
- 主題 alias 要保留：`coaches_birthday -> coach_dai_birthday`、`fireworks_burst -> fireworks_gold`。

## 安全與權限

- 公開頁只能呼叫 `get_public_holiday_theme_config()`，不可直接查 `system_settings`。
- 後台儲存走 `save_holiday_theme_config(jsonb)`，DB 端必須檢查 `holiday_theme_settings:EDIT`。
- 後台頁路由使用 `holiday_theme_settings:VIEW`；儲存與手動補送使用 `holiday_theme_settings:EDIT`。
- 球員下拉只讀非敏感欄位，優先走 `get_holiday_theme_player_options()` 或 `team_members_safe`；不可讀取或暴露身分證、監護人電話、Line ID。
- 節日通知 feature/action 為 `holiday_theme:VIEW`，用來代表全員通知可控開關。

## 通知規則

- 自動模式由 `notify-holiday-theme` Edge Function 處理，以 `x-sync-secret` 驗證排程呼叫。
- 自動通知 event key 固定為 `holiday_theme:auto:<activityId>:<scheduleStartAt>`，送出後要寫回活動的 `notificationAutoSentAt`。
- 手動補送必須驗證登入者具 `holiday_theme_settings:EDIT`；每次確認補送產生新的 request key，event key 為 `holiday_theme:manual:<activityId>:<requestKey>`。
- cron migration 不可硬編碼 URL、authorization 或 secret；改用 `current_setting('app.holiday_theme_function_url')`、`app.holiday_theme_authorization`、`app.holiday_theme_secret`。
- 收件對象由 `_shared/push.ts` 依 `holiday_theme:VIEW` 與啟用中的 web push subscriptions 決定，並排除停權或不在 access window 的 profile。

## UI 套用點

- `LandingView` 與 `HomeView` 的 hero section 掛 `HomeHolidayHeroOverlay`，既有 hero 文字與按鈕要維持較高 z-index。
- `App.vue` 掛 `HolidayThemeSiteEffects`，讓動畫套用全站。
- `PublicLayout` 與 `MainLayout` 在 header/update bar 下方掛 `HolidayThemeRibbon`，不可擋住導覽或主要操作。
- 調整動畫時確認 reduced-motion、手機尺寸、文字不重疊與可關閉橫幅狀態。

## 驗證

- 跑 `pnpm exec vitest run src/composables/useHolidayTheme.test.ts src/utils/holidayMotionLayout.test.ts src/components/layout/__tests__/HolidayThemeRibbon.test.ts src/views/HolidayThemeSettingsView.test.ts supabase/functions/notify-holiday-theme/logic.test.ts`。
- 跑 `pnpm exec vue-tsc --noEmit`。
- 重要 UI 或 build 影響時跑 `pnpm build`。
