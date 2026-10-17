# Migrations

**2026-10-13 隊職員軟刪除（正式 DB 已部署，前端 1.1.80）**

- 本機 `20261013005735` 已於 2026-10-13 09:35 台灣時間依使用者授權套用，工具產生遠端 ledger `20261013013528 / team_member_soft_deletion`；對應 SQL SHA-256 `0172e4cab26d222b32486370da2229269982c9a320811284b5862850621a7857`。不可因版本時間戳不同重跑。無獨立 staging 的替代演練已獲使用者明確同意；隔離正式結構 33 項、安全 post-check 21 項通過，116 位成員與 29 組資料指紋完全一致，未刪除任何真實成員。
- `supabase/migrations/20261013005735_team_member_soft_deletion.sql`：新增獨立刪除時間／操作者／原在隊狀態；`soft_delete_team_member(uuid)` 限有效 `players:DELETE`，鎖列且重送保留原稽核，不刪任何歷史。內部狀態改退隊以沿用現有有效成員排除，前端以 deleted_at 排除全部篩選（含退隊）。safe view 僅追加 deleted_at，保留 invoker／RLS 與財務歷史關聯；raw 客戶端硬刪、修改刪除標記及覆寫已刪列由 invoker trigger 拒絕。migration 不回填或變更既有成員；先部署 DB 再前端。隔離驗證 `pnpm test:players:sql`，發布與查找方式見 [規格](specs/2026-10-13-team-member-soft-deletion.md)。

**2026-10-12 賽事取消／恢復／費用標示 DB 發布紀錄**

三份 migration 已依序套用正式專案 `qwxzwomzoyfkorbwsscv`。MCP 指派的 ledger timestamp 與原始檔名不同，對照如下；保留來源檔名，不因版本不同重跑、改名或 repair history。

| 順序 | Source migration | 正式 ledger version |
| --- | --- | --- |
| 1 | `20261012024808_match_cancellation.sql` | `20261012055931` |
| 2 | `20261012033832_match_restoration_audit.sql` | `20261012055958` |
| 3 | `20261012053334_match_fee_cancellation_status.sql` | `20261012060020` |

部署候選 `da1424c`，合併後 `main` 的 `f668f6f3` 與其 tree 一致。使用者明確同意本次無獨立 staging 的流程例外，以正式 catalog 隔離演練、Preview 與 post-check 替代；部署前確認無 drift，31 支正式函式及 default grants 的 LF／CRLF 演練 616 項、正式 catalog／ACL post-check 304 項通過。既有函式授權、四表政策及金額／付款模型保留；未呼叫正式業務 RPC、建立測試比賽／付款或派送通知。安全 advisor 僅新增預期的 private audit 無 policy 與三支 authenticated definer RPC 提示。多連線業務競態及獨立 Supabase staging 未實測；前端與 Edge 的發布／驗收狀態見 [發布規格](specs/2026-10-12-match-release.md)。本機證據位於 gitignored `output/playwright/match-cancellation/release/`。

- `supabase/migrations/20261012053334_match_fee_cancellation_status.sql`：2026-10-12 已部署正式，ledger 版本 `20261012060020`。新增 `list_match_fee_items_by_month_with_match_status(text)` 包裝現有月份比賽費查詢並補整場取消時間／原因；不改舊 RPC 定義、付款、金額或餘額，沿用舊查詢已有同步。有效帳號與 `fees:VIEW/EDIT` 授權；須接在 `20261012024808_match_cancellation.sql` 及現有比賽費免繳 migration 後。隔離回歸 `tests/database/matchFeeCancellationStatus.integration.mjs --newline-matrix` 納入 `test:payments:sql`。

- `supabase/migrations/20261012033832_match_restoration_audit.sql`：2026-10-12 已部署正式，ledger 版本 `20261012055958`；CLI 產生，必須接在 `20261012024808_match_cancellation.sql` 後。新增 `restore_match(uuid,timestamptz)` 與 private 取消／恢復歷程，收緊雙方向版本及重送；raw DML 不可清除取消、歷程不可覆寫或刪除。恢復重算未繳但不開放繳費，保留付款／免繳／餘額，教練來源依取消快照及最新資格／請假／衝突安全恢復。`tests/database/matchRestoration.integration.mjs` 納入 `test:matches:sql`；詳見 [恢復規格](specs/2026-10-12-match-restoration.md)。

- `supabase/migrations/20261012024808_match_cancellation.sql`：2026-10-12 已部署正式，ledger 版本 `20261012055931`。新增取消稽核欄位／`cancel_match()`、raw DML 保護、未繳費用取消與後續付款防復活、Next Up／個人成績／公開摘要／提醒 feed／教練排班排除取消；保留待審／已付／照片／名單。採目前 catalog 的唯一錨點擴充最新 function body 並保留 owner／ACL／SECURITY／search_path，必要來源不符則整筆中止。取消、開放繳費、費用同步、單場免繳與建立比賽付款各入口均先取共同 advisory lock，再鎖賽事及費用，避免同步關閉開放時與取消形成反序鎖。本次依上述發布紀錄完成三份 DB 更新，相依 Edge／前端狀態見規格。`pnpm test:matches:sql` 取消／恢復 LF／CRLF 共 364 checks 通過；正式 catalog／ACL post-check 已通過，未以多連線或正式業務交易進行測試。見 [規格](specs/2026-10-12-match-cards-cancellation.md)。

- `supabase/migrations/20260924014519_equipment_available_stock.sql`：裝備管理可用庫存操作。新增 `save_equipment_available_stock()`（CREATE／EDIT、row lock、版本檢查、使用／預留換算），`stock_set` 流水帳可用量前後欄位，及交易／請購異動版本 trigger。2026-09-24 已部署至正式專案，檔名已對齊遠端 migration history；不要再次手動執行舊檔 `20260924011641`，否則會出現重複欄位錯誤。新環境需先部署再發布前端；schema migration 本身不改寫既有庫存。隔離驗證：`scripts/verify-equipment-available-stock.mjs`。
- `scripts/repair-equipment-stock-20260924.sql`：已依管理者確認的各尺寸可用量修正 7 項裝備整體基準，保持尺寸與交易／付款原值，新增 7 筆 `stock_set` 紀錄。先以交易回滾試跑，再正式執行；鎖定裝備並驗證原值及交易推算，資料不同即停止，成功後重跑不會新增紀錄。完整結果見 `docs/EQUIPMENT_STOCK_RECONCILIATION_20260924.md`。

本文件整理根目錄 `supabase_*.sql` 的用途與讀取順序。AI 修改 DB schema、RLS、policy、RPC、cron、storage policy 前，先讀本檔，再用 `rg` 搜同名 table / function / policy。

## 讀取規則

- `scripts/suppress-coach-leave-historical-push-20261009.sql`：依使用者決定「11 筆歷史教練通知只留站內，新通知才推播」，已於 **2026-10-09 14:48:18 台灣（06:48:18Z）正式套用**一次性維運 DML，不是 schema migration。僅將 cutoff `2026-10-06T07:07:21.743675Z` 以前、經交易內逐筆鎖定及 metadata fingerprint 驗證的固定 11 筆 pristine pending／零 delivery 事件改為 `recorded`，保留 outbox mode／feed 內容。獨立 post-check 確認 11 recorded、歷史 delivery 0、歷史 claim eligible 0、各派送計數 0、無鎖；內容及 feed／claim 定義 hash 不變。`tests/database/coachLeaveHistoricalPushSuppression.integration.mjs` 的 40 項隔離 SQL 檢查通過，包含同一舊假單在 cutoff 後新增 revision 仍可 claim。不要重跑、擴大集合或讓 heartbeat 執行／補送；worker 仍未部署、四項所需 Edge secret 尚缺，`docs/EDGE_FUNCTIONS.md` 的 VAPID／auth 部署門檻尚未解除，新推播尚未恢復。

- `supabase/migrations/20261009051707_cron_run_history_retention.sql`：2026-10-09 已部署正式 `qwxzwomzoyfkorbwsscv`，檔名對齊 migration history（原 CLI `20261009051103` 不再使用）。private state／invoker batch／daily procedure 只清理完成超過 30 天的 cron succeeded／failed 紀錄，保留每個現有 job 最新 10 筆；500 筆 keyset batch，daily 最多刪除 10,000／掃描 100,000／20 秒軟預算，目前全域硬逾時 120 秒、鎖等待 500ms。初次積欠已分批刪除 55,000 筆；因新增 timeout 停止後續 bootstrap，積欠尚未清完，不重跑整份 migration。
- `scripts/activate-pg-net-response-maintenance.sql` 與 `scripts/activate-cron-history-retention.sql`：已啟用台灣每日 03:20 的 `net._http_response` 一般 VACUUM（ANALYZE 只取 created、不截斷）及 03:30 retention；單獨執行 VACUUM／頂層 CALL，不能把 job command 包進交易或前置 SET。啟用檢查 UTC cron 時區與有限 statement_timeout；後續設定變更仍須重新確認硬上限。完整結果見 [維護報告](SUPABASE_TIMEOUT_RECOVERY_20261009.md)，隔離回歸為 `tests/database/cronHistoryRetention.integration.mjs`。
- `supabase/migrations/20261011161534_profile_last_seen_write_throttle.sql`：2026-10-12 已部署，補齊既有線上節流的 migration history；部署前即確認 `touch_profile_last_seen()` 的 auth.uid() 本人 UPDATE 已有 5 分鐘條件，部署後 function body 雜湊、owner 與 ACL 均未改變。前端 last-seen／通知請求去重納入 1.1.76、準備發行；本次未重跑 retention 或維護啟用腳本。`tests/database/profileLastSeenThrottle.integration.mjs` 的 13 項隔離 SQL 檢查通過。
- `supabase/migrations/20261017145208_minute_notification_dispatcher.sql`：**2026-10-17 約 23:20 台灣已部署正式 `qwxzwomzoyfkorbwsscv`**（以 `supabase db query --linked -f` 單一交易套用，再用 `supabase migration repair --status applied 20261017145208` 登錄 history，版本與檔名一致）。事後檢查：只剩 `minute-notification-dispatcher`（jobid 29）取代舊四個排程，每分鐘成功、約 25ms；賽事提醒 URL 已擷取；新 private 函式對 anon／authenticated／service_role 均不可執行；部署後 `net._http_response` 不再每分鐘新增；ADMIN 健康檢查與訓練診斷 RPC 正常回應（健康檢查的 unhealthy 來自部署前 18:00 的 3 筆 Web Push 派送失敗警報）。尚待：下一次提醒規則時間的實際派送驗證。以單一 `minute-notification-dispatcher`（每分鐘、指令只有 `select private.run_minute_notification_dispatch();`）取代 `team-member-notification-outbox-worker`、`coach-leave-notification-outbox-worker`、`match-reminder-checker`、`holiday-theme-notification-checker` 四個無條件每分鐘排程。各目標先在 SQL 預檢：outbox 只有非終態事件或未完成 delivery 才呼叫；賽事提醒只在規則時間第 0／1／3／10／20／30 分鐘呼叫（對齊 Edge 的發送與 30 分鐘漏發檢查）；節日只在設定 URL 且有已開始、未送出、未結束活動時呼叫。Header／body／Vault 名稱沿用舊排程，賽事提醒 URL 由舊 job command 擷取保存。只在派送或錯誤時寫入 `private.minute_notification_dispatch_state`，單一目標失敗不影響其他目標。同檔改寫 `get_match_reminder_health_status()`（改用最新 5,000 筆 runid 視窗與 dispatcher 最後 request id，不再全掃 `cron.job_run_details` 或以 LIKE 掃 `net._http_response`；無 profile 也拒絕），並以錨點只改寫線上 `get_training_registration_notification_diagnostics()` 的 cron runs CTE（保留 training:VIEW gate，非預期定義整筆回滾）。隔離回歸 `tests/database/minuteNotificationDispatcher.integration.mjs`（`pnpm test:cron:sql`）。
- `supabase/migrations/20261017145209_cron_history_catchup.sql` 與 `scripts/activate-cron-history-catchup.sql`：**migration 已於 2026-10-17 約 23:29 台灣部署正式並登錄 history；啟用腳本尚未執行，`cron-run-history-catchup` 未排程**。`private.prune_cron_history_catchup()` 重用 daily retention procedure 與其 advisory lock；啟用腳本排程台灣 01:00–02:45、04:00–04:45 每 15 分鐘（避開 03:20／03:30），每晚最多 120,000 筆。最舊 500 筆中可刪少於 50 筆或到 2027-01-01 即自行 unschedule。隔離回歸 `tests/database/cronHistoryCatchup.integration.mjs`。實體空間回收（pg_repack／VACUUM FULL）不在此範圍，見維護報告 2026-10-17 段落。
- `supabase/migrations/20261017150507_match_fee_sync_noop_guard.sql`：**2026-10-17 約 23:30 台灣已部署正式並登錄 history**。部署前後各以回滾交易重新同步全部比賽：改寫列數 70 → 0，費用列業務欄位與付款開放狀態 digest 前後完全相同；三個函式 ACL（postgres／service_role）、SECURITY DEFINER、search_path 不變。2026-10-17 唯讀統計顯示 283 筆 `match_fee_items` 累計 637,607 次更新。以錨點改寫線上 `sync_match_fee_items_for_match()`（需含 `-- match-cancellation-billing-lock-order` 且錨點唯一，否則整筆回滾；已有 `-- match-fee-sync-noop-guard` 則略過），upsert 只在 SET 結果不同時改寫；`sync_match_fee_items_after_match_change()` 在監看欄位值未變時返回；`sync_match_fee_items_after_leave_change()` 忽略未改 user／日期／時段的更新，只重算該球員已有費用列或名列有收費賽事的場次。同步函式與兩個 trigger 函式在測試 fixture 中的 md5 已與正式環境比對一致，ACL／SECURITY DEFINER／search_path 不變。`tests/database/matchFeeSyncNoopGuard.integration.mjs` 以 18 步操作序列比對套用前後費用列與開放狀態完全一致，改寫次數 30 → 10，空轉步驟為 0；已納入 `pnpm test:payments:sql`。

- `supabase/migrations/20261002180340_coach_schedule_scheduling_coach_eligibility.sql`：補入正式已存在的精確 SCHEDULINGCOACH（排班教練）資格，通知排班 VIEW audience 也改共用 helper；不更動角色權限、public RPC、worker 或資料。2026-10-03 已延續本對話 SQL 授權套用正式 `qwxzwomzoyfkorbwsscv`，本機更名對齊 history（原 CLI `20261002175454` 不再使用）。3 位有效教練及 authenticated listing 唯讀 probe 通過、private ACL／固定 search_path／raw DML 限制保留，其餘 14 支函式 hash 及 security advisor findings 不變。隔離 73 checks 已接入 `pnpm test:coach-schedules:sql`，完整 508 checks；部署證據 `/tmp/jg-coach-scheduling-eligibility-production-evidence.json`，詳見 [月份總覽規格](specs/2026-10-03-coach-schedule-month-overview.md)。
- `supabase/migrations/20261002171951_coach_schedule_venue_templates.sql`：範本改為場地＋教練，覆蓋 list／save／enrich／preview／confirm，新增 coach_schedules:VIEW 的安全常用場地清單。切換前非空舊範本會整筆拒絕；不自動選擇或合併教練。每場地一啟用範本，新名稱同交易保存，拒絕舊 mode／fingerprint；training_venues BEFORE statement 共用鎖避免反序鎖與確認競爭。2026-10-03 已套用 qwxzwomzoyfkorbwsscv、完成 schema／ACL／唯讀 RPC post-check，本地檔名與 remote history 對齊；前端待發布，通知 worker 不變。完整驗證見 [場地範本規格](specs/2026-10-03-coach-schedule-venue-templates.md)。
- 教練請假與通知兩份 migration 已於 2026-10-02 按使用者授權套用正式專案 `qwxzwomzoyfkorbwsscv`：`20261002150832_coach_leave_and_schedule_templates.sql` → `20261002150855_coach_leave_notification_outbox.sql`。檔名對齊遠端 history，已確認 schema／RPC ACL／原通知 feed 保留及 cron；不要重跑原未部署檔名 `20261002135941`／`20261002140149`。worker／Vault 尚未完成，詳細驗證及相依見 `docs/specs/2026-10-02-coach-leave-and-schedule-templates.md`。
- 日期快選需求沿用前述 SQL 授權，已追加套用 `20261002155846_coach_leave_batch_create_and_training_dates.sql` 至同一正式專案；本機檔名與測試／文件對齊 history。新 RPC ACL／private receipt RLS及raw grant、原核心與feed hash保留、安全月份日期讀取確認通過；不要重跑原 CLI 生成但已更名的 `20261002154308`。

- `supabase/migrations/20261001032108_junior_high_payment_open_period.sql`：國中部每月 25 日預繳下月的獨立修正；2026-10-01 已套用正式專案 `qwxzwomzoyfkorbwsscv`，檔名對齊 history version。依 raw training program 判斷開放，覆寫月費 trigger，僅替換付款估算與首頁摘要的 availability 條件，保留後續權限／季費歸屬與金額計算。SQL 與比對文字同步正規化 LF／CRLF，未知版型仍原子回滾；沒有資料回填，不應重跑較早的整份校隊 migration。隔離 SQL 測試為 `tests/database/monthlyPaymentOpenPeriod.integration.mjs --newline-matrix`（亦支援正式函式定義 JSON），付款全回歸 529 checks；正式 7 組 linked 估算、8 項開放日與資料 fingerprint／RPC ACL post-check 通過。

1. 先找功能主 migration，再找後續 hotfix / repair / `zz*` migration。
2. 同名 `create or replace function` 以最後的 hotfix 或 repair 檔為準，不要只看最早的主 migration。
3. 修改核心表前先查：`rg "function_or_policy_name" -g "*.sql"`。
4. 新 DB 變更優先新增 migration，不直接覆寫既有已部署 migration。
5. `test_db.sql`、`check_db.ts`、`check_db2.ts` 是臨時驗證入口，不是正式 migration。

## 權限與安全基礎

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase/migrations/20261002151942_create_app_role_with_permission_copy.sql` | 新增角色時可複製既有角色權限 | `create_app_role()` 以 SECURITY INVOKER 沿用原 ADMIN-only RLS，另驗證有效 ADMIN；角色與完整已儲存 feature/action 快照原子建立，不複製則為空權限。拒絕 ADMIN 來源，失敗回滾；新角色採自訂角色／預設排序，不複製來源系統屬性。2026-10-03 的 1.1.70 發布前唯讀確認正式 RPC body 與本機相同（MD5 `519d14330ecd49ae8956c27d7e9ceb76`），ACL／空 search_path 正確；history 未記錄此版本／名稱，需另行盤點 ledger，不能僅因缺記錄重跑。隔離回歸 `tests/database/appRoleCreation.integration.mjs` |
| `supabase/migrations/20261011150448_app_role_display_names.sql` | 修改角色中文顯示名稱 | `update_app_role_name(text,text)` 限有效 ADMIN，SECURITY INVOKER／固定空 search_path／authenticated ACL；只更新 role_name，名稱必填且最多 100 Unicode codepoints，系統角色也可改。識別碼／排序／profile／permissions 不變，保留原 RLS。隔離 SQL 61 checks 通過；2026-10-12 唯讀確認正式 RPC 定義與 ACL 符合本檔，但 migration history 尚無本檔紀錄。本次未重跑，未回寫任何現有名稱 |
| `supabase/migrations/20261002170401_app_role_display_weights.sql` | 初始角色顯示數字與逐角色排序保存 | 僅依八個精確角色 key 設定初始 weight（對照見 `docs/PROJECT_LOGIC.md`），不改其他角色或授權；`update_app_role_weight()` 限有效 ADMIN，以 SECURITY INVOKER 沿用 RLS，僅 authenticated 可執行。接受 1–2147483647 正整數、允許同數及 ADMIN／系統角色調整；只更新 weight，新角色仍預設 99。2026-10-03 的 1.1.70 發布前唯讀確認正式 RPC body 與本機相同（MD5 `517266041fc52a17a3f75f2c041ab5ac`），ACL／空 search_path 正確；history 未記錄此版本／名稱，初始權重是否曾整檔執行不據此推定。需另行盤點 ledger，管理者手動調整後不要重跑初始設定。隔離回歸 `tests/database/appRoleWeights.integration.mjs` |
| `supabase_access_control_rls_migration.sql` | `has_app_permission()`、`has_any_app_permission()`、`team_members_safe`、主要 RLS 初版 | 新增 feature/action 時先看這裡 |
| `supabase_access_control_policy_cleanup_migration.sql` | 重新整理多個核心表 policy | 若 policy 名稱重複，以後續檔案為準 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzz_team_member_notification_outbox_migration.sql` | 完整名單 RPC 與新球員通知 Outbox | 先於前端部署；新增 trigger、delivery、claim/finalize RPC 與每分鐘 cron |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzz_team_members_safe_security_hardening_migration.sql` | 球員安全 view / RLS / 欄位權限 hardening | 最後部署；`security_invoker`、linked scope、撤銷 raw table 整表 SELECT |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzz_team_members_safe_role_scope_hotfix.sql` | 收斂安全球員名單的全隊可見權限 | 只有 `players:VIEW`、`players:EDIT` 或 ADMIN 可看全隊；一般 linked user 僅看綁定球員 |
| `supabase_profile_access_control_migration.sql` | profile access state / 登入可用性 | 影響 auth store 與登入限制 |
| `supabase/migrations/20261009134852_immediate_profile_suspension.sql` | profiles 加入 Realtime publication，供本人接收停權 UPDATE | 本機隔離 SQL 14 checks 通過；2026-10-09 發布前唯讀確認正式 profiles publication 已啟用、原 self SELECT policy 保留，history 無本檔，不能推定整檔已套用；本次不重套 SQL。保留原 self/admin SELECT RLS 與 grants。post-check 確認 publication membership 及停權 self row 仍可讀；不修改 managed Auth table 或寄信設定 |
| `supabase_profiles_personal_settings_migration.sql` | 個人設定與大頭照欄位 / RPC | 搭配 profile settings |
| `supabase_profiles_personal_settings_function_fix_migration.sql` | 個人設定 function 修正 | 覆寫個人設定 RPC 時必讀 |
| `supabase_profiles_binding_last_seen_migration.sql` | linked member / last seen 相關補強 | 影響個人功能可見性 |

## 球員、使用者與 Team Groups

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase/migrations/20260909133628_player_custom_identity_labels.sql` | 自訂社區球員身分名稱與持久化選項 | 名稱與 `role` 分開；私有 trigger 隨球員交易保存選項；保留原球員 RLS，safe view 僅追加非敏感欄位；須先於前端部署 |
| `supabase_team_members_cache_meta_migration.sql` | 名單 cache meta 與 updated_at trigger | `playerRoster` store 依賴 |
| `supabase_team_members_joined_date_migration.sql` | 球員加入日期 | Google sync 不覆蓋既有值 |
| `supabase_team_members_inactive_graduated_migration.sql` | inactive / graduated 狀態 | 影響名單篩選 |
| `supabase_zz_team_members_grade_migration.sql` | 球員年級欄位、生日預設回填與年度刷新排程 | 出生日期 9/2 以後晚一屆；名單年級每年 6/19 由 `team-member-grade-yearly-refresh` 自動升級；Google sync 不覆蓋既有人工年級 |
| `supabase_primary_payer_migration.sql` | 主要繳費人旗標 | 影響費用計算 |
| `supabase_half_price_migration.sql` | 半價旗標 | 影響費用計算與同步保護 |
| `supabase_sibling_migration.sql` | sibling / family grouping | 影響季費家庭金額 |
| `supabase_team_group_settings_migration.sql` | team group 設定 | 搭配 `teamGroupsApi` |
| `supabase_team_group_settings_reorder_migration.sql` | team group 排序 RPC | 改排序時必讀 |
| `supabase_team_group_settings_create_rpc_hotfix.sql` | team group 建立 RPC hotfix | 覆寫建立流程 |
| `supabase_team_group_rename_migration.sql` | team group 改名 / 轉移 | 改名不可留下孤兒組別 |
| `supabase_team_group_non_player_cleanup_migration.sql` | 清理非球員組別資料 | 保持 eligible role 規則 |

## 報名表

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_registration_forms_migration.sql` | 報名表範本 metadata、最小化產生紀錄、`registration_forms` feature 與 private Storage | 只預設 `ADMIN` 四個 action；產生個資文件仍由 Edge Function 額外檢查 `players:EDIT`，產出檔不保存 |
| `supabase/migrations/20260818075514_registration_form_events.sql` | 賽事報名主檔、多範本關聯與 event-aware generation log | 明確 grants + RLS；`save_registration_form_event()` 使用 security invoker；不保存球員 ID、個資或產出檔 |
| `supabase/migrations/20260818075618_registration_form_event_audit_indexes.sql` | 賽事報名 audit foreign key 索引 | 補齊 `created_by` / `updated_by` covering indexes，消除新表 advisor 提醒 |
| `supabase/migrations/20260824034124_registration_form_pdf_profile.sql` | 範本 metadata 與 private Storage 開放已知 PDF profile | 加入 `cobra_cup_u9_pdf@1`、`application/pdf`；不放寬 Edge Function 的原檔指紋白名單與產檔權限 |
| `supabase/migrations/20260909072622_registration_form_cobra_docx_profile.sql` | 加入第二屆眼鏡蛇盃 Word 範本 metadata | `cobra_cup_docx@1`、14 人容量、無照片；保留三個既有 profile，部署順序為 migration → Edge Function → 前端 |

## 公開頁、Dashboard 與個人功能

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_dashboard_snapshot_migration.sql` | 公開 / dashboard 摘要 | 公開頁只能回去敏感資料 |
| `supabase/migrations/20260820110213_require_join_inquiry_line_id.sql` | 公開入隊申請聯絡方式必填規則 | LINE ID 改為必填且不可空白、電話改為選填；不回寫既有申請資料 |
| `supabase_dashboard_today_attendance_status_migration.sql` | 今日訓練點名狀態 | `HomeView` dashboard 區塊依賴 |
| `supabase_zzzzzzzzzz_dashboard_today_attendance_events_migration.sql` | 今日訓練點名狀態多筆點名單 | 覆寫 `get_dashboard_today_attendance_status()` 回傳 `todayEvents` |
| `supabase_my_home_snapshot_migration.sql` | 個人首頁 snapshot | linked member 安全邊界 |
| `supabase_zz_my_home_training_points_migration.sql` | 個人首頁特訓點數補強 | 覆寫 / 補齊 snapshot 點數 |
| `supabase_my_home_equipment_payment_ownership_migration.sql` | 個人首頁裝備付款歸屬修正 | 裝備付款摘要必讀 |
| `supabase_my_home_next_event_match_only_hotfix.sql` | 個人首頁 Next Up 僅顯示賽程 | 避免點名單搶佔 Next Up |
| `supabase_my_home_personalized_next_event_migration.sql` | 個人首頁 Next Up 依 linked member 篩選特訓報名 | 有效報名特訓才顯示，否則跳過到下一場賽事 |
| `supabase_my_home_next_match_week_window_migration.sql` | 個人首頁 Next Up 收斂為本人一週內比賽 | 只取 `matches.players` 含目前 linked member 的非特訓比賽；限今天至六天後、排除今天已結束與空白名單 |
| `supabase_inactive_member_visibility_migration.sql` | 關閉 / 畢業成員可見性修正 | 覆寫 `list_my_payment_members()`、`list_my_leave_members()`、`create_my_leave_requests()` 與 `get_dashboard_today_attendance_status()`，排除退隊、離隊、關閉 / 畢業成員 |
| `supabase_my_leave_requests_migration.sql` | 我的假單 RPC | 家長端請假安全入口 |
| `supabase_zzzzzzzzzzzzzzzz_leave_time_segments_migration.sql` | 單日假單全日 / 上午 / 下午時段 | 新增 `leave_requests.leave_time_segment`，覆寫我的假單 RPC、賽事假單同步、比賽費同步與今日點名摘要的時段重疊判斷；賽事判斷會優先用 `matches.match_time`，再 fallback 到 `matches.note` 的集合時間 |
| `supabase/migrations/20260903091633_admin_my_leave_all_members.sql` | ADMIN 我的假單全有效成員範圍 | 已於 2026-09-03 套用；最新覆寫四支我的假單 RPC：一般帳號維持 linked-only，只有 `current_profile_role() = 'ADMIN'` 的有效 ADMIN 可查看 / 建立 / 刪除所有有效成員；linked member 優先排序、匿名 EXECUTE 撤銷，並以 profile trigger 防止一般帳號自改 `role` / `linked_team_member_ids` 擴權 |
| `supabase_my_player_records_migration.sql` | 我的成績 RPC | `/my-records` 不直接讀後台 matches |
| `supabase_notification_feed_rpc_migration.sql` | 通知中心 RPC 初版 | 後續多個檔案覆寫 |
| `supabase_announcement_notifications_migration.sql` | 公告通知 feed 補強 | 覆寫 `get_notification_feed()` |

## 請假、點名與特訓

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_training_points_migration.sql` | 特訓、點數、禁報、特訓點名主 migration | `/training` 主線 |
| `supabase/migrations/20261011161249_training_view_permission_gate.sql` | 特訓必須具有 VIEW 權限 | 2026-10-12 已部署；以最新 RPC 定義追加 VIEW gate，保留回傳欄位與既有資料，raw-table RLS 與 feed 同步。394 項隔離 SQL 檢查及正式唯讀權限驗證通過，點數與權限資料筆數／雜湊不變；前端納入 1.1.76、準備發行，三支特訓通知 Edge Functions 的狀態見 `docs/specs/2026-10-11-training-view-permission.md` |
| `supabase_zz_training_point_transaction_delete_migration.sql` | 點數流水帳刪除 RPC | 只允許受控刪除 |
| `supabase_zz_training_registration_notifications_migration.sql` | 特訓報名通知 event | 搭配 Edge Function |
| `supabase_zzz_training_registration_notification_diagnostics_migration.sql` | 特訓通知診斷 | 排查通知時讀 |
| `supabase_zzzzzzzz_training_auto_select_notifications_migration.sql` | 特訓自動錄取與單筆報名 / 錄取通知 | 覆寫 training RPC 與 `get_notification_feed()` |
| `supabase_zz_training_attendance_status_hotfix.sql` | 特訓點名狀態 hotfix | 影響禁報 / 出席 / 請假 |
| `supabase_zz_training_selection_publish_hotfix.sql` | 錄取名單發布 hotfix | 公布名單與通知前讀 |
| `supabase_zz_training_hotfix_verify.sql` | 特訓 hotfix 驗證 | 驗證用 SQL |
| `supabase_training_dates_migration.sql` | 每月訓練日期設定、換月預設日期排程與日期異動通知 | `/training-dates` 主線，覆寫 `get_notification_feed()` / `get_my_home_snapshot()`，新增 `training-month-date-defaults-daily` DB cron |
| `supabase_zzzzzzzzzzzzzzzzzz_training_program_scope_migration.sql` | 訓練項目設定與 program 分流 | 新增 `training_program_settings`、`training_month_date_settings.program_key`、`training_location_sessions.program_key`、`monthly_fees.training_program`，並新增 program-aware dates / locations RPC overload |
| `supabase_zzzzzzzzzzzzzzzzzzzz_team_member_training_program_hotfix.sql` | 球員中港校隊 / 國中部身分欄位 hotfix | 新增 `team_members.training_program` 並讓 program 判斷優先使用該欄，`team_group` 回歸所屬群組（熊隊） |
| `supabase_zzzzzzzzzzzzzzzzzzzzz_training_program_label_rename_migration.sql` | 訓練項目舊版顯示名稱調整 | 調整舊版預設 program label，不修改 program key 或舊 `team_group` fallback；現行名稱再由最新國中部 label migration 覆寫 |
| `supabase_training_locations_migration.sql` | 場地與人員配置主 migration | `/training-locations` 主線 |
| `supabase_training_locations_assignment_schema_hotfix.sql` | 場地指派 schema hotfix | 修改 assignment 前讀 |
| `supabase_zzzzzzzzz_training_location_attendance_migration.sql` | 場地配置連動點名 | 覆寫場地列表 / 儲存 RPC，新增 `attendance_events.training_location_session_id` / `training_location_session_venue_id` |
| `supabase_zzzzzzzzzz_training_location_venue_settings_migration.sql` | 場地區塊訓練設定 | 新增 `training_location_session_venues` 的標題 / 日期 / 時間欄位，覆寫場地列表、儲存、通知、個人首頁與連動點名 RPC |
| `supabase_zzzzzzzzzzz_no_fee_roster_exclusions_migration.sql` | 不收費球員 roster 排除 | 覆寫場地 roster / 儲存 / 連動點名 RPC；新場地配置與新點名排除 `fee_billing_mode = no_fee`，舊點名紀錄保留 |
| `supabase_zzzzzzzzzzzzzzzzzz_training_location_leave_time_segment_migration.sql` | 場地請假時段判斷修正 | 覆寫場地 roster、管理列表、個人首頁本週場地與場地通知 target；場地時間缺失或使用預設上午時間時以上午區段判斷，下午假不標示 / 排除上午場地 |
| `supabase_zzzzzzzzzzzzzzzzzzz_training_location_roster_all_players_hotfix.sql` | 場地配置球員池全員可選 hotfix | 覆寫 program-aware roster RPC，保留 program 標籤與半日請假判斷，但不再用目前 program 限制可編排球員 |
| `supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql` | 教練請假、排班範本與原子帶入 | 分離本人 / 管理權限、私人假單 RPC、13:00 半日區段、實際移除重疊指派及 private audit；取消不還原、單筆全來源版本 / 請假 / 占用 guard、撤銷 raw DML、範本精確唯一與預覽 fingerprint / receipt。依賴既有 shared-slot migration；隔離回歸 `scripts/verify-coach-leave-and-schedule-templates.mjs` |
| `supabase/migrations/20261002150855_coach_leave_notification_outbox.sql` | 教練請假持久化通知 | 前一 migration 必須完整 COMMIT；開頭檢查 core 表／RPC／`coach_leave_payload`，缺少時 55000 提示先安裝 core，保留原 feed。派送與 feed 共用 active / 權限 audience，逐裝置重試、更新權限檢查、無訂閱仍保留 feed、依資格導向假單或排班。搭配 `process-coach-leave-notification-outbox` 與每分鐘 cron；隔離回歸 `tests/database/coachLeaveNotifications.integration.mjs`，完整 core→notification 串接回歸亦在 `scripts/verify-coach-leave-and-schedule-templates.mjs`。成功 migration 不整份重跑 |
| `supabase/migrations/20261002155846_coach_leave_batch_create_and_training_dates.sql` | 教練假單多日期快選與原子批次新增 | 依賴已部署教練請假核心及訓練 program 月份日期 RPC；private batch receipt、防重試重建、最多 365 筆同一教練，全交易移除指派與通知。VIEW 授權的上課日 RPC 只回有效項目與日期，排除私人備註。已套用正式資料庫；history 與本機檔名對齊，RPC ACL、private RLS／raw grants、原核心／feed 保留及上課日唯讀 probe 通過 |
| `supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql` | 合班共用教練排班 | 同日／實體場地／開始時間／課程名稱共用 slot；唯一約束與交易鎖、來源異動／刪除重連、教練與備註聯集及 private audit；回歸 `scripts/verify-coach-schedule-shared-slots.mjs`。覆蓋前一版「按 program 獨立」規則 |
| `supabase/migrations/20260924043936_coach_schedule_program_source_integrity.sql` | 教練排班訓練項目與場地來源完整性 | 管理／Dashboard RPC 回傳項目名稱；驗證與同步來源、刪除連動；唯一舊來源重連，其餘歷史轉手動並保留教練指派。驗證：`scripts/verify-coach-schedule-sources.mjs`；結果見 `docs/COACH_SCHEDULE_SOURCE_REPAIR_20260924.md` |
| `supabase_coach_schedules_migration.sql` | 教練排班表 | 新增 `coach_schedule_events` / `coach_schedule_assignments`、`coach_schedules` 權限與 Dashboard / 管理頁 RPC；候選日需搭配 `/training-dates` 與場地配置 |
| `supabase_coach_schedules_schedulable_coaches_hotfix.sql` | 可排班教練清單 hotfix | 覆寫 `list_schedulable_coaches()`，放寬 role 空白 / 中文歷史值並維持 active access 檢查 |
| `supabase_coach_schedules_training_location_sync_hotfix.sql` | 教練排班場地同步 hotfix | 場地配置區塊更新時同步已儲存 `coach_schedule_events` 的來源日期 / 時間 / 標題 / 地點快照 |
| `supabase_zzz_coach_schedule_match_source_integrity_migration.sql` | 教練排班賽事來源完整性 | 驗證比賽 / 特訓排班來源 UUID、刪除賽事時連動清理排班、同步 `match_level` 對應的 `source_type`，並一次修復既有孤兒資料 |
| `supabase_training_sessions_location_assignment_hotfix.sql` | 特訓 session 場地指派 hotfix | 串 training session 時讀 |
| `supabase_training_admin_registrations_location_assignment_hotfix.sql` | 管理端報名與場地指派 hotfix | 教練管理流程讀 |

## 賽事、日曆、媒體與天氣

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_matches_google_calendar_sync_migration.sql` | `google_calendar_event_id` | 日曆同步 fallback 必讀 |
| `supabase_match_calendar_daily_sync_schedule.sql` | 賽事日曆每日同步排程 | cron / Edge Function 搭配 |
| `supabase_match_record_enhancements_migration.sql` | 比賽紀錄欄位補強 | 改 match record 欄位時讀 |
| `supabase_match_tournament_name_migration.sql` | 盃賽名稱欄位 | 統計與篩選使用 |
| `supabase_match_video_url_migration.sql` | 比賽影片欄位 | media UI 使用 |
| `supabase_match_reminder_notifications_migration.sql` | 賽事提醒通知 | 覆寫 `get_notification_feed()` 可能性 |
| `supabase_match_reminder_schedule_config_migration.sql` | 賽事提醒排程設定 | `system_settings.match_reminder_schedule_config`、每分鐘 cron checker（已由 `20261017145208` 的 `minute-notification-dispatcher` 取代） |
| `supabase_match_reminder_health_migration.sql` | 賽事提醒排程健康檢查 | `get_match_reminder_health_status()`、`matches:HEALTH_ALERT` ADMIN targeted 通知、覆寫 `get_notification_feed()` |
| `supabase_match_leave_absences_migration.sql` | 未來賽事假單請假同步 | `preview_match_leave_absences()`、`get_match_leave_absences()`、`leave_requests` / `matches` trigger，只管理 `source = 'leave_request'` 的 `matches.absent_players`；半日假單規則以後續 `supabase_zzzzzzzzzzzzzzzz_leave_time_segments_migration.sql` 為準 |
| `supabase_zzzzzzzzzzzzzzzzz_historical_match_leave_absences_migration.sql` | 歷史賽事假單同步補強 | 移除歷史日期限制，讓表單預覽、詳情 RPC 與假單 trigger 同步所有有日期賽事；部署時回填既有賽事並保留手動請假列與比賽費付款歷史 guard |
| `supabase_location_geocoding_cache_migration.sql` | 地點 geocoding cache | `resolve-location` Edge Function 使用 |

## 收費、付款、餘額與比賽費

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase/migrations/20260926105948_quarterly_payment_member_ownership.sql` | 季費兄弟帳款歸屬修正 | 本人同季帳款優先，缺本人列才保留舊家庭讀取；紀錄／估算／首頁／提醒／補償共用 private helper，審核只更新本人。以部署中 function definition 局部替換並檢查命中數，保留後續權限／期別修正與所有已存資料；2026-09-26 唯讀查核 `qwxzwomzoyfkorbwsscv` 已有 helper 與各函式修正，兩位球員紀錄／估算為 6,700／3,700；未找到對應 migration history，本次未執行遠端寫入 |
| `supabase/migrations/20260926111544_admin_payment_submission_members.sql` | 管理員付款回報免綁定成員 | private helper 檢查有效帳號及 ADMIN／linked member；局部更新單人月季費、多人季費、裝備、比賽四個建立 RPC 與本人待審回報列表。保留金額／餘額／期別／原回報者／審核界線；本機 SQL 與畫面驗證完成，尚未遠端套用 |
| `supabase_fees_migration.sql` | 費用基礎表 | 月費 / 季費主線 |
| `supabase_quarterly_fees_migration.sql` | 季費 | sibling / family grouping 相關 |
| `supabase_quarterly_fees_rls.sql` | 季費 RLS 修正 | 權限問題先查 |
| `supabase_fixed_monthly_billing_migration.sql` | 社區球員固定月繳 | `fee_billing_mode` 依賴 |
| `supabase_no_fee_billing_migration.sql` | 球員 / 校隊不收費模式 | `fee_billing_mode = no_fee`，覆寫付款 RPC、比賽費同步、首頁與收費提醒摘要 |
| `supabase_zzzzzzzzzzzzzzz_monthly_per_session_billing_migration.sql` | 球員計次月費模式 | `fee_billing_mode = monthly_per_session`，覆寫繳費模式 helper、`list_my_payment_members()` 與收費提醒摘要 |
| `supabase_profile_payment_submissions_migration.sql` | 個人付款回報 | `/my-payments` 主線 |
| `supabase_pending_payment_submission_self_service_migration.sql` | 待確認付款回報自助修改／刪除 | 必須在付款金額核對及裝備／比賽付款 migrations 後套用；新增本人＋linked member＋有效帳號 RPC，鎖主單與版本檢查，保留應收／已審歷史；已確認遠端存在，必須接續下列 schema names hotfix，不可單獨重跑舊版覆蓋修正 |
| `supabase_pending_payment_submission_schema_names_hotfix.sql` | 待確認付款回報查詢表名／欄位名修正 | 2026-09-07 已套用 `qwxzwomzoyfkorbwsscv`；只覆寫 list RPC，`public.equipment` 使用單數，`match_fee_items` 使用 `match_name_snapshot` / `match_date_snapshot`；102 個有效帳號與 94 次綁定成員查詢通過，付款／費用／餘額資料指紋不變 |
| `supabase_profile_payment_rpc_fix_migration.sql` | 個人付款 RPC 修正 | 覆寫付款 RPC |
| `supabase_profile_payment_review_member_id_ambiguity_fix_migration.sql` | 付款審核 member_id ambiguity 修正 | 審核流程必讀 |
| `supabase_zzzzzzzz_profile_payment_review_conflict_target_hotfix.sql` | 付款審核 conflict target 修正 | 多球員季繳覆寫後的 `member_id` ambiguity 修正 |
| `supabase_zzzzzzzzzzzzz_quarterly_payment_submission_member_id_ambiguity_hotfix.sql` | 多球員季繳付款送出 member_id ambiguity 修正 | 覆寫 `create_my_quarterly_payment_submission()`，修正 `RETURNS TABLE` 欄位與 items CTE 欄位撞名 |
| `supabase_profile_payment_submission_estimate_migration.sql` | 付款估算 RPC | 家長端送出前估算 |
| `supabase_profile_payment_submission_estimate_monthly_record_migration.sql` | 月費紀錄估算補強 | 固定月繳 / 月費估算必讀 |
| `supabase_zzzzzzzz_profile_payment_estimate_training_dates_migration.sql` | 付款估算訓練日期補強 | 月繳本月堂數改以 `/training-dates` 設定天數計算 |
| `supabase_zzzzzzzzzzzzzzzzz_monthly_fee_leave_time_segment_migration.sql` | 計次月費假單時段修正 | 月費試算 / 家長端付款估算只把訓練日期內的全日、上午假單列為請假扣減；下午假不扣計次月費 |
| `supabase_player_balance_transactions_migration.sql` | 球員餘額流水帳與付款 RPC 覆寫 | 餘額權威主線 |
| `supabase_inactive_member_visibility_migration.sql` | 關閉 / 畢業成員繳費名單修正 | `list_my_payment_members()` 不回傳退隊、離隊、關閉 / 畢業成員 |
| `supabase_quarterly_fee_compensation_migration.sql` | 季費堂數不足補償 | 產生待審核補償單，核准後寫入球員餘額 |
| `supabase/migrations/20261008050733_quarterly_compensation_training_dates.sql` | 季費補償日期範圍修正 | 產生 RPC 與季費面板共用課表日期，排除其他課程日期，基準固定當月週六數；允許未來月份。局部替換日期區塊並驗證命中數及 LF／CRLF，不改受補償球員條件、季費歸屬、權限、帳款／付款／餘額或已審紀錄。`quarterlyCompensationDates.integration.mjs --newline-matrix` 已納入付款 SQL 回歸。本機完成、尚未部署 |
| `supabase_zzzzzzzzzzzz_quarterly_payment_open_period_migration.sql` | 季繳付款回報開放期別 | 每季最後一個月 25 日起開放下一季；覆寫付款估算 RPC，新增付款回報 trigger 防止未開放未來季寫入 |
| `supabase_zzzzzzzzzzzzzz_monthly_payment_open_period_migration.sql` | 月繳付款回報開放期別 | 計次月費只開放已結束月份；固定月繳球員每月 25 日起開放下月，並以 trigger 防止未開放月份寫入 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzz_my_home_payment_open_period_migration.sql` | 個人首頁付款待辦開放期別 hotfix | 覆寫 `get_my_home_snapshot()` 欠費摘要，只統計已開放付款的月費 / 季費期別 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzz_xintai_fixed_monthly_billing_migration.sql` | 國中部固定月繳先收（歷史規則） | 新增 3 參數月費計算 helper；此規則後續由 `supabase_zzzzzzzzzzzzzzzzzzzzzzzz_school_team_training_date_per_session_migration.sql` 覆寫，保留本列作部署歷史索引 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzz_school_team_training_date_per_session_migration.sql` | 中港校隊計次與國中部可切換月費 | 中港固定按訓練日扣除有效請假日；國中部預設單次月費 2,000 元，也可切換依當月訓練日期計算，兩種模式請假只記錄不扣款；國中部每月 25 日預繳下月，中港次月 1 日才開放，並同步設定 RPC、付款 trigger、家長試算與首頁摘要；既有帳款不自動回寫 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_junior_high_school_label_migration.sql` | 國中部顯示名稱統一 | 將 `junior_high_school_team` program label 與 `xintai_monthly_per_session_defaults` 設定描述統一為「國中部」，保留既有內部 key 與計費判斷 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_junior_high_single_monthly_payment_estimate_hotfix.sql` | 國中部單次月費付款估算 hotfix | 補齊單次月費設定／RPC，讓新增付款回報吃到設定金額；只修正台灣當月起、尚未繳且無待審回報的國中部舊快照，保留已繳／送審中歷史 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_profile_payment_amount_reconciliation_migration.sql` | 付款回報應收／實付核對安全邊界 | 新增 expected/reported/mismatch/rejection 欄位；建立 RPC 重算應收，短繳禁止核准，多繳精確差額依球員冪等入餘額；只推導待審舊單並以 migration 指紋保護已核准／已退回歷史 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_monthly_fee_cross_billing_sibling_discount_migration.sql` | 月費跨收費模式手足半價修正 | 校隊月費半價判斷納入所有有效球員／校隊手足，不再要求手足同為月繳；安全修正當月起未繳且未送審的折扣快照 |
| `supabase_member_joined_fee_period_guard_migration.sql` | 月費／季費加入月份起算 | 新增加入期別 helper 與寫入 trigger，覆寫付款紀錄並補強付款估算、付款 RPC、首頁摘要及費用提醒，加入前未繳不再產生或顯示，已付款／送審歷史保留 |
| `supabase_match_fees_migration.sql` | 比賽費 items / submissions | 比賽費與餘額整合 |
| `supabase/migrations/20260927051302_independent_player_match_billing.sql` | 隊費與比賽費獨立設定 | 須在單場免繳 migration 後部署；保留既有不收費預設與歷史帳款，新啟用從台灣儲存當日起計。既有 RLS、safe view、完整編輯 RPC 邊界保留；本次未套用遠端。驗證：`pnpm test:payments:sql` |
| `supabase/migrations/20260927040433_match_fee_single_match_exemptions.sql` | 比賽費球員單場免繳 | 新增免繳旗標、異動者／時間與狀態 constraint；受保護 RPC 鎖場次與明細並核對版本；同步保留免繳、個人清單排除、群組刪除保護。2026-09-27 唯讀確認遠端已有免繳欄位及同步／個人清單規則；本次未執行遠端寫入。部署於比賽費開放 migration 之後 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_match_fee_payment_open_state_migration.sql` | 比賽費手動開放與防重複保護 | 新增 `matches.match_fee_payment_*`、應收簽章、開放 / 關閉與取消群組刪除 RPC；linked member 只讀已開放或已有付款歷程的項目，付款鎖定場次重驗，賽事刪除依付款歷程清除 / 阻擋 / 保留稽核紀錄 |
| `supabase_fee_management_reminders_migration.sql` | 費用提醒與通知中心 | 覆寫 `get_notification_feed()` |
| `supabase_fee_payment_reminders_migration.sql` | 手動催繳通知與通知中心 | 新增 `fee_payment_reminder` targeted feed source，覆寫 `get_notification_feed()` |

## 裝備

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_equipment_management_migration.sql` | 裝備主線 tables / RPC / policies | 最早主線，後續多個檔案覆寫 |
| `supabase_equipment_inventory_adjustments_migration.sql` | 庫存調整 | 庫存流水帳 |
| `supabase_equipment_manual_purchase_records_migration.sql` | 手動購買紀錄 / 付款 RPC 覆寫 | 裝備付款前讀 |
| `supabase_equipment_multiple_photos_migration.sql` | 多照片欄位 | storage / carousel 使用 |
| `supabase_equipment_admin_addons_migration.sql` | 管理端加購 | 後台代建申請 |
| `supabase_equipment_jersey_numbers_migration.sql` | 裝備背號 | 球衣類資料 |
| `supabase_equipment_notification_feed_migration.sql` | 裝備通知 feed | 覆寫 `get_notification_feed()` |
| `supabase_equipment_pending_request_payment_items_migration.sql` | 待付款申請項目 | `/my-payments` 裝備付款 |
| `supabase_equipment_payment_submission_uuid_fix_migration.sql` | 裝備付款 UUID 修正 | 付款紀錄關聯 |
| `supabase_equipment_purchase_request_create_inventory_guard_migration.sql` | 建立申請庫存 guard | 避免超賣 |
| `supabase_equipment_purchase_request_inventory_guard_migration.sql` | 審核申請庫存 guard | 避免超賣 |
| `supabase_equipment_transaction_delete_guard_migration.sql` | 裝備交易刪除 guard | 保護庫存一致 |
| `supabase_zzzzz_equipment_pickup_payment_status_migration.sql` | 領取 / 付款狀態補強 | 加購流程必讀 |
| `supabase_zzzzz_equipment_unpaid_reminder_body_migration.sql` | 未付款提醒文案 | 通知文案 |
| `supabase_zzzzzz_equipment_unpaid_reminder_link_migration.sql` | 未付款提醒連結 | click target |
| `supabase_zzzzzz_equipment_unpaid_payment_review_migration.sql` | 未付款審核補強 | 審核流程 |
| `supabase_zzzzzz_equipment_payment_submission_status_fix_migration.sql` | 裝備付款狀態 RPC 覆寫 | 裝備付款最新狀態 |
| `supabase_zzzzzz_equipment_inventory_snapshot_rpc_migration.sql` | 庫存 snapshot RPC | 家長端剩餘量顯示 |
| `supabase_zzzzzz_li_jinyi_equipment_payment_repair.sql` | 特定付款資料修復 | 資料修復，不當成通用 schema |
| `supabase_zzzzzzz_equipment_payment_payable_scope_fix_migration.sql` | 裝備付款可付範圍修正 | 早期付款 scope，後續仍有覆寫 |
| `supabase_zzzzzzzz_equipment_ready_for_pickup_payment_scope_migration.sql` | 裝備已備貨即可付款 | 覆寫裝備付款 scope，`ready_for_pickup` / `picked_up` 皆可付款 |
| `supabase_zzzzzzzzz_equipment_custom_order_migration.sql` | 裝備訂製品欄位 / snapshot RPC 覆寫 | 家長端等待提示 |
| `supabase_zzzzzzzzzz_equipment_approved_payment_scope_migration.sql` | 裝備已核准即可付款 | 覆寫裝備付款 scope，`approved` / `ready_for_pickup` / `picked_up` 皆可付款 |
| `supabase_zzzzzzzzzzz_equipment_payment_refund_migration.sql` | 裝備退款 / 作廢收款 | 新增 `refunded` 狀態、餘額反向流水與刪除 guard 放行 |
| `supabase_zzzzzzzzzzzz_equipment_create_request_inventory_guard_transaction_fix_migration.sql` | 建立申請庫存 guard 交易扣庫存修正 | 建立請購時，已轉成 `equipment_transactions` 的請購項目不可再被當保留庫存扣一次 |
| `supabase_zzzzzzzzzzzzz_equipment_request_item_fulfillment_migration.sql` | 裝備請購逐品項備貨、領取與刪除 | 品項 timestamps / notes / photos、父單聚合、逐項與整單原子 RPC、付款刪除 guard |
| `supabase_zzzzzzzzzzzzzz_equipment_payment_item_fulfillment_status_migration.sql` | 裝備付款品項履約狀態修正 | 付款清單與付款回報改依 transaction 關聯品項的 `ready_at` / `picked_up_at` 顯示，不再被父單聚合狀態覆蓋 |
| `supabase_zzzzzzzzzzzzzzz_equipment_stock_out_adjustment_migration.sql` | 裝備減少庫存流水帳 | `stock_out`、`equipment:EDIT`、必填原因及總量／尺寸已使用與已預留庫存 guard |
| `supabase_zzzzzzzzzzzzzzzz_equipment_request_ready_inventory_guard_fix_migration.sql` | 裝備備貨庫存重複計算修正 | `approved` -> `ready_for_pickup` 驗證排除目前請購已連結的 purchase transaction，其他交易與未轉交易預留量維持計入 |

## 廠商

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_vendor_management_migration.sql` | 廠商名單 tables / RLS / private storage policies | `/vendors` 主線；只預設 `ADMIN` 的 `vendors` 權限，交易類別刪除不跟著刪廠商 |

## 能力、體測、節日與推播

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_performance_data_migration.sql` | 能力 / 體測資料表與 RPC | performance 主線 |
| `supabase_performance_view_scope_migration.sql` | performance 可見範圍修正 | linked member 唯讀 |
| `supabase_holiday_theme_migration.sql` | 節日主題設定與通知 | public RPC / save RPC |
| `supabase_web_push_subscriptions_migration.sql` | Web Push subscription | 前端訂閱 / Edge Function |
| `supabase_web_push_subscription_claim_rpc_migration.sql` | subscription claim RPC | 多裝置 / 登入後認領 |
| `supabase_push_dispatch_events_migration.sql` | 通知事件去重 | 多個通知來源共用 |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzz_team_member_notification_outbox_migration.sql` | 新球員逐裝置可靠派送 | `push_dispatch_deliveries`、6 次重試、stale lock reclaim、pg_cron worker |

## 維運與效能

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_z_disk_io_optimization_migration.sql` | cache meta / notification feed / 效能補強 | 可能覆寫 function |
| `supabase_zzzz_disk_io_safety_cleanup_migration.sql` | disk IO 安全 cleanup | 維運類 |
| `test_db.sql` | 臨時驗證 SQL | 不當成正式 migration |

## 裝備共用排序（2026-09-16）

- `supabase/migrations/20260916010833_equipment_display_order.sql`：新增 `equipment_display_order`（FK 刪除連動、RLS）；有效登入使用者可讀，僅 `equipment:EDIT` 可經 `reorder_equipment` 寫入。RPC 驗證全部裝備及原始順序，衝突時全筆拒絕，保留庫存與付款流程。
- 先部署 migration，再部署前端。舊 DB 缺表時列表沿用新增時間排序，儲存會顯示未啟用訊息。
- 隔離 PostgreSQL 驗證：`scripts/verify-equipment-order.mjs`（檔首含暫存 PGlite runtime 安裝與執行方式），涵蓋正常／非法 ID、ADMIN／editor／家長／失效及匿名邊界、過期快照、新增／刪除與庫存價格不變。
- 回退先回退前端即可，排序表及 RPC 可保留；若移除 schema，先移除 `reorder_equipment(uuid[], uuid[])` 再移除排序表，不動裝備主檔。
