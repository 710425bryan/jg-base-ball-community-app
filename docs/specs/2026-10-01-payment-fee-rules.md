# 查看成員：管理員收費時間與規則

- 日期：2026-10-01
- 狀態：本機實作及自動／瀏覽器驗證完成；使用者已授權以 1.1.69 提交並推送目前 `main` 分支，CI／部署結果與實機驗收待確認
- 使用者需求：在繳費資訊的「查看成員」區塊加入所有收費類型的時間和規則，只有管理員可見。

## 行為與範圍

- 在 `PaymentMemberSelector` 下方嵌入預設收合的「收費時間與規則」，開關支援鍵盤與 ARIA，觸控高度至少 44px。
- 以 `usePaymentSubmissionAccess.isPaymentAdmin` 判斷有效 `ADMIN`，包含帳號啟用及存取期間；家長、球員、經理、教練及停用／未開始／過期 ADMIN 均不顯示。
- 涵蓋中港校隊計次月費、國中部單次月費、國中部訓練日期月費、社區固定月繳、社區計次月費、社區季繳、比賽費、裝備款及不收隊費。
- 說明台灣時間的開放日、訓練／請假、折扣、手動扣減、加入期別、餘額扣抵、短繳／多繳及回報／快照保護；實際金額依個別設定與當期帳款。
- 新面板為單一職責子元件，避免增加逾 3,000 行 `MyPaymentsView` 的業務邏輯；該頁只接入既有權限 computed 與 prop。
- 此 UI 需求沒有新資料查詢、權限、付款計算或 DB 變更。國中部付款開放時點於後續 SQL 錯誤修復中另行部署，見 `2026-10-01-junior-high-payment-open-period.md`；本 UI 尚未發布。

## 驗收

- 展開後包含九種情況；預繳月費每月 25 日開放下月、計次月費次月 1 日、季費每季末月 25 日。
- 說明比賽費手動開放、裝備核准即可付款、不收隊費仍有獨立比賽費及裝備款規則。
- 切換到其他角色或無效 ADMIN 時，整個說明區塊移除。
- 手機單欄、桌機雙欄，無水平溢出；成員選單沿用共用 Element Plus select。

## 驗證與發布

- 對應測試：`PaymentFeeRulesPanel.test.ts`、`PaymentMemberSelector.test.ts`、`usePaymentSubmissionAccess.test.ts`、`MyPaymentsView.test.ts`。
- 必跑：完整費用計算回歸、型別檢查、production build；瀏覽器以合成資料驗證角色與響應式版面。
- 2026-10-01：上述完整費用回歸與直接測試合計 25 files／140 tests 通過；`pnpm typecheck`、`pnpm build` 通過，建置只有既有 Browserslist 資料過期及 chunk 大小提示。
- 推送前完整 gate：240 files／1,233 unit tests、教練排班 SQL 81 checks、付款 SQL 529 checks、型別及 1.1.69 production build 通過。第一次全量執行有既有 MainLayout import 的 5 秒逾時；單獨執行通過，以 `--maxWorkers 2` 全量重跑全數通過，沒有調整測試條件。
- agent-browser 掛載實際 selector、面板及權限 composable；360／390／700／1280px 展開九張卡片均無水平溢出，按鈕 44px，桌機雙欄／手機單欄；390px 根字級 20px 仍正常換行。Enter 展開及 Space 收合通過，瀏覽器無執行錯誤。合成資料驗證有效 ADMIN 可見，其餘四角色、停用／未開始／過期 ADMIN 及匿名不可見。
- 文件與純 UI 說明沒有新增資料表／RPC，DB 邊界以沿用有效 profile gate、無新資料查詢及 diff 檢查確認。既有大型 view 只新增兩行接線，所有新文案及展開狀態放在獨立子元件。
- 發布前仍需真實登入與 iPhone 裝置驗收；回復方式為回復此 UI 變更，無資料回填或回復需求。
