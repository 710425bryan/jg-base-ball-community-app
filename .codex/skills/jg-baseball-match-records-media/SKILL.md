---
name: jg-baseball-match-records-media
description: "Match records, schedule detail, lineup, media, live controller, audio transcription, lineup photo parsing, weather, geocoding, and match reminder workflow for jg-base-ball-community-app. Use when changing /calendar, /match-records, /my-records match detail behavior, matchesApi, match-records components, MatchFormDialog, MatchDetailDialog, MatchLineupTab, MatchAudioRecorder, MatchLiveController, parse-lineup, transcribe-match-audio, resolve-location, weatherApi, matches-photos storage, match reminders, or match media utilities."
---

# JG Baseball Match Records Media

## Overview

用這個 skill 處理賽程詳情、比賽紀錄、陣容、照片、即時比賽控制、語音轉紀錄、陣容照片解析、天氣與地理解析。Google Calendar / iCal 匯入仍優先讀 `jg-baseball-match-calendar-sync`，但匯入後的比賽紀錄與媒體流程讀本 skill。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「賽事與比賽紀錄」
3. `docs/FILE_MAP.md`
4. `docs/EDGE_FUNCTIONS.md`
5. `src/views/CalendarView.vue`
6. `src/views/MatchRecordsView.vue`
7. `src/views/MyPlayerRecordsView.vue`
8. `src/services/matchesApi.ts`
9. `src/services/matchLeaveAbsences.ts`
10. `src/services/matchAudioApi.ts`
11. `src/services/weatherApi.ts`
12. `src/stores/matches.ts`
13. `src/types/match.ts`
14. `src/utils/matchRecordStats.ts`、`src/utils/matchFieldEditor.ts`、`src/utils/liveMatchScoreboard.ts`、`src/utils/matchAudioTranscription.ts`、`src/utils/matchAudioDraftStore.ts`、`src/utils/lineupPhotoParser.ts`、`src/utils/matchReminderNotification.ts`、`src/utils/matchReminderSchedule.ts`、`src/utils/matchCalendarCopy.ts`、`src/utils/matchLeaveAbsences.ts`
15. `src/components/match-records/*`
16. `supabase/functions/parse-lineup/index.ts`、`supabase/functions/transcribe-match-audio/index.ts`、`supabase/functions/resolve-location/*`、`supabase/functions/send-match-reminders/index.ts`
17. 若改 Google Calendar / iCal parser，再讀 `jg-baseball-match-calendar-sync` skill
18. 若改比賽費金額、付款或 `match_fee_items`，再讀 `jg-baseball-finance-payments` skill

## 功能邊界

- `matchesApi` 封裝 `matches` CRUD，保留 schema cache 欄位缺失 fallback。
- `/calendar` 顯示賽程並用 `?match_id=` 開啟 `MatchDetailDialog`。
- `/match-records` 是後台比賽紀錄管理，feature key 為 `matches`。
- `/match-records` 的「未來賽事」手動通知與「提醒排程」只顯示給 `matches:EDIT` 使用者，前端走 `src/services/matchReminderNotifications.ts` 呼叫 `send-match-reminders`、提醒排程 RPC 或 ADMIN 健康狀態 RPC。
- 賽事提醒排程是全站共用多組規則，設定存在 `system_settings.match_reminder_schedule_config`，自動排程由 `send-match-reminders` 每分鐘依 Asia/Taipei 判斷到期規則；健康檢查使用 `get_match_reminder_health_status()` 與 `matches:HEALTH_ALERT` targeted event，只通知 active `ADMIN`，不自動補發。
- `/my-records` 透過 `myPlayerRecords` RPC 讀 linked member 可見紀錄，不直接使用後台 `matchesApi` 列表。
- 比賽照片使用 `matches-photos` bucket。
- 今日 / 未來賽事的假單同步請假列走 `matchLeaveAbsences` service 與 `supabase_match_leave_absences_migration.sql`，只管理 `matches.absent_players` 中 `source = 'leave_request'` 的列。
- 陣容照片解析走 `parse-lineup` Edge Function 與 `lineupPhotoParser` 前處理。
- 比賽語音轉紀錄走 `transcribe-match-audio` Edge Function、`matchAudioApi`、`matchAudioTranscription` 與 IndexedDB draft store。
- 天氣預報走 `weatherApi`，地點解析優先呼叫 `resolve-location` Edge Function，再使用本地 fallback。

## 不可破壞規則

- 賽事提醒 URL 統一使用 `/calendar?match_id=<id>`；舊 `/match-records?match_id=...` 要由 push deep link 正規化到 `/calendar`。
- 手動賽事通知的通知中心事件仍使用 `matches` + `REMINDER`，但 event key 要與每日排程提醒分開，避免手動通知擋掉隔天自動提醒。
- `matches:VIEW` 只代表後台紀錄可見性；個人成績頁可見性由 linked member RPC 控制。
- 上傳照片、語音檔或 AI 解析結果時，不要繞過使用者權限檢查。
- `parse-lineup` 與 `transcribe-match-audio` 使用 service role 時，要先驗證 bearer token 使用者，再以 user scoped client 檢查 `matches:CREATE` 或 `matches:EDIT`。
- AI 解析不可把未在照片或語音中明確出現的球員硬塞進結果；未匹配球員要走 unresolved flow。
- 假單同步請假列不可刪除手動請假列；刪除 / 修改假單後，今日與未來賽事的自動列必須可移除並讓比賽費重算。
- 修改 `matches` 欄位時，同步更新 type、service select / payload、form dialog、grid/table/detail、相關 test 與 migration。
- 修改天氣或地點解析時，避免讓外部 API 失敗造成首頁或賽程頁崩潰；保留 fallback。

## 工作流程

1. 判斷修改點是賽程列表、後台紀錄、個人成績、陣容、照片、語音、即時比賽、天氣或提醒。
2. 先讀 service/type/utils，再讀對應 component，避免只改 template 而漏掉 normalize。
3. 若碰到 Edge Function，補讀 `docs/EDGE_FUNCTIONS.md` 的 env 與 auth 規則。
4. 若碰到 storage，檢查 bucket policy、壓縮 / 預覽元件與 public URL 使用方式。
5. 若碰到提醒或 click target，補讀 `jg-baseball-push-notifications` skill。
6. 若碰到 Google Calendar 匯入欄位，補讀 `jg-baseball-match-calendar-sync` skill。

## 驗證

- 基本檢查：`pnpm exec vue-tsc --noEmit`
- 賽事 API：`pnpm exec vitest run src/services/matchesApi.test.ts`
- 陣容 / 即時 / 語音：`pnpm exec vitest run src/utils/matchFieldEditor.test.ts src/utils/liveMatchScoreboard.test.ts src/utils/matchAudioTranscription.test.ts src/utils/lineupPhotoParser.test.ts`
- 賽事提醒 / 天氣：`pnpm exec vitest run src/utils/matchReminderNotification.test.ts src/services/weatherApi.test.ts supabase/functions/resolve-location/logic.test.ts`
- UI 或媒體流程風險高時跑：`pnpm build`
