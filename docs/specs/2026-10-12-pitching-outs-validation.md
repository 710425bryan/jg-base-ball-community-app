# 投手出局數驗證：1.1.79 發布紀錄

- 日期：2026-10-12（台灣）；目標：`PRODUCTION`；狀態：`DEPLOYED`（15:27 正式靜態驗收，15:28 登入入口驗收完成）。
- 使用者已明確要求將本次投手出局數修正部署正式環境。
- 起點：main `76dfb3ef1ff84aec75ffef86d1cc207bba18c019`，正式前端 1.1.78。
- 採用 project-workflow、match-records-media、delivery-workflow、Vercel deployments-cicd 與 vercel-cli skills。

## 問題、範圍與驗收

`PitchingStat.ip` 保存整數出局數，既有欄位容許填入 `0.66`，格式化時錯誤拼成 `0.0.66`。投 ⅔ 局應填 2，顯示 `0.2`；9 出局數顯示 `3.0`。

- 投手表單抽到 `MatchPitchingStatsEditor`；初始化、驗證與預覽由 `matchPitchingStats` 共用，不繼續擴大既有大型 Dialog。
- 小數及空值保留供更正，顯示欄位錯誤，局數／防禦率預覽為 `—`，不四捨五入或猜測局數。
- 新增／編輯從任何頁籤儲存時，都拒絕無效出局數並切回投手頁籤；更正為 2 後正常保存整數與其餘成績。
- 載入目前投手、逐局重算、新增／移除投手與既有七局制防禦率維持原行為。
- 不批次修復既有資料，不修改權限、費用、通知、路由、資料庫或 Edge Functions。
- 保留 Element Plus、hash routing、PWA 更新與 legacy build；瀏覽器測試使用隔離 fixture，遠端驗收限唯讀。

## 驗證計畫與結果

| Gate | 狀態／證據 |
| --- | --- |
| Targeted | 實作階段 3 files／40 tests 通過（含實際 Element Plus 輸入 0.66、更正 2、保存阻擋） |
| 賽事回歸 | 實作階段 7 files／55 tests 通過，涵蓋 API、陣容、即時比分、語音、照片、天氣與成績彙總 |
| 型別／diff | 實作階段 vue-tsc、git diff --check 通過 |
| 完整品質 gate | pnpm check 通過：293 files／1804 tests、observer 13 tests、角色／特訓／教練／付款／取消／恢復 SQL 回歸、型別與 production build；僅既有 Browserslist／chunk size 提示 |
| GitHub | 候選 CI 38217067613、main CI 38217558309 的 Quality gate／Secret scan 全數成功 |
| Preview | dpl_6yqzjuogdaG6c1Jb9d9omFjrpCYw READY；版本 1.1.79、首頁與投手成績資產唯讀驗收通過 |
| Production | dpl_D8Y2MrTs4AaJH1mv5DLktQRuUiJU READY，正式網域已指向本部署；7 個靜態請求均 200、版本與成績資產符合預覽，公開首頁與登入視窗正常 |
| Supabase staging／migration／Edge | N/A，本次純前端 |

## Release Manifest 與回復

- Branch：`codex/pitching-outs-validation`；production branch：`main`。
- GitHub：`710425bryan/jg-base-ball-community-app`。
- Vercel project：`prj_Ct3Ifa2JcREe4U5ZrOZpXhiJ7wjL`；team：`team_NtAzFlUwIuQX9YmCAMDxzHoX`。
- 正式網址：https://jg-base-ball-community-app.vercel.app；版本：1.1.79。
- 環境變數、Supabase migration、Edge Function、Storage、Auth、secrets 與 cron：無異動。
- 發布順序：本機完整 gate → feature branch／PR → 同 commit CI／Preview → 合併 main → 正式網域／版本／資產及登入入口驗收。
- 發布前正式部署：`dpl_3j2KRaNjTBHTwWKUPFpsPTteYFYW`（上述起點 commit），可作為前端回復目標。
- 資料庫未變，不需資料回復；測試不得新增正式賽事、寄送 OTP 或發送通知。
- 證據存放 Git ignored 的 `.codex/runtime/releases/2026-10-12-pitching-outs/`。
- 正式登入後互動未使用真實帳號或真實賽事測試；以隔離實際元件／Element Plus 瀏覽器驗證及正式資產比對替代。實體 iOS／Android 未驗收，不宣稱完成全站手機版面稽核。

## 發布結果與證據

- 候選 commit：`8035398ca76092fee15a6d44f83654932f1d4e9b`；[PR #3](https://github.com/710425bryan/jg-base-ball-community-app/pull/3)。
- 合併 commit：`9c2f5b243015a9bb06b13324a307b5510efa140a`，與候選 tree 完全一致。合併前完成 [PR CI](https://github.com/710425bryan/jg-base-ball-community-app/actions/runs/38217067613)，合併後 [main CI](https://github.com/710425bryan/jg-base-ball-community-app/actions/runs/38217558309) 亦通過。
- Preview：https://jg-base-ball-community-84q4kzbs0-710425bryans-projects.vercel.app。MCP 建立的分享連結遭 SSO 拒絕，未重試同一失敗方式；改用 CLI 自有登入的唯讀 `vercel curl` 成功驗收，沒有關閉部署保護。
- 隔離 Chromium 實際桌機與 390×844 表單：`0.66` 保留原值、顯示 `—` 與錯誤、不新增保存；改為 2 後保存 payload 為整數 2，局數 `0.2`，三振等其他欄位保留。沒有外部請求。初次測試 fixture 缺 store.matches 而失敗，只修補 fixture 後重驗，未更動產品來配合測試。
- 2026-10-12 07:27:22 UTC 正式靜態驗收：version／index／賽事主檔／三個預載檔均 HTTP 200；index 為 `index-CdggW-v-.js`，賽事檔為 `MatchRecordsView-DnlhSh2f.js`。
- 正式賽事檔與已驗收 Preview 逐位元相同，SHA-256：`0b9fd571c454266180abecb22b05dc82ed5a2fbcb19d892522ea8200f037a9b8`；包含整數驗證、儲存阻擋與「投 ⅔ 局請填 2」说明。
- 全新瀏覽器完成公開首頁 → 會員登入視窗 → 關閉，console 0 errors／0 warnings。沒有寄出 OTP、登入、異動真實賽事或觸發通知。
- 本次只發布前端 1.1.79，沒有 Supabase migration、Edge Function、環境變數或資料修復；既有小數紀錄須由使用者確認正確出局數後自行更正。
- 證據位於上述 ignored 目錄：`pnpm-check.log`、`browser-evidence.json`、`mobile-invalid.png`、`preview-evidence.json`、`production-smoke.json` 與 `main-ci-watch.log`。發布成功，未執行回滾；必要時使用發布前正式部署回復。
