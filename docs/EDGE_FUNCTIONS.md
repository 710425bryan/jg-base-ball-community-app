# Edge Functions And Environment

本文件整理 `supabase/functions/` 的 Edge Function、外部服務與環境變數。AI 修改 Edge Function、排程、外部 API、Web Push 或 AI 解析流程前，先讀本檔與對應 skill。

## 讀取規則

1. 先讀 `AGENTS.md`、`docs/PROJECT_LOGIC.md`、`docs/FILE_MAP.md`。
2. 再讀本檔確認 auth、secret、外部服務與回傳 shape。
3. 修改通知類 function 時同步讀 `jg-baseball-push-notifications` skill。
4. 修改付款匯入讀 `jg-baseball-finance-payments` skill。
5. 修改賽事、陣容、語音或天氣讀 `jg-baseball-match-records-media` skill。
6. 不硬編碼 secret、service role key、cron authorization 或 API key。

## 共用環境變數

| 變數 | 用途 | 使用位置 |
| --- | --- | --- |
| `SUPABASE_URL` | Edge Function 建立 Supabase client | 多數 Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | service role client | 多數 Edge Functions |
| `SUPABASE_ANON_KEY` | user scoped client 權限檢查 | `sync-match-calendar`、`parse-lineup`、`transcribe-match-audio` |

## Function 專用環境變數

| 變數 | 用途 | 使用位置 |
| --- | --- | --- |
| `FORM_REMITTANCE_SECRET` | Google Form 匯款 webhook 驗證 | `record-fee-remittance` |
| `HOLIDAY_THEME_SECRET` | 節日主題自動通知驗證 | `notify-holiday-theme` |
| `MATCH_REMINDER_SECRET` | 賽事提醒排程驗證 | `send-match-reminders` |
| `MATCH_CALENDAR_SYNC_SECRET` | 賽事日曆同步排程驗證 | `sync-match-calendar` |
| `MATCH_CALENDAR_ICAL_URL` | 預設 iCal 來源 | `sync-match-calendar` |
| `TRAINING_NOTIFICATION_SECRET` | 特訓報名通知排程驗證 | `send-training-registration-notifications` |
| `TRAINING_SELECTION_NOTIFICATION_SECRET` | 特訓錄取通知驗證 | `send-training-selection-notifications` |
| `TRAINING_LOCATION_NOTIFICATION_SECRET` | 場地通知排程驗證 | `send-training-location-notifications` |
| `GEMINI_API_KEY` | 陣容照片解析 | `parse-lineup` |
| `GEMINI_LINEUP_MODEL` | 陣容照片解析模型，預設 `gemini-2.5-pro` | `parse-lineup` |
| `OPENAI_API_KEY` | 語音轉文字與結構化紀錄 | `transcribe-match-audio` |
| `OPENAI_TRANSCRIBE_MODEL` | 語音轉文字模型，預設 `gpt-4o-transcribe` | `transcribe-match-audio` |
| `OPENAI_MATCH_AUDIO_LOG_MODEL` | 結構化比賽紀錄模型，預設 `gpt-5.4-mini` | `transcribe-match-audio` |
| `GOOGLE_MAPS_API_KEY` / `GOOGLE_PLACES_API_KEY` / `GOOGLE_GEOCODING_API_KEY` | 地點解析，可任一設定 | `resolve-location` |

## Edge Functions

| 路徑 | 用途 | 主要規則 |
| --- | --- | --- |
| `supabase/functions/send-push-notification/index.ts` | Web Push 派送入口 | bearer user 驗證、feature/action 收件、`eventKey` 去重 |
| `supabase/functions/_shared/push.ts` | 推播共用 helper | 權限查詢、subscription 讀取、過期 subscription 清理 |
| `supabase/functions/notify-holiday-theme/index.ts` | 節日主題通知 | 手動需使用者權限，自動需 secret |
| `supabase/functions/notify-holiday-theme/logic.ts` | 節日通知純邏輯 | 有 Vitest coverage |
| `supabase/functions/send-match-reminders/index.ts` | 賽事提醒 | URL 使用 `/calendar?match_id=...` |
| `supabase/functions/send-training-registration-notifications/index.ts` | 特訓報名開始 / 截止前提醒 | event key 必須穩定 |
| `supabase/functions/send-training-registration-status-notifications/index.ts` | 單筆特訓報名完成 / 錄取通知 | bearer user 驗證，`submitted` 給 `training:EDIT` 管理者，`selected` 給報名使用者 |
| `supabase/functions/send-training-selection-notifications/index.ts` | 特訓錄取名單公布通知 | 手動觸發需檢查使用者權限 |
| `supabase/functions/send-training-date-notifications/index.ts` | 訓練日期異動通知 | bearer user 驗證 `training_dates:EDIT`，只通知 linked users |
| `supabase/functions/send-training-location-notifications/index.ts` | 訓練場地通知 | 排除已請假球員，只通知 linked users |
| `supabase/functions/sync-match-calendar/index.ts` | iCal 賽事同步 | 排程同步走 `MATCH_CALENDAR_SYNC_SECRET`；前端手動解析只允許 bearer user 的 `dry_run` 預覽並檢查 `matches:CREATE/EDIT` |
| `supabase/functions/leave-webhook/index.ts` | 外部請假 webhook | member match、請假 RPC、通知 target 要一致 |
| `supabase/functions/record-fee-remittance/index.ts` | 匯款表單匯入 | secret 驗證、付款資料 normalize、通知去重 |
| `supabase/functions/parse-lineup/index.ts` | 陣容照片 AI 解析 | 先驗證 bearer user，再用 user client 查 `matches:CREATE/EDIT` |
| `supabase/functions/transcribe-match-audio/index.ts` | 比賽語音轉文字與結構化紀錄 | 先驗證 bearer user，AI 結果需 normalize unresolved players |
| `supabase/functions/resolve-location/index.ts` | 地點 geocoding API | 外部 API 失敗時前端要 fallback |
| `supabase/functions/resolve-location/logic.ts` | 地點解析純邏輯 | 有 Vitest coverage |

## 本地注意事項

- `supabase/functions/send-training-location-reminders/` 目前是空目錄，沒有 `index.ts`，不要當成已部署 function。
- `supabase/functions/deno.json` 與 `supabase/functions/import_map.json` 是 Edge Function runtime 設定，改 import 或 Deno test 時要檢查。
- `.env` 與 `.env.example` 目前被 `.gitignore` 排除；AI 不應假設 repo 內一定有完整環境變數範本。

## 驗證

- Edge Function 純邏輯：跑對應 `*.test.ts`，例如 `supabase/functions/resolve-location/logic.test.ts` 或 `supabase/functions/notify-holiday-theme/logic.test.ts`。
- 前端呼叫端改動：至少跑 `pnpm exec vue-tsc --noEmit`。
- 通知類改動：人工檢查 `push_dispatch_events` source、event key、target user / member、通知中心與 Web Push URL。
