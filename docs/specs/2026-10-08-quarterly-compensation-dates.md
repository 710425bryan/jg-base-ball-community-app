# 季費堂數不足補償日期修正與 1.1.72 升版

- 狀態：`VERIFYING`（本機完整檢查已完成；GitHub CI／部署待遠端確認）
- 本次交付目標：完成本機修正、升版、commit 並 push 到 `origin/main`。
- 日期：2026-10-08
- 需求：10–12 月季費因 11/28 停課，11 月設定 3 堂、基準 4 堂，產生待審卻沒有紀錄；可提前產生季繳球員補償。

## 範圍與原因

正式資料庫唯讀查核確認：舊產生 RPC 合併不同課程的月份日期，3 天季費共用課表加上 5 天其他課程，被判為 8 天而不產生補償。面板只讀共用課表，所以仍顯示少 1 堂；零筆結果又無條件顯示成功。

修正保留 `quarterly` 受補償球員條件，以季費面板共用的 `get_training_month_dates(month, 'chunggang_school_team')` 為日期來源，基準獨立計算當月週六數。此 key 選的是既有共用課表，不依月費分部決定補償對象。未設定月份沿用該課表預設，補課不限星期；未來月份可先產生待審。

非目標：改動月費、季費收費資格、金額歸屬、付款快照、已審核紀錄或自動核准／入帳。本次不套用遠端資料庫 migration、不部署 Edge Functions、不修改 secrets 或環境變數。

## 驗收條件

- [x] 重現舊 SQL 在 4 堂基準／3 堂設定／5 堂其他課程時回傳零筆。
- [x] 修正後季繳球員產生 1 天待審補償，一般／折扣為 500／250 元。
- [x] 校隊月費、固定月費、計次月費、不收隊費與退隊球員不混入本案例季費補償。
- [x] 非週六補課、超額日期、重複日期、跨月日期、空設定、未設定月份及未來月份驗證。
- [x] 重複產生沿用原項目；已核准／略過及既有帳款、付款快照、餘額不被覆寫，核准才入帳。
- [x] 無登入／無 `fees:EDIT` 拒絕；RPC ACL、security mode 與 search path 保留。
- [x] 前端零筆顯示警告與持續提示，已審核不算待審，產生期間避免重複提交與切月。
- [ ] 手機實機／瀏覽器版面驗收：未執行；保留既有 Element Plus 選單與版面。

## 實作與資料安全

- `QuarterlyFeeCompensationPanel.vue`：明確日期來源、實際待審筆數與空結果提示。
- 新 migration 僅局部替換產生 RPC 的日期區塊，保留已部署的季費本人歸屬修正；精確驗證替換命中數、LF／CRLF 及重跑行為，未知定義完整失敗。
- 元件互動測試與隔離 PGlite 回歸使用合成資料，不在正式資料庫建立測試補償或付款。
- `package.json`：1.1.71 → 1.1.72，PWA `public/version.json` 由既有 Vite plugin 產生。
- 使用 skills：project workflow、finance payments、training dates、Supabase、delivery workflow。

## 驗證證據

| 項目 | 結果 |
| --- | --- |
| 完整費用計算及直接相關單元測試 | 25 files／127 tests 通過 |
| 完整付款 SQL | 613 checks 通過，含本次 21 × 4 組 LF／CRLF |
| 型別與 diff 檢查 | 通過 |
| 正式函式唯讀相容查核 | 新 migration 的兩個舊區塊各命中一次，未遠端寫入 |
| 全量品質檢查／production build | 型別、264 files／1438 tests、角色 SQL 155 checks、教練 SQL 508 checks、付款 SQL 613 checks 與 production build 通過 |
| GitHub CI／Secret scan | 待 push 後執行 |
| Preview／手機實機／獨立 Supabase staging | 未執行 |

首次 `pnpm check` 在預設大量平行執行時有 4 個既有測試超過 5 秒；單獨重跑 4 files／87 tests 通過。隨後以 `vitest run --maxWorkers 4` 跑完整 264 files 全綠，再依序跑原品質閘門的全部 SQL suites 與 Vite build；未改測試 timeout 或測試規則。

## Release Manifest

- Git：`main` → `origin/main`，使用者明確授權 commit／push；不建立額外 PR。
- Vercel：沿用既有 Git integration；push 成功不等同已完成部署驗收。
- Supabase migration：`supabase/migrations/20261008050733_quarterly_compensation_training_dates.sql`，尚未部署。
- 相依：既有訓練 program 日期 RPC、季費補償原 migration 及季費本人歸屬修正已存在。
- 遠端 DB 發布另行處理：套用精確 migration → 確認 function definition／ACL、課表堂數與既有資料 fingerprint → 管理端產生並逐筆核對。
- 前端可相容現行 RPC，DB migration 未套用前，11 月的根因仍存在，前端會明確提示零筆。
- Edge Functions、Storage、Auth、環境變數、通知：無變更。
- Rollback：前端可回到前一部署；DB 優先 forward-fix，不刪補償或餘額歷史，本次沒有 DB mutation。
