# 賽事卡片與取消／恢復：1.1.77 發布紀錄

- 需求：2026-10-12 使用者明確授權將本次比賽卡片、取消／恢復比賽、比賽費取消標示一起部署正式。
- 目標：`PRODUCTION`；狀態：`DEPLOYED`（2026-10-12 台灣 14:08:50 正式網站驗收通過）。
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
- 使用者於本次發布明確回覆「同意，本次採替代驗證繼續部署」，核准以隔離演練、Preview 及正式唯讀 post-check 替代本次缺少的獨立 staging；不改寫專案日後的 staging 規則。
- 不新增真實比賽、不取消／恢復使用者既有比賽、不建立付款或發送正常推播來測試。代表性變更／失敗／權限測試使用隔離資料。
- 詳細執行證據保存在 ignored `output/playwright/match-cancellation/release/`；不保存 credentials、個資或真實付款資料。

## 回復方案

- 前端可回復上述既有 Vercel deployment；避免直接刪 DB 欄位／audit。若已使用取消功能，舊前端／舊提醒不認得取消狀態，優先 forward-fix。
- Edge 保存發布前 source；必要時逐支回復，但取消功能啟用後必須保留跳過取消的保護。
- DB 以交易套用及精確錨點失敗即中止，保留先前函式／ACL備份；出現問題以經驗證的 forward-fix 處理，不刪除取消／恢復歷程或付款。

## 上線結果

- 候選 commit `da1424c499098de09f4c5a1bfbecdf52b0cb8ec0`；[PR #1](https://github.com/710425bryan/jg-base-ball-community-app/pull/1) 已合併為 main `f668f6f3b7ee8d3946cdc2ec4bf4f18ec298b179`，兩者 tree 完全相同。
- 正式 Vercel `dpl_G9cH6ZB5Myni4xTb2ibQuUghqkig` READY／production／上述 main commit，[正式網址](https://jg-base-ball-community-app.vercel.app) alias 已切換；合併後 [main CI](https://github.com/710425bryan/jg-base-ball-community-app/actions/runs/38210684373) 全數通過。
- 正式 `/version.json`=1.1.77，index／11 個應用資源／Logo HTTP 200，Logo 149,206 bytes 與已驗收指紋相同。乾淨、非持久瀏覽器實開公開首頁→會員登入視窗→關閉成功，console 0 errors／0 warnings；只有公開摘要／主題、auth settings 與版本讀取，未寄碼、登入或操作業務資料。驗收時間 2026-10-12 06:08:50 UTC。
- 候選 [GitHub CI](https://github.com/710425bryan/jg-base-ball-community-app/actions/runs/38209464889) 的 Quality gate／Secret scan 通過。完整 `pnpm check` 包含 290 檔／1,739 項 Vitest、observer 13、roles SQL 216、training SQL 394、coach SQL 508、payments SQL 669、取消 SQL 136／恢復 SQL 228、型別與正式 build。首次本機 2 個冷載入 timeout，未改 timeout 或測試；限制本機 workers=2 後完整原指令通過，雲端預設設定亦通過。
- Vercel Preview `dpl_HfkWUfnSgEyi6nSzvYPyKU5G6Bcc` READY、commit 與候選一致；version=1.1.77、index／11 個應用資源／Logo 皆 HTTP 200，Logo 指紋符合本機資產。只讀靜態驗收，互動流程採既有隔離瀏覽器證據。
- 正式 DB 於台灣 2026-10-12 14:01:49 完成驗證。31 份正式函式及安全設定的隔離 LF／CRLF 演練 616 項通過；套用前即時備份、221 項檢查及 schema／default grants 比較無 drift。依序套用三檔精確內容，正式 catalog post-check 304 項通過，包括 40 函式全文及 owner／ACL／SECURITY／search_path／回傳型別、三欄、五個 trigger、稽核存取拒絕及 ledger。原月份比賽費清單 RPC 維持原定義與權限。

| 本機 source 版本 | 名稱 | 正式 migration ledger 版本 |
| --- | --- | --- |
| 20261012024808 | match_cancellation | 20261012055931 |
| 20261012033832 | match_restoration_audit | 20261012055958 |
| 20261012053334 | match_fee_cancellation_status | 20261012060020 |

- 遠端工具自動產生 ledger timestamp；上表為正式對應，不重新套用本機版本，不做 history repair。既有四表 ACL／RLS／policy／constraint／index 及 default grants 保留，只有預期的新欄位與取消 constraint。安全 advisor 無新增 ERROR、mutable-search-path 或匿名可執行函式；四項預期提示為私有稽核表刻意無 client policy 與三個受授權的 definer RPC。
- 正式 Edge：`send-match-reminders` v24 → v25 ACTIVE（`verify_jwt=true`）、`sync-match-calendar` v17 → v18 ACTIVE（`verify_jwt=false`，既有應用驗證保留）。回讀 9 個來源檔與候選逐字一致；兩支 OPTIONS／缺少身分／無效身分共 6 項通過。提醒 dry-run=200、health checked=true，提醒及 health 的 created／dispatched 皆 0。未修改 secret／cron，沒有正常推播或同步。

## 已知限制及證據

- Calendar 正式授權 dry-run 在部署前 v17 及部署後 v18 均為 HTTP 500／Google Calendar 來源讀取失敗，未解決其既有外部讀取問題。來源 URL 指紋與設定保持不變，本機同一公開來源可讀取有效 iCal 102 個事件。
- 2026-10-12 起的 21 場只讀規劃比較：舊部署 parser 為 0 新增／0 更新／21 略過，既有 repo 基線與本次候選均為 0／6／15；這 6 場是既有 parser 的請假名單同步差異，下次成功同步可能生效。本次取消保護相對 repo 基線沒有額外 action／payload 差異。未執行計畫；早期臨時比較器參數反向所得「0 場」結論已撤銷，不作證據。
- 沒有獨立 Supabase staging、真實 PostgreSQL 多連線競態或實體 iPhone／Android 驗收；沒有以正式使用者賽事／付款做取消、恢復或退款測試。正式安全模式／函式定義／資產查核加上隔離合成交易為本次已核准的替代驗證。
- DB／前端證據：ignored `output/playwright/match-cancellation/release/`，含 `release-result.md`、即時 catalog 備份、`applied-migrations.json`、`production-postcheck.log`、advisors diff、`preview-smoke.json`、`production-smoke.json`、`production-login-entry.png` 及完整測試 log。
- Edge 證據：ignored `.codex/runtime/releases/2026-10-12-match-cancellation/` 的 `edge-postcheck-evidence.json`、`edge-release-readiness.md`、前後 source 備份與 `calendar-readonly-aggregate.json`；不保存憑證值、比賽／名單個資或付款內容。
