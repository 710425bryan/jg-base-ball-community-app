# Feature Spec：恢復已取消比賽

- 狀態：`DEPLOYED`；Delivery 目標：`PRODUCTION`（2026-10-12 隨 1.1.77 上線）
- 日期：2026-10-12
- 需求：誤取消比賽後，可關閉取消狀態並恢復原賽事。
- 沿用 project-workflow、delivery-workflow、match-records-media、auth-permissions、finance-payments、match-calendar-sync 與 Supabase skills。

## 正式發布更新（2026-10-12）

恢復 migration 已接續取消 migration 部署正式，Edge 與前端 1.1.77 同批發布。CI／Preview／正式 catalog 304 項與網站資產／登入入口驗收通過；正式未操作真實賽事或付款作測試。使用者已核准本次獨立 staging 的替代驗證。完整版本、來源對照、已知 Calendar 來源讀取問題與其餘限制見 [發布紀錄](2026-10-12-match-release.md)。以下本機階段的驗證與尚未部署文字保留為歷史紀錄，發布現況以上述紀錄為準。

## 行為與驗收

- 已取消、非特訓賽事的卡片／表格更多選單及詳情提供「恢復比賽」，限 `matches:EDIT`；一般唯讀球員紀錄不提供操作。
- 確認視窗顯示原賽事、日期、時間、地點及取消原因，處理中禁止重送／關閉，失敗保留畫面，成功更新原場次。
- 保留賽事 ID、照片、名單、成績，清空目前取消狀態；重新符合既有行事曆同步、Next Up、成績與後續賽前提醒規則。不立即發送恢復通知、不重送已派送提醒。
- 取消與恢復都需有效帳號、EDIT、完整 `updated_at` 與版本檢查；舊取消請求不能在恢復後再次取消，舊查詢不能抹去較新的取消或恢復。
- 每次取消／恢復保留 `private.match_cancellation_events` 稽核歷史，不能從一般更新、REST 或 service role 清除取消；只有受保護 RPC 可切換。原取消紀錄只回填可確認的最新取消，不臆測先前排班狀態。
- 比賽費依既有資格重新同步未繳項目，維持繳費未開放；保留免繳、待審／已付、付款歷史及球員餘額。教練排班只恢復本次取消連動的來源，先前獨立取消不得復活。
- 手機確認視窗沿用 Element Plus、可捲動內容與至少 44px 操作區。

## 影響及界線

- 前端：新增恢復確認視窗、卡片／表格／詳情／行事曆入口、API／store 及版本排序測試。
- DB：CLI 產生的 `20261012033832_match_restoration_audit.sql` 相依於 `20261012024808_match_cancellation.sql`，提供 `restore_match(uuid,timestamptz)`、收緊取消版本檢查、私有稽核與來源恢復。無新角色 action、Storage、環境變數或路由。
- Edge：沿用目前取消欄位與提醒去重，不改同步或通知授權。補恢復後同步／提醒測試。
- 不自動修改外部 Google Calendar、不變更日期／地點、不自動退費或重新開放付款、不發布遠端。

## 驗證與發布

- API／store／Dialog／各入口同名測試，取消→恢復→再次取消及舊回應、缺版本、權限／失敗案例。
- 真正 PGlite SQL：RPC 權限與 raw DML、防舊版本／跨輪重送、稽核、原資料保留、未繳／免繳／付款／餘額、排班、重跑 migration。
- 完整費用計算、付款及教練排班 SQL、全量 Vitest、typecheck/build；隔離瀏覽器驗證手機／桌機成功、失敗、權限入口。
- 發布順序：取消 migration → 本次恢復 migration → 本系列 Edge Functions → 前端；staging、真實 PostgreSQL 多連線競態、Vercel Preview 與實體手機另行驗收。
- 回滾以保留欄位及私有稽核的 forward-fix 為主，舊前端不支援恢復；不可回退到忽略取消狀態的提醒／同步版本。

## 驗證結果

- API／store 32 tests、UI 9 檔 61 tests、parser／同步／提醒 3 檔 47 tests 通過。全量 Vitest 290 檔／1,725 tests（含 21 檔 108 項完整費用計算回歸）及 observer 13 tests 通過。
- `pnpm test:matches:sql` 通過取消 136＋恢復 228＝364 checks（LF／CRLF）；新增 SQL 測試使用原收費／教練 helper，涵蓋權限、版本／跨輪重試、歷程 ACL／RLS／不可改刪、失敗原子回滾、覆寫 timestamp 的 trigger 阻擋、費用／餘額／通知保留、排班衝突／資格／請假及 migration 重跑。
- `pnpm test:payments:sql` 與 `pnpm test:coach-schedules:sql` 全數通過。`pnpm build`（含 vue-tsc）通過，保留既有 Browserslist 與大 chunk 警示；確認按鈕品牌色調整後另補 8 項 Dialog 測試與最終 Vite build。
- 測試 log 存 `output/playwright/match-cancellation/restore-*.log`（Git ignored）。尚未執行遠端 migration／正式 RLS advisors／多連線 PostgreSQL、Vercel Preview、GitHub CI／secret scan 或實體 iPhone／Android。
- 隔離瀏覽器 390／768／1365 px 的卡片、恢復失敗保留／成功、唯讀權限及 Calendar 深連結恢復均已驗證。採用證據：`restoration/evidence.json` 中逾時前通過的 390 卡片 10／768 卡片 9 項、`restoration-1365-verified` 完整 PASS 13 項、`restoration-768-supplement` PASS 6 項、`restoration-calendar-390` PASS 5 項，共 43 recorded assertions（含重複初始化檢查，不代表 43 個不同情境）。所有執行的 page errors／外部請求／非預期寫入均為 0；品牌色實際為 `rgb(216,143,34)`。
- 初次整組在 768 重新載入等候 load event 逾時，保留 FAIL evidence；改為 DOMContentLoaded 後仍逐步驗證實際 UI。續跑的故意失敗 fixture 未清除及以 Escape 關閉滑鼠開啟選單的測試假設已修正，未改產品行為來遷就測試；只補驗未完成項目，不把失敗整組報告視為通過。最終截圖為 `restoration-calendar-390/390-calendar-restore-confirmation.png` 與 `restoration-1365-verified/1365-calendar-restore-confirmation.png`。
- 原 MatchRecordsView 約 638 行，優先將取消／恢復視窗狀態抽至 `useMatchStatusDialogs` 後 633 行；不在本次擴張重構既有表單／篩選，後續可獨立抽列表篩選。MatchDetailDialog 574 行只掛子元件與入口。原大型 parser／Edge Function 本輪僅增加測試，未擴大實作。
- migration／文件不適合 unit test，分別以真正隔離 SQL、文件 diff 與上述端到端檢查替代；公開 MatchRecord 欄位沒有新增，不改舊型別或 normalize 契約。
