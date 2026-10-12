# 賽事卡片與取消／恢復：1.1.77 發布紀錄

- 需求：2026-10-12 使用者明確授權將本次比賽卡片、取消／恢復比賽、比賽費取消標示一起部署正式。
- 目標：`PRODUCTION`；本檔建立時狀態 `VERIFYING`。
- 範圍：既有兩份規格 `2026-10-12-match-cards-cancellation.md`、`2026-10-12-match-restoration.md` 及比賽費取消標示補充。
- 前端：1.1.76 → 1.1.77；版本檔由 Vite plugin 產生，hash routing、權限與既有付款紀錄保持原規則。

## 正式目標與相依順序

1. Supabase `jg-base-ball-community-app`／`qwxzwomzoyfkorbwsscv`。禁止以 `db push` 重播未對齊的歷史 migration。
2. 依序套用 `20261012024808_match_cancellation.sql`、`20261012033832_match_restoration_audit.sql`、`20261012053334_match_fee_cancellation_status.sql`；先確認正式 catalog 的精確 patch 錨點及 owner／ACL，保存函式備份。
3. 部署 `send-match-reminders`（保留 `verify_jwt=true`）、`sync-match-calendar`（保留線上 `verify_jwt=false` 與應用 custom-secret／user bearer 驗證）。只部署這兩支；不触發正常提醒或同步。
4. GitHub `710425bryan/jg-base-ball-community-app` → Vercel project `prj_Ct3Ifa2JcREe4U5ZrOZpXhiJ7wjL`／team `team_NtAzFlUwIuQX9YmCAMDxzHoX`，正式 branch `main`。先 feature branch／PR 的 CI 與 Preview，再發布正式。
5. 正式網址 `https://jg-base-ball-community-app.vercel.app`，上線後確認 version、頁面／資產、RPC 權限及排程健康。

## 發布前證據與限制

- 發布前正式 deployment `dpl_FcdJzwR4UYHiSj3zknYmuqkCxsuM`，commit `800559136a100a681c34cd3b09e1786f527cc4ee`，版本1.1.76。正式三份 migration 尚未套用，取消欄位／RPC／private audit 尚不存在。
- 本機已有完整單元、取消／恢復／付款 SQL、390／768／1365 px 真實元件與 App 隔離瀏覽器驗證。發布前再次執行完整 `pnpm check`，CI／Secret scan 以本次 PR commit 為準。
- 唯一可存取的 Supabase 專案為正式環境，沒有 development branch 或獨立 staging project。Vercel Preview 與正式共用 Supabase 環境設定，因此不對 Preview 執行真實業務寫入；正式 catalog 隔離演練與遠端唯讀 post-check 的證據不得誤稱為獨立 staging。
- 不新增真實比賽、不取消／恢復使用者既有比賽、不建立付款或發送正常推播來測試。代表性變更／失敗／權限測試使用隔離資料。
- 詳細執行證據保存在 ignored `output/playwright/match-cancellation/release/`；不保存 credentials、個資或真實付款資料。

## 回復方案

- 前端可回復上述既有 Vercel deployment；避免直接刪 DB 欄位／audit。若已使用取消功能，舊前端／舊提醒不認得取消狀態，優先 forward-fix。
- Edge 保存發布前 source；必要時逐支回復，但取消功能啟用後必須保留跳過取消的保護。
- DB 以交易套用及精確錨點失敗即中止，保留先前函式／ACL備份；出現問題以經驗證的 forward-fix 處理，不刪除取消／恢復歷程或付款。

## 上線结果

待本次 CI、catalog 演練及正式發布完成後更新。未完成檢查不標記 `DEPLOYED`。
