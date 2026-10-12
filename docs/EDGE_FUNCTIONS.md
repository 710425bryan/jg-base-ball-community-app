# Edge Functions And Environment

- 誤取消恢復（2026-10-12 DB／Edge 已部署正式）：`restore_match()` 清除目前取消狀態後，原 `sync-match-calendar`／`send-match-reminders` 依既有時間、名單與去重條件重新納入同一場次；不新增恢復推播、不清除原派送事件、不補送過期排程。parser、sync handler 與 reminder handler 已新增取消→恢復→再次取消及既有 eventKey 去重回歸；本輪不新增 Edge 實作或 secret。

- 2026-10-12 正式更新 `send-match-reminders` v24 → v25（ACTIVE、`verify_jwt=true`）：手動取消場次回傳 409；排程與健康檢查先排除取消，建立事件及派送前重新確認，取消／刪除／查詢失敗皆略過。已先部署 `20261012024808_match_cancellation.sql`；沿用既有 bearer／cron secret 驗證，無新增 secret。已交付推播服務的通知不能撤回。隔離 runtime 測試含派送前取消競態，發布說明見 `docs/specs/2026-10-12-match-release.md`。
- 同次發布須更新 `sync-match-calendar`：它引用共用 `googleCalendarParser.ts`，既有已取消場次由原 UID／fallback 配對後一律略過，外部欄位差異不覆蓋原資料，也不阻擋其他正常匯入。前端手動 fallback 與 Edge 預覽／自動同步使用同一規則。
- `sync-match-calendar` 實際 UPDATE 與 optional-column 重試均帶 `cancelled_at IS NULL`，規劃後才取消／刪除而回傳零列時增加 `skipped_count`，不計為更新或補建；缺少取消欄位及真正 DB 錯誤仍失敗。`index.test.ts` 以完整 handler／真 parser 驗證 9 個案例，含 header/body secret、競態、欄位重試、bearer 僅預覽與拒絕未授權。須先部署取消 migration，無新增環境變數。
- 同次正式 `sync-match-calendar` v17 → v18（ACTIVE、`verify_jwt=false`），保留既有 custom-secret／user bearer 驗證並將模式明列於 config。兩支回讀的 9 個 source/runtime 檔與發布候選 `da1424c` 逐字一致。兩支各自 OPTIONS=200、缺少／無效身分=401；提醒 dry-run=200、health checked=true，建立／派送皆為0。只部署這兩支，未更動 secrets、cron 或執行正常提醒／同步。
- 1.1.77 發布時保留的既有問題：部署前 v17 與部署後 v18 的授權 `dry_run` 均回報 Google Calendar 來源讀取失敗（HTTP 500）；本機同一來源可取得有效 102 個 iCal 事件，來源 URL／設定未改。從 2026-10-12 起的 21 場只讀比較顯示，目前 repo 既有 parser 基線會在下次成功同步更新 6 場請假名單；取消保護相對該基線沒有額外 action／payload 差異。當時未執行比較產生的同步計畫，也不能將本機成功視為正式同步成功。上線後結果見 [發布紀錄](specs/2026-10-12-match-release.md)。
- 後續來源修復（Edge v19已部署、前端1.1.78仍為候選）：正式 logs 已定位上游 Google HTTP 429。`calendarSource.ts` 加入 20 秒逾時、2 MiB 上限、完整 VCALENDAR 封套檢查、每 isolate 最多 8 筆的 60 秒有效內容快取／同來源併發合併；429 遵守 Retry-After，缺值冷卻 60 秒。不共用跨 isolate 快取、不繞路重試；來源失敗先中止，回 502／503／504 與安全 error code。成功 log 只存統計，不記來源 URL／參賽者。每次呼叫仍讀最新 DB 及保留取消 UPDATE 條件。v19 ACTIVE、verify_jwt=false，4個來源檔符合候選6edbee2；06:33、06:34、06:37 UTC三次授權dry-run仍為上游429，完整修復BLOCKED，未執行正常同步／合併前端。詳細證據與下一個必要輸入見 [來源修復紀錄](specs/2026-10-12-calendar-source-recovery.md)。

本文件整理 `supabase/functions/` 的 Edge Function、外部服務與環境變數。AI 修改 Edge Function、排程、外部 API、Web Push 或 AI 解析流程前，先讀本檔與對應 skill。

## 讀取規則

1. 先讀 `AGENTS.md`、`docs/PROJECT_LOGIC.md`、`docs/FILE_MAP.md`。
2. 再讀本檔確認 auth、secret、外部服務與回傳 shape。
3. 修改通知類 function 時同步讀 `jg-baseball-push-notifications` skill。
4. 修改付款匯入讀 `jg-baseball-finance-payments` skill。
5. 修改賽事、陣容、語音或天氣讀 `jg-baseball-match-records-media` skill。
6. 不硬編碼 secret、service role key、cron authorization 或 API key。

> 憑證輪替（2026-10-12）：使用者明確選擇換新 VAPID 金鑰並接受重新啟用推播。已移除 `_shared/push.ts` 與報名通知內嵌私鑰，改用 `_shared/webPushConfig.ts` 讀取 secrets；新金鑰已設定至正式 Supabase，前端 public key 納入 1.1.76。105 筆舊訂閱已停用並保留記錄，使用者更新後須在推播設定重新啟用，不能以舊金鑰回復派送。12 支通知函式已部署成功，九支非特訓保留線上行為，只替換金鑰初始化；三支特訓同步套用 VIEW gate。既有 source/Git 歷史仍屬曝露紀錄，不可輸出值。十二支本次通知 function 的 gateway 模式已版本化，保留遠端既有 `verify_jwt`（三支特訓為 true）；既有三支 false 模式只隨本次金鑰部署保留，不表示已全面改造其應用驗證。

## 共用環境變數

| 變數 | 用途 | 使用位置 |
| --- | --- | --- |
| `SUPABASE_URL` | Edge Function 建立 Supabase client | 多數 Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | service role client | 多數 Edge Functions |
| `SUPABASE_ANON_KEY` | user scoped client 權限檢查 | `sync-match-calendar`、`send-match-reminders`、`parse-lineup`、`transcribe-match-audio`、`registration-form-documents` |

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
| `TEAM_MEMBER_OUTBOX_SECRET` | 新球員通知 Outbox worker 驗證 | `process-team-member-notification-outbox` |
| `COACH_LEAVE_OUTBOX_SECRET` | 教練請假 Outbox worker 驗證，需與 Vault 同名用途設定一致 | `process-coach-leave-notification-outbox` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push 金鑰與聯絡識別；只從 Edge secrets 讀取，缺少設定立即拒絕啟動；既有訂閱與前端 public key 必須一致 | `_shared/webPushConfig.ts`（`_shared/push.ts`、`send-training-registration-notifications`）、`process-coach-leave-notification-outbox` |
| `GEMINI_API_KEY` | 陣容照片解析 | `parse-lineup` |
| `GEMINI_LINEUP_MODEL` | 陣容照片解析模型，預設 `gemini-3.1-pro-preview`；既有環境若明確設為舊模型，需同步更新此設定 | `parse-lineup` |
| `OPENAI_API_KEY` | 語音轉文字與結構化紀錄 | `transcribe-match-audio` |
| `OPENAI_TRANSCRIBE_MODEL` | 語音轉文字模型，預設 `gpt-4o-transcribe` | `transcribe-match-audio` |
| `OPENAI_MATCH_AUDIO_LOG_MODEL` | 結構化比賽紀錄模型，預設 `gpt-5.4-mini` | `transcribe-match-audio` |
| `GOOGLE_MAPS_API_KEY` / `GOOGLE_PLACES_API_KEY` / `GOOGLE_GEOCODING_API_KEY` | 地點解析，可任一設定 | `resolve-location` |

## Edge Functions

| 路徑 | 用途 | 主要規則 |
| --- | --- | --- |
| `supabase/functions/send-push-notification/index.ts` | Web Push 派送入口 | bearer user 驗證、feature/action 收件、`eventKey` 去重；單一 explicit target 會同步寫入 `push_dispatch_events.target_user_id`，供付款退回等 targeted 通知進入通知中心 |
| `supabase/functions/_shared/push.ts` | 推播共用 helper | 權限查詢、subscription 讀取、過期 subscription 清理 |
| `supabase/functions/_shared/webPushConfig.ts` | Web Push secrets 初始化 | 只從 VAPID secrets 設定；缺值拒絕啟動且錯誤不包含值；同名測試涵蓋設定讀取、缺值與三支特訓 JWT 設定 |
| `supabase/functions/process-team-member-notification-outbox/index.ts` | 新球員 Outbox worker | secret + JWT；每批 25 events / 100 deliveries、逐裝置派送、6 次重試與 stale lock reclaim |
| `supabase/functions/process-team-member-notification-outbox/logic.ts` | Outbox 重試與 concurrency 純邏輯 | 有 Vitest coverage |
| `supabase/functions/process-coach-leave-notification-outbox/index.ts` | 教練請假新增／修改／取消 Outbox worker | `verify_jwt=true`＋`x-sync-secret`；service-only claim RPC，每批 25 events / 100 deliveries、6 次重試；派送前重查有效帳號、權限、裝置所有權與 enabled；404/410 只清除該使用者過期裝置 |
| `supabase/functions/process-coach-leave-notification-outbox/logic.ts` | 教練請假 worker HTTP handler、派送與重試流程 | `logic.test.ts` 涵蓋拒絕未授權、configuration、失敗重試、取消權限與過期訂閱；SQL 回歸驗證 queue recovery、站內 feed 及 per-user URL |
| `supabase/functions/notify-holiday-theme/index.ts` | 節日主題通知 | 手動需使用者權限，自動需 secret |
| `supabase/functions/notify-holiday-theme/logic.ts` | 節日通知純邏輯 | 有 Vitest coverage |
| `supabase/functions/send-match-reminders/index.ts` | 賽事提醒 | 排程走 `MATCH_REMINDER_SECRET`，每分鐘讀 `match_reminder_schedule_config` 判斷 Asia/Taipei 到期規則；手動單場發送需 bearer user 具 `matches:EDIT`；URL 使用 `/calendar?match_id=...`；自動模式會用 `HEALTH_ALERT` targeted event 通知 active `ADMIN` 排程漏發或派送異常 |
| `supabase/functions/send-training-registration-notifications/index.ts` | 特訓報名開始 / 截止前提醒 | event key 必須穩定；僅有效 `training:VIEW` 帳號／ADMIN，綁定球員不再自動取得收件資格 |
| `supabase/functions/send-training-registration-status-notifications/index.ts` | 單筆特訓報名完成 / 錄取通知 | bearer user 必須有效且具 `training:VIEW`；`submitted` 給另具 `training:EDIT` 管理者，`selected` 保留原報名人／綁定球員範圍，收件者同樣需 VIEW |
| `supabase/functions/send-training-selection-notifications/index.ts` | 特訓錄取名單公布通知 | 手動觸發需有效 `training:VIEW + EDIT`／ADMIN；收件者需有效 `training:VIEW`／ADMIN |
| `supabase/functions/_shared/trainingNotificationAccess.ts` | 特訓通知收件與存取期間共用檢查 | 使用伺服器當下時間，ADMIN 也需有效帳號；同名測試執行三支通知 entry point 的實際查詢與授權函式，不啟動網路或 Web Push |
| `supabase/functions/send-training-date-notifications/index.ts` | 訓練日期異動通知 | bearer user 驗證 `training_dates:EDIT`，只通知 linked users |
| `supabase/functions/send-training-location-notifications/index.ts` | 訓練場地通知 | 排除已請假球員，只通知 linked users |
| `supabase/functions/send-fee-payment-reminders/index.ts` | 收費催繳通知 | 不走排程；`preview/send` 需 bearer user 具 `fees:EDIT` 或 `ADMIN`，`test` 只允許 `ADMIN` 且目標固定為自己，文案取目前管理員綁定球員的未繳帳款；targeted event source 為 `fee_payment_reminder`，URL 使用 `/my-payments` |
| `supabase/functions/send-match-fee-payment-notifications/index.ts` | 保留的比賽費付款通知端點，管理端開放流程不再呼叫 | 直接呼叫時 bearer user 仍需 `fees:EDIT` 或 `ADMIN`；只處理仍為開放的場次與未繳明細，依 `profiles.linked_team_member_ids` 建立 targeted `fees + PAYMENT_REMINDER` 事件並派送 Web Push，URL 使用 `/my-payments`，同次開放以場次、開放時間與帳號去重 |
| `supabase/functions/sync-match-calendar/index.ts` | iCal 賽事同步 | 排程同步走 `MATCH_CALENDAR_SYNC_SECRET`；前端手動解析只允許 bearer user 的 `dry_run` 預覽並檢查 `matches:CREATE/EDIT` |
| `supabase/functions/leave-webhook/index.ts` | 外部請假 webhook | member match、請假 RPC、通知 target 要一致 |
| `supabase/functions/record-fee-remittance/index.ts` | 匯款表單匯入 | secret 驗證、付款資料 normalize、通知去重 |
| `supabase/functions/parse-lineup/index.ts` | 陣容照片 AI 解析 | 預設 Gemini 3.1 Pro Preview，保留 `GEMINI_LINEUP_MODEL` 覆寫；先驗證 bearer user，再用 user client 查 `matches:CREATE/EDIT`；`index.test.ts` 驗證模型請求、JSON 結果及拒絕未授權 |
| `supabase/functions/transcribe-match-audio/index.ts` | 比賽語音轉文字與結構化紀錄 | 先驗證 bearer user，AI 結果需 normalize unresolved players |
| `supabase/functions/resolve-location/index.ts` | 地點 geocoding API | 外部 API 失敗時前端要 fallback |
| `supabase/functions/resolve-location/logic.ts` | 地點解析純邏輯 | 有 Vitest coverage |
| `supabase/functions/registration-form-documents/index.ts` | 報名表範本上傳／刪除與賽事原格式 binary 產檔 | bearer JWT；上傳需 `registration_forms:CREATE`、刪除需 `DELETE`、產檔需 `registration_forms:CREATE + players:EDIT`；產檔另驗證 `event_id + template_id` 關聯並拒絕已截止事件；multipart / Storage key 使用 ASCII 固定檔名，中文原檔名另存 metadata，實際類型由內容與指紋驗證的已知 profile 決定；完整名單只走 user-scoped `list_team_members_for_edit()`，輸出 `no-store` 且不保存 |
| `supabase/functions/registration-form-documents/logic.ts` | OOXML ZIP 安全、已知版型偵測、Excel／Word 映射與照片 relationships | 10 MB 原檔、50 MB 解壓、500 entries；拒絕 macro / OLE / 外部 relationship / 路徑穿越；有 Vitest 與兩份實檔 QA |
| `supabase/functions/registration-form-documents/cobraWordLogic.ts` | 第二屆眼鏡蛇盃 Word 結構辨識與欄位填寫 | 10–14 人、無照片；標題／表頭／18 列／六欄結構檢查；只改目標段落，完整年級分兩行保留文字與原列高，其他過長文字阻擋；原附件 XML fixture 與 10／14 人 Word 全頁 QA |
| `supabase/functions/registration-form-documents/pdfLogic.ts` | 眼鏡蛇盃 PDF 指紋驗證、原頁保留與第 6 頁報名欄位覆寫 | 只接受指定 6 頁 A4 原檔 SHA-256；10–14 人、無照片；完整中文字型以固定官方 URL / SHA-256 取得並快取；有 Vitest 與全頁實檔 render QA |

## 本地注意事項

- 2026-10-12 三支特訓通知的 VIEW gate 已部署；前端 `useNotificationFeed` 同步過濾舊 RPC 回傳的無權限特訓事件，VIEW 撤銷當下即從顯示結果排除特訓快取／新插入事件，刷新時再淘汰已撤權的快取。前端納入 1.1.76；正式部署與權限驗證見 `docs/specs/2026-10-11-training-view-permission.md`。實機推播須在重新啟用訂閱後另外確認。
- 2026-10-05 已將 `qwxzwomzoyfkorbwsscv` 的 `GEMINI_LINEUP_MODEL` 更新為 `gemini-3.1-pro-preview`，並比對遠端設定摘要與預期值的 SHA-256。線上 `parse-lineup` 第 18 版沿用既有環境覆寫，不重新部署；repo 預設值同步更新。6 項 handler 測試、36 項賽事 / 媒體回歸與型別檢查通過；尚未以實際照片驗證 Google API 回應。
- 新球員 Outbox cron 需要 Vault entries：`team_member_outbox_function_url`、`team_member_outbox_authorization`、`team_member_outbox_secret`；最後一項需與 Edge secret `TEAM_MEMBER_OUTBOX_SECRET` 相同。
- 教練請假 cron `coach-leave-notification-outbox-worker` 每分鐘執行；Vault 需 `coach_leave_outbox_function_url`、`coach_leave_outbox_authorization`、`coach_leave_outbox_secret`（對應 Edge `COACH_LEAVE_OUTBOX_SECRET`）。缺設定時保留 pending，不影響假單交易或站內通知。JWT authorization 必須符合目標環境 gateway，不可複製另一專案的 token。
- 教練請假 worker 不引入既有 `_shared/push.ts`，新金鑰不寫 source／SQL。實際發送前仍需完成文件開頭的既有憑證處置與 Secret scan gate；release 順序與測試帳號 smoke 見 `docs/specs/2026-10-02-coach-leave-and-schedule-templates.md`。
- `supabase/functions/send-training-location-reminders/` 目前是空目錄，沒有 `index.ts`，不要當成已部署 function。
- `supabase/functions/deno.json` 與 `supabase/functions/import_map.json` 是 Edge Function runtime 設定，改 import 或 Deno test 時要檢查。
- `registration-form-documents` 使用函式目錄內的 `deno.json` 固定 `fflate`、`@xmldom/xmldom`、`pdf-lib` 與 `@pdf-lib/fontkit` 版本，部署時不可改用未固定版本或共用設定取代。眼鏡蛇盃 PDF 首次產檔會從固定 commit 的 justfont 官方 GitHub URL 下載字型，須通過 SHA-256 驗證後才會在該 cold start 內快取使用。
- `.env` 與 `.env.example` 目前被 `.gitignore` 排除；AI 不應假設 repo 內一定有完整環境變數範本。

## 驗證

- Edge Function 純邏輯：跑對應 `*.test.ts`，例如 `supabase/functions/resolve-location/logic.test.ts`、`supabase/functions/notify-holiday-theme/logic.test.ts` 或 `supabase/functions/process-team-member-notification-outbox/logic.test.ts`。
- 前端呼叫端改動：至少跑 `pnpm exec vue-tsc --noEmit`。
- 通知類改動：人工檢查 `push_dispatch_events` source、event key、target user / member、通知中心與 Web Push URL。

## 1.1.76 通知部署紀錄（2026-10-12）

正式專案 `qwxzwomzoyfkorbwsscv` 的下列函式皆為 ACTIVE；下載的每個檔案 SHA-256 與凍結的部署來源完全相符，無退役私鑰 literal，皆使用 secrets helper。九支非特訓的原始碼以部署前線上版本為底，只替換金鑰初始化，沒有用本機其他功能差異覆蓋線上。

| Function | 部署後版本 | verify_jwt |
| --- | --- | --- |
| `leave-webhook` | 27 | false |
| `send-push-notification` | 27 | false |
| `record-fee-remittance` | 22 | false |
| `send-match-reminders` | 24 | true |
| `send-training-location-notifications` | 11 | true |
| `send-training-registration-notifications` | 11 | true |
| `send-training-selection-notifications` | 14 | true |
| `send-training-date-notifications` | 11 | true |
| `send-fee-payment-reminders` | 10 | true |
| `process-team-member-notification-outbox` | 6 | true |
| `send-match-fee-payment-notifications` | 5 | true |
| `send-training-registration-status-notifications` | 1 | true |

既有 11 支的版本號相對準備 manifest 為 +2，新 status 為 1；CLI 與管理 API 結果一致。發布驗證以實際 ACTIVE 狀態與逐檔 hash 為準，不由版號差推論部署次數。此次未部署 `notify-holiday-theme` 或 `process-coach-leave-notification-outbox`。

部署後 30 項 HTTP 檢查通過：11 支 OPTIONS 200、Outbox 依既有 handler 回 405；9 支 JWT 函式各自的無 Authorization／無效 JWT POST 皆回 401。此驗證只涵蓋冷啟動與 gateway 拒絕，不代替有效使用者完整操作或實機推播；沒有發送測試通知或寫入業務資料。
