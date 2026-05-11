---
name: jg-baseball-match-records-media
description: "Match records, schedule detail, lineup, media, live controller, audio transcription, lineup photo parsing, weather, geocoding, and match reminder workflow for jg-base-ball-community-app. Use when changing /calendar, /match-records, /my-records match detail behavior, matchesApi, match-records components, MatchFormDialog, MatchDetailDialog, MatchLineupTab, MatchAudioRecorder, MatchLiveController, parse-lineup, transcribe-match-audio, resolve-location, weatherApi, matches-photos storage, match reminders, or match media utilities."
---

# JG Baseball Match Records Media

## Overview

用這個 skill 處理賽程詳情、比賽紀錄、陣容、照片、即時比賽控制、語音轉紀錄、陣容照片解析、天氣與地理解析。Google Calendar / iCal 匯入仍優先讀 `jg-baseball-match-calendar-sync`，但匯入後的比賽紀錄與媒體流程讀本 skill。

## 必讀檔案

1. `AGENT.md`
2. `docs/PROJECT_LOGIC.md` 的「賽事與比賽紀錄」
3. `docs/FILE_MAP.md`
4. `docs/EDGE_FUNCTIONS.md`
5. `src/views/CalendarView.vue`
6. `src/views/MatchRecordsView.vue`
7. `src/views/MyPlayerRecordsView.vue`
8. `src/services/matchesApi.ts`
9. `src/services/matchAudioApi.ts`
10. `src/services/weatherApi.ts`
11. `src/stores/matches.ts`
12. `src/types/match.ts`
13. `src/utils/matchRecordStats.ts`、`src/utils/matchFieldEditor.ts`、`src/utils/liveMatchScoreboard.ts`、`src/utils/matchAudioTranscription.ts`、`src/utils/matchAudioDraftStore.ts`、`src/utils/lineupPhotoParser.ts`、`src/utils/matchReminderNotification.ts`、`src/utils/matchCalendarCopy.ts`
14. `src/components/match-records/*`
15. `supabase/functions/parse-lineup/index.ts`、`supabase/functions/transcribe-match-audio/index.ts`、`supabase/functions/resolve-location/*`、`supabase/functions/send-match-reminders/index.ts`
16. 若改 Google Calendar / iCal parser，再讀 `jg-baseball-match-calendar-sync` skill
17. 若改比賽費金額、付款或 `match_fee_items`，再讀 `jg-baseball-finance-payments` skill

## 功能邊界

- `matchesApi` 封裝 `matches` CRUD，保留 schema cache 欄位缺失 fallback。
- `/calendar` 顯示賽程並用 `?match_id=` 開啟 `MatchDetailDialog`。
- `/match-records` 是後台比賽紀錄管理，feature key 為 `matches`。
- `/my-records` 透過 `myPlayerRecords` RPC 讀 linked member 可見紀錄，不直接使用後台 `matchesApi` 列表。
- 比賽照片使用 `matches-photos` bucket。
- 陣容照片解析走 `parse-lineup` Edge Function 與 `lineupPhotoParser` 前處理。
- 比賽語音轉紀錄走 `transcribe-match-audio` Edge Function、`matchAudioApi`、`matchAudioTranscription` 與 IndexedDB draft store。
- 天氣預報走 `weatherApi`，地點解析優先呼叫 `resolve-location` Edge Function，再使用本地 fallback。

## 不可破壞規則

- 賽事提醒 URL 統一使用 `/calendar?match_id=<id>`；舊 `/match-records?match_id=...` 要由 push deep link 正規化到 `/calendar`。
- `matches:VIEW` 只代表後台紀錄可見性；個人成績頁可見性由 linked member RPC 控制。
- 上傳照片、語音檔或 AI 解析結果時，不要繞過使用者權限檢查。
- `parse-lineup` 與 `transcribe-match-audio` 使用 service role 時，要先驗證 bearer token 使用者，再以 user scoped client 檢查 `matches:CREATE` 或 `matches:EDIT`。
- AI 解析不可把未在照片或語音中明確出現的球員硬塞進結果；未匹配球員要走 unresolved flow。
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
