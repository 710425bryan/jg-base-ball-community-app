# 行事曆來源讀取修復與同步驗證

- 日期：2026-10-12（台灣）
- 目標：`PRODUCTION`；狀態：`BLOCKED`（正式來源持續回429，完整修復與前端正式發布未完成；Edge診斷修正已部署）。
- 使用者要求：修好行事曆來源讀取錯誤，確認手動與排程正常、已取消比賽不被覆蓋，部署正式環境。
- 起點：main `beb442d234b49cdf2b6dee436a74dcce50a43a32`、前端1.1.77、正式 `sync-match-calendar` v18。
- 採用 project-workflow、delivery-workflow、match-calendar-sync、auth-permissions 與 Supabase skills；延續同一發布工作的替代 staging 授權，不將隔離測試稱為獨立 staging。

## 問題與範圍

正式 function logs 已確認上游 Google 回應 HTTP 429，既有 handler 將其包裝成500；本機相同公開來源可讀取，不能因此宣稱正式同步成功。不得藉由代理、區域/IP切換或偽裝請求來規避限制。

最小修正包含獨立來源讀取 helper：有限等待、逾時／回應大小及完整 iCal 檢查、短期有效內容快取、同來源併發合併及限流冷卻；錯誤回傳可辨識的安全狀態，無來源秘密URL／憑證或上游HTML。手動流程收到明確限流時顯示等待提示，不再轉第三方proxy重試。保留既有parser、名單、費用及取消規則。

限流參考：[Google Calendar 官方錯誤處理](https://developers.google.com/workspace/calendar/api/guides/errors)與[配額處理](https://developers.google.com/workspace/calendar/api/guides/quota)。API文件的退避原則可供參考；本次實際錯誤來自公開iCal來源，不能臆測為API專案配額。

## 驗收條件

- 合法iCal來源才能進入parser／同步；失敗、HTML或不完整內容不可當成空日曆成功。
- 手動預覽與排程使用相同來源規則；429不擴大請求，也不顯示完成。
- 取消場次以UID／既有fallback匹配時skip；規劃後才取消的UPDATE仍以 `cancelled_at IS NULL` 保護，每次schema相容重試保留條件；零列不可重建。
- 恢復後仍可更新原ID，沒有不必要的費用、通知、角色或資料庫變更。
- 正式修正後須有來源成功、同步規劃及受控排程執行證據；若上游仍限流，明確列為未完成，不以錯誤處理改善代替修復。

## 驗證與安全

- Unit：source helper 的正常、429／Retry-After／冷卻／併發、逾時、size、invalid iCal；手動service正常／明確來源錯誤與fallback；Edge真handler auth／dry-run／寫入取消保護。
- 整合：parser、matchesApi、store、SyncCalendarDialog既有取消與恢復回歸，隔離瀏覽器手動解析→確認。
- 全域：`pnpm check`、GitHub Quality gate／Secret scan、候選Preview及正式smoke。
- 正式診斷先只讀；正常同步前先審核計畫，只用正式既有排程授權與目前時間範圍。取消／付款不以真實資料造測試案例；如實際執行同步，先後對取消場次與付款相關資料取摘要指紋，僅保存聚合結果。
- 不寄登入碼、不冒用使用者登入、不更動secret或cron排程。使用者登入分支採隔離測試，若有現成授權UI才進行正式唯讀操作。

## 發布與回復

- Branch：`codex/calendar-source-recovery`；正式Supabase `qwxzwomzoyfkorbwsscv`，Vercel正式branch `main`。
- 前端候選版本1.1.78，版本產物由Vite plugin產生。
- DB migration：預計無；保留前次已部署取消／恢復／費用標示結構。
- 只發布 `sync-match-calendar`，保留 `verify_jwt=false` 及既有custom-secret／user bearer權限；不發布提醒或其他函式。
- 順序：完成review／測試／CI → 精確function部署與受控只讀驗證 → 手動與排程驗證 → 前端發布／正式驗收。
- 若429持續，保留可診斷證據、停止無效重試，評估上游解除限制或有正式授權的Google API；不得宣稱已正常同步。
- 回復為本次發佈前v18來源／1.1.77前端；必須保留取消skip與原子UPDATE防護。不自動還原已成功同步的業務資料。

## 結果

候選程式 commit：`6edbee255a292af79769dc1fe6739e6ede50bc03`；[PR #2](https://github.com/710425bryan/jg-base-ball-community-app/pull/2)。

- `pnpm check` 完整通過：291 files／1776 tests、observer 13、角色／訓練／教練／付款／取消／恢復 SQL 回歸與 production build；本機採 `VITEST_MAX_WORKERS=2`，未更動測試規則。
- 真實手動元件、service、parser、store、API 的隔離 HTTP 瀏覽器驗證共4情境通過：Edge預覽後更新、舊部署相容、預覽後取消而零列重查略過、429明確提示且不轉代理；無非預期HTTP／pageerror。沒有真實登入者session，不能稱為正式使用者端到端成功。
- GitHub [CI 38212748257](https://github.com/710425bryan/jg-base-ball-community-app/actions/runs/38212748257)：Quality gate／Secret scan均成功。
- Preview `dpl_28uD9nkWPWFDe1KdtaCDVLbpnpv2`，上述commit，READY。授權唯讀檢查version=1.1.78、首頁200／正確title／app mount；實際MatchRecordsView資產含限流文案、error code及requireActive取消條件。
- 正式 `sync-match-calendar` v18→v19，ACTIVE，`verify_jwt=false`。回讀4個來源檔與候選commit忽略換行後完全相同；OPTIONS=200、未授權=401。未部署其他函式、未變更DB／secret／cron。
- 正式授權dry-run：2026-10-12 06:33:44 UTC、06:34:54 UTC與06:37:34 UTC均回503／`CALENDAR_SOURCE_RATE_LIMITED`，upstream429；Google未提供Retry-After，service採60秒冷卻。第二次在約70秒後，第三次再等待超過2分鐘；3次均未進入同步寫入。停止重複嘗試，不能宣稱已修復來源。
- 06:37 UTC只讀統計：正式已取消比賽及其關聯費用目前均0筆；因此取消案例證據來自真handler、API及隔離瀏覽器fixture，不以空的正式資料集合宣稱驗證了真實取消個案。沒有建立或取消真實比賽作測試。
- 每日排程仍啟用，`0 16 * * *`（台灣00:00）；本次尚未執行正常同步。2026-10-11 16:00:03 UTC有歷次HTTP200，可證明當次呼叫成功，不能取代新版本實際同步驗證。
- 前端1.1.78保留Preview，尚未合併main／部署正式；正式前端維持1.1.77。Edge v19改善診斷與停止失敗寫入，但完整修復仍待來源恢復。

證據（ignored）：`.codex/runtime/releases/2026-10-12-calendar-source-recovery/` 的 pnpm-check、Edge before/after、聚合dry-run JSON；`output/playwright/calendar-source-recovery/manual-sync/` 的4情境及截圖。沒有保存來源事件內容、登入token或secret。

若公開iCal仍持續限流，下一步需上游恢復或現有的Google Calendar API授權設定；已詢問使用者是否具備與設定位置，不要求在對話貼金鑰。官方API的[public events唯讀scope](https://developers.google.com/workspace/calendar/api/auth)及[API key／OAuth授權選擇](https://developers.google.com/workspace/guides/create-credentials)可供最小權限方案評估；本次尚未切換API或新增憑證。
