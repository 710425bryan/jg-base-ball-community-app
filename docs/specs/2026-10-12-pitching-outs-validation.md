# 投手出局數驗證：1.1.79 發布紀錄

- 日期：2026-10-12（台灣）；目標：`PRODUCTION`；狀態：`VERIFYING`。
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
| GitHub | 待同一候選 commit 的 Quality gate／Secret scan |
| Preview | 待同一候選 commit 的版本、資產與唯讀驗證 |
| Production | 待部署與正式網域驗收 |
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
- 未完成項目：瀏覽器驗收、GitHub CI、Preview 與正式部署；尚不可稱為已上線。
