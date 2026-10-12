# 行事曆來源讀取修復與同步驗證

- 日期：2026-10-12（台灣）
- 目標：`PRODUCTION`；狀態：`IMPLEMENTING`。
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

實作、測試、正式驗證與部署結果待補；未完成項不標記完成。
