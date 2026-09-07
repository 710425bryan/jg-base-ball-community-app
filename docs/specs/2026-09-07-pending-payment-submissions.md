# 待確認付款回報修改與刪除

使用者回報送出繳費資訊後不能更正。新增「待確認的付款回報」，僅列目前有效帳號本人送出、所有成員仍在 linked member 範圍內、未審核的付款回報。月／季費、裝備款及比賽費維持各自資料模型。

- 可改匯款日期、付款方式、帳號後五碼、備註、餘額扣抵；月／季費另可改實際付款及金額異常原因，多人季費逐項核對。
- 應收快照、球員、期別、品項不由使用者覆寫。需要換繳費對象時可先刪除整筆回報再重填；無應收快照的舊單只允許改匯款資料，金額更正需重填。
- 短繳／多繳需原因與二次確認，管理端仍依既有審核 RPC 核對。前端與資料庫皆驗證扣抵上限；實際餘額扣款仍在審核時執行。
- 刪除需二次確認，只撤回回報及其明細關聯，裝備／比賽款恢復待付款。不退款、不刪帳款、不改商品庫存／備貨／領取，也不建立餘額流水。
- RPC 與審核 RPC 鎖相同主單，再檢查原回報者、linked member、帳號有效期、未審核、未入帳與原 `updated_at`；不開放 raw table 新 policy。`P0002` 衝突會關閉舊編輯狀態並重載回報及付款資料。
- 新增清單與 Dialog 拆成獨立元件。既有 3,000 行以上頁面只增加掛載與 refresh key，避免改動原付款估算／建立流程。

## 驗證

- 舊 HEAD 確認沒有待審回報管理入口；新版 View 整合測試覆蓋掛載與資料重新整理。
- 完整指定收費回歸＋裝備純邏輯＋直接影響的 View／service／元件測試：28 files / 162 tests 通過。
- 新增 PGlite（PostgreSQL）隔離資料測試：117 assertions 通過，包括三種來源的本人／同球員另一帳號、停用／過期帳號、審核前後、舊版本、應收快照保護、一般／折扣金額、多球員季費、差額、餘額、金額格式、入帳保護、刪除後狀態及 EXECUTE 權限。
- `vue-tsc --noEmit` 與 `pnpm build` 通過。建置保留既有 Browserslist 資料更新與 chunk 大小提示。
- 使用 agent-browser 與模擬 RPC、實際 Vue／Element Plus／共用 Dialog / Select，檢查 360px、390px、700px、1280px。手機 Dialog 滿版且沒有橫向溢出；取消／儲存 44px，實際操作修改後五碼送出保留版本與完整明細，取消刪除保留回報、確認刪除後清單更新為空；無瀏覽器 runtime error。
- 正式專案 `qwxzwomzoyfkorbwsscv` 僅讀取 function 定義、欄位型別、FK、trigger 與 check constraints，確認沒有既有自助更新／刪除 RPC，並確認審核 RPC 的主單鎖定方式。未異動正式資料。

隔離 SQL 測試重跑：

```sh
npm install --prefix /tmp/jg-payment-db-test --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE_PATH=/tmp/jg-payment-db-test/node_modules/@electric-sql/pglite/dist/index.js node tests/database/pendingPayments.integration.mjs
```

## 部署與待驗收

先套用 `supabase_pending_payment_submission_self_service_migration.sql`，再發布前端。此 migration 必須在既有付款金額核對與裝備／比賽付款 migrations 之後執行；本次未套用正式／staging migration，未推送或部署前端。

隔離測試使用相同付款欄位與 FK 的最小 fixture，不代表正式完整 schema／trigger 整合已驗收；部署前需在 staging 套用並以真實審核 RPC 驗證更新／確認的雙連線競態、一般與折扣金額、多人季費、已確認歷史不變、餘額流水不變，再於部署後確認函式／GRANT 與資料。手機軟鍵盤、IME、iPhone 瀏海安全距離及登入後全頁端到端流程仍待實機驗收。

回退先移除前端入口，並撤銷兩支新 RPC 的 authenticated EXECUTE；本次未修改既有資料表欄位或歷史資料，不需資料回補。已由使用者自行撤回的回報不可透過程式回退自動復原。
