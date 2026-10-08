# 手機 UI/UX 一致性稽核與執行清單

### 2026-10-08 季費補償產生結果提示（待實機驗收）

- 季費補償面板零筆結果顯示持續提示及警告；已審核紀錄不計入成功訊息的待審筆數。產生期間停用月份選擇及重新整理，載入期間停用產生按鈕，保留既有 Element Plus 月份選單及版面。
- 驗證通過：完整費用計算及直接相關測試 25 files／127 tests、付款 SQL 613 checks（含本次 21 checks × 4 組 LF／CRLF）、型別檢查及 `git diff --check`。正式函式唯讀確認兩個替換區塊各命中一次；此次未進行 build 或手機實機／瀏覽器版面驗收，不代表整個費用頁完成 UI 稽核。前端與日期修正 migration 尚未部署。
- 1.1.72 升版補驗：全量 264 files／1438 tests、角色／教練／付款 SQL 與 production build 通過；全量測試以 `--maxWorkers 4` 避免本機大量平行執行造成的既有測試逾時。手機實機與瀏覽器版面驗收仍待執行，資料庫 migration 未套用；發布紀錄見 `docs/specs/2026-10-08-quarterly-compensation-dates.md`。

本文件依 `docs/MOBILE_UI_UX_RULES.md` 追蹤登入後 `MainLayout` 頁面的實際調整進度。規則文件是目標規格，本文件是執行帳本；未完成程式修改與視覺驗收前，不得將項目標示為「完成」。

清單新增 `/my-coach-leave-requests` 與 `/coach-leave-requests`，兩路由共用 `CoachLeaveRequestsView`；能力／體測列表與明細各自共用一套實作頁面。

### 2026-10-03 月份總覽、排班教練與未指派篩選（待實機驗收）

- 排班選項補入既有精確角色 `SCHEDULINGCOACH`（排班教練），沿用角色 weight／role_key 分組與有效期間；追加 migration 已套用正式 SQL，安全候選 RPC 確認 3 位有效教練。未更改角色權限或通知 worker，兩 private helper ACL／search_path 保留，其餘 14 支函式 hash 不變；正式驗證未寫排班／假單／範本測試資料。
- 月份選擇區有直接可見的「月份總覽」，依日期／時間顯示完整月份的課程／比賽／場地與已保存教練；不受卡片來源或未指派篩選影響。獨立 RPC 快照在開啟／回到前景更新，保留卡片草稿與失敗重試，舊月份回應不覆寫新資料。
- 場地訓練採藍色、比賽採既有琥珀橘色，淡底、4px 左邊條及來源文字徽章一致；已修正列表分隔線蓋掉第二筆以後左邊條的樣式衝突。正常 footer 僅「關閉」，錯誤區才提供單一 44px「重試」。
- 新增「未指派教練」切換，與來源篩選取交集、顯示當前來源未指派活動筆數；判定使用已保存的教練 IDs，草稿選取後仍保留卡片，成功保存才移出。取消而空指派的活動保留狀態標記；移除候選活動／已儲存／已指派教練三個純統計。
- 最終 targeted 4 files／29 tests；完整 `pnpm check` 通過 262 files／1427 tests、教練 SQL 508 checks、角色 SQL 155 checks、完整付款 SQL、型別與 production build，紀錄 `/tmp/jg-coach-unassigned-filter-check.log`。migration 更名對齊正式 history 後的 73 項資格 SQL 亦通過；正式證據 `/tmp/jg-coach-scheduling-eligibility-production-evidence.json`。
- 真實 Vue／Element Plus／AppGlobalSelect 的 Chromium 在 360／390／767px 通過 330 checks（各 110 項，保留原 162 項），61 張截圖；涵蓋來源／未指派交集、角色群組、一次觸控保存與重試、全月與草稿隔離、前景更新／換月、同日多場地及來源色彩。入口／關閉／重試至少 44px，手機選單輸入 16px，無水平溢出、console/browser error 或外部請求；錯誤態 header／footer 關閉控制皆通過可見性與 elementFromPoint 觸及，Dialog top 0／height 844、overlay scrollTop 0。
- 最終證據 `/tmp/jg-coach-unassigned-month-overview-ui/evidence.json`，已目視 360／767px 來源顏色、360px 錯誤重試與 390px 月初畫面。另只重跑新情境補頁首圖，360／767px 的 112 checks 通過，已目視未指派與來源切換、總覽入口及統計移除後佈局；補充證據 `/tmp/jg-coach-unassigned-overview-final-shots/evidence.json`。重跑見 `tests/browser/README.md`，詳見 [月份總覽規格](specs/2026-10-03-coach-schedule-month-overview.md)。SQL 已部署，前端未 commit／push／發布，版本維持 1.1.69；實體 iPhone／Android IME、鍵盤與硬體 safe area、staging 多連線鎖競爭、CI／Vercel Preview 仍待驗收。

### 2026-10-03 固定教練與指派教練角色分類（待實機驗收）

- 固定範本、排班卡片及手動排班的教練選單沿用單一可搜尋多選，新增角色群組標題；順序依角色權限設定的 weight／role_key、標題依 role_name，組內依暱稱／姓名排序。卡片原請假註記／停用、已選 profile IDs 與保存權限保留。
- metadata 由父頁載入及範本開啟／重載時沿用原 permission store 查詢，卡片不各自查詢；只整理既有教練候選，不新增角色資格或 DB 權限。相關 7 files／53 unit tests 通過，涵蓋 legacy／缺 metadata／同分排序、反應式分組、跨組選取、請假禁選及 metadata 查詢次數。
- 完整 `pnpm check` 通過 260 files／1409 tests、角色 SQL 155 checks、教練 SQL 435 checks、完整付款 SQL、型別與 production build。瀏覽器發現手動 Dialog 的教練控制原為 40px／14px，補上該 Dialog 的局部手機樣式；修補後重跑 4 files／32 tests 及 `pnpm build`（含型別檢查）通過。
- 真實 Vue／Element Plus／AppGlobalSelect 的 Chromium 在 360／390／767px 通過 162 checks（各 54 項）：三種教練選單的群組、weight 反轉、role_name 改名、組內姓名排序、中文搜尋隱藏空組、跨組第一次保存與請假禁選皆通過，並保留原請假／場地範本／自動帶入回歸。卡片及手動選單／選項實測至少 44px、輸入 16px，無水平溢出、console error 或外部請求；已目視 360px 卡片及 767px 範本分組。
- 最新證據 `/tmp/jg-coach-template-role-groups-ui/evidence.json`、修補前量測 `/tmp/jg-coach-template-role-groups-ui/manual-control-metrics.json`；重跑方法見 `tests/browser/README.md`。完整 gate 紀錄 `/tmp/jg-coach-template-role-groups-check.log`。本次不新增 migration，前端尚未發布、版本維持 1.1.69；實體 iPhone／Android 中文 IME、鍵盤與硬體 safe area 仍待驗收。

### 2026-10-03 角色排序數字設定（待實機驗收）

- 「角色與權限設定」的 `RoleSortEditor` 在桌面選取角色區塊及手機權限 Drawer 提供 Element Plus 數字欄位與保存；數字小在前，包含 ADMIN／系統角色可調整，角色名稱不再用於特殊插隊。
- 保存只改顯示排序，成功先以 RPC 結果同步元件及 permission store 角色清單，再重新查詢；後續載入失敗仍保留新排序。使用者名單表格／卡片依 weight／role_key 共用順序，RPC 保存失敗保留數字。此項只稽核新排序控制與相關名單順序，不代表整個權限頁已符合全頁 UI 規則。
- 本次 targeted Vitest 9 files／88 tests、`pnpm typecheck`、production build 及角色 SQL 155 checks（建立 84＋排序 71）通過；unit 含保存成功後重新查詢失敗仍保留新排序。未執行完整 `pnpm check`。SQL 使用本地隔離 PGlite，不操作正式資料。
- 真實 `RolePermissionsManager`／`RoleSortEditor`／`UsersView`、Element Plus、store／service 搭配本機 Supabase mock，在 Chromium 360／390／700／1280×844px 通過排序 63 checks：八個初始數字、財務 20→5 後角色清單／store／使用者網格與表格重排、同分 `role_key` 順序、反覆保存、loading 一次 RPC／欄位與按鈕禁用、失敗保留草稿及易讀文字長名稱。數字欄位直接輸入，實測 176×44px，保存按鈕至少 44×44px，無水平溢出。新增角色複製舊流程另重跑 56 checks，兩組均無 console error／外部請求；已目視手機與桌面保存後畫面。
- 最後的 store 同步補正已重跑上述兩組瀏覽器回歸並通過；排序證據 `/tmp/jg-role-order-final-store-patch/evidence.json`，複製回歸證據 `/tmp/jg-role-copy-final-store-patch/evidence.json`。重跑指令見 `tests/browser/role-permissions/README.md`。本機驗證已完成，實體 iPhone／Android、硬體 safe area／鍵盤、正式帳號與排序 RPC／初始數字 migration 正式部署仍待驗收，尚未發布。

### 2026-10-03 固定排班範本：場地＋教練（待實機驗收）

- 表單簡化為場地、固定教練、選填名稱與啟用四欄；場地沿用共用單一可搜尋／自訂 Element Plus 選單，多選教練、44×44px 控制及 16px 手機輸入文字。活動卡片「存成範本」只預填場地與教練。
- 場地選項由僅需 `coach_schedules:VIEW` 的安全 RPC 取得共用常用場地，不依本月活動縮小。輸入新名稱先留在草稿，只有範本成功保存時同一交易建立；取消及失敗不新增場地。保留權限撤回、忙碌操作、未儲存確認及失敗草稿；儲存成功但重載失敗時禁止重複保存，需先取得新版資料。
- 本輪四欄位與操作 targeted suite 6 files／37 tests 通過；完整 `pnpm check` 通過型別、259 files／1393 tests、435 項教練 SQL、角色／完整付款 SQL 與 production build。正式 migration 已套用並驗證新版 schema／RPC 權限／唯讀預覽；前端尚未發布，版本維持 1.1.69。
- 真實 Vue／Element Plus 的 Chromium 在 360／390／767px 通過 117 checks（各 39 項）：四欄位、中文搜尋／自訂場地、多選、取消不保存、失敗保留、重開 ID 再選與同場地不同課程／同批撞班皆通過，保留請假四模式／自動帶入／手動排班回歸；控制至少 44×44px、輸入字級 16px，無 console error／外部請求／水平溢出。證據 `/tmp/jg-coach-venue-template-ui/evidence.json`，已目視 360px 場地與失敗草稿、390px 預覽及 767px 四欄位，重跑方法見 `tests/browser/README.md`。實體 iPhone／Android 鍵盤／中文 IME／硬體 safe area、staging 多連線競爭及正式帳號操作仍待驗收，詳見 [場地範本規格](specs/2026-10-03-coach-schedule-venue-templates.md)。

### 2026-10-03 固定排班範本直接新增（歷史驗證，已由場地＋教練取代）

- 範本管理視窗新增「新增範本」，僅 `coach_schedules:CREATE` 顯示；可直接填寫訓練日配對條件，或帶入本月訓練日／場地訓練活動。場地選項只來自排班頁已載入的實體場地，未新增 raw table 讀取；保留活動卡片「存成範本」入口。
- 新草稿不帶活動 ID／版本；切換範本或帶入活動前提示未儲存內容，失敗保留表單。沿用既有 RPC、Element Plus 與金橘樣式；手機文字／時間／選單及啟用開關提供至少 44×44px 觸控範圍與 16px 輸入文字。
- `pnpm check` 通過 258 files／1349 tests、332 項教練 SQL、角色及完整付款 SQL 與 production build；版本維持 1.1.69，保留原有其他工作區變更。此次無新增 SQL，前端尚未發布；正式登入與實體 iPhone／Android 鍵盤、safe area 仍待驗收。
- 真實 Vue／Element Plus 搭配隔離 API 的 Chromium 在 360／390／767px 通過 105 checks；保留原請假、範本複製及自動帶入流程，新增直接建立空白範本、帶入場地活動並各儲存一次。六份表單實測最小控制尺寸 44×44px、輸入字級 16px，開關有無障礙名稱；無 console error、外部請求及水平溢出。證據 `/tmp/jg-coach-direct-template-touch-ui/evidence.json`，已目視 360px 新增與 767px 場地帶入截圖，重跑方法見 `tests/browser/README.md`。

### 2026-10-02 新增角色複製權限（待實機驗收）

- 本次只調整「角色與權限設定」的新增角色視窗：「複製角色權限」沿用單一 Element Plus 選單，預設不複製；來源顯示角色名稱與識別碼，ADMIN 停用並說明最高權限無法複製。成功後可獨立調整新角色權限；取消重開清除來源，建立失敗保留表單。
- 此視窗使用共用 Dialog／footer、44px 操作與 Element Plus 表單控制；本項不代表角色列表、權限矩陣或 Drawer 已完成全頁 UI 稽核。
- 本次 targeted suite 5 files／34 tests、角色 SQL 84 checks、`pnpm typecheck`、production build 與 `git diff --check` 通過；未執行全量 `pnpm check`。
- agent-browser 啟動並以真實 `RolePermissionsManager`、Element Plus、共用 Dialog／Select／footer、permission store 及 roles service 搭配本機 Supabase mock，Chromium 於 360／390／700／1280×844px 及各尺寸易讀文字模式通過 56 checks。涵蓋不複製、來源選取／ADMIN 禁選、複製後矩陣與可指派角色刷新、取消重開、loading 欄位禁用／重複提交與取消 guard、失敗保留來源；手機視窗滿版、footer 固定、主要控制 44px、金橘品牌色且無水平溢出，無 console error 或外部請求。重跑指令見 `tests/browser/role-permissions/README.md`，證據 `/tmp/jg-role-permissions-final/evidence.json`。
- 瀏覽器使用模擬資料；實體 iPhone／Android、正式帳號、硬體 safe area／鍵盤與遠端 RPC 部署仍待驗收，尚未發布。

### 2026-10-02 教練請假與固定範本排班（待實機驗收）

- 教練假單使用 Element Plus 日期、時段及單一中文可搜尋教練選單；管理手機教練篩選放入共用 `AppMobileFilterSheet`，有效／取消狀態 chips 保留頁面。本人表單固定登入教練；手機 Dialog 滿版、body 單獨捲動、safe area footer／44px 關閉與保存。
- 後續新增四種請假模式：上課日快選多日期／單日／連續多日／固定週期；窄手機模式按鈕分兩欄，日期按鈕 44px，跨月載入及切換訓練項目保留選取。`pnpm check` 通過，新增 89 項批次 SQL 檢查，全教練 SQL 共 332 checks；360／390／767px 真實 Vue／Element Plus 回歸通過 84 checks，含三月多選、來源載入失敗重試、批次送出失敗保留 UUID、半日及原排班流程，無 console error／外部請求／橫向溢出。證據 `/tmp/jg-coach-quick-leave-ui/evidence.json`；新增批次 migration 已套用正式資料庫並確認 ACL／日期讀取，前端尚未發布，實機驗收邊界不變。
- 排班頁拆出活動 editor、手動 Dialog、範本管理及自動帶入預覽；每卡保留更多與保存，刪除／存範本在更多。請假移除提示與缺額可換行；有未儲存內容時保留表單，保存前比對最新版本。新功能以局部 `coachFeatureTheme.css` 沿用既有金橘品牌色，包含 teleport Dialog。
- 最終 `pnpm check` 通過 254 files／1296 tests、教練 SQL 220 checks、全部付款 SQL 及 production build；worker Deno check 通過。真實 Vue／Element Plus 搭配隔離資料的 Chromium 回歸在 360／390／767 px 通過 60 checks：四種 Dialog、44 px 控制、捲動與 footer、中文搜尋、多日全日、本人身分、固定範本與帶入，完成選取後第一次觸控儲存成功；無橫向溢出、browser error 或外部請求。可重跑指令見 `tests/browser/README.md`，本輪證據 `/tmp/jg-coach-ui-verification/evidence.json`。實體 iPhone／Android 鍵盤、中文 IME 事件、硬體 safe area、正式帳號與瀏覽器推播仍待驗收。尚未部署。

### 2026-10-01 查看成員收費時間與規則（待實機驗收）

- `/my-payments` 的 `PaymentMemberSelector` 下方新增預設收合的 `PaymentFeeRulesPanel`，有效 ADMIN 才可見；以單一原生 button 提供至少 44px、ARIA 展開狀態及 Enter／Space 鍵盤操作，手機單欄、桌機雙欄，不改動既有共用 Element Plus 成員選單。
- 完整費用計算與直接影響測試共 25 files／140 tests、型別檢查及 production build 通過。agent-browser 以合成資料掛載實際 selector、面板與權限 composable，驗證 360／390／700／1280px 無水平溢出、一般字級按鈕 44px；390px 根字級 20px 時仍無溢出，按鈕可換行。Enter 展開與 Space 收合正常，九種收費卡片完整顯示，無瀏覽器執行錯誤。
- 角色模擬驗證有效 ADMIN 可見，PARENT／MANAGER／COACH／PLAYER、停用／未開始／過期 ADMIN 與匿名均無說明 DOM。真實帳號登入及 iPhone 文字放大／safe area 仍待裝置驗收；UI 未發布，國中部開放時點 DB 修正已在後續 SQL 錯誤修復中部署。規格見 `docs/specs/2026-10-01-payment-fee-rules.md`。

### 2026-09-09 公開登入 OTP 恢復流程（補充，待實機驗收）

- `LoginModal` 新增中文錯誤／短視窗自動捲到錯誤、冷卻後重新寄碼、44px 操作、OTP 自動填入與數字鍵盤提示；品牌卡片保留原生公開登入控制，限制高度並提供內部捲動。
- 40 項登入／權限回歸與型別檢查、production build 通過；Playwright 模擬 API 完成 320／360／390／700／1280px 與 360×480 短視窗失效後重新登入流程，無 Dialog 水平溢出。真實 iPhone 鍵盤、郵件自動填入、safe area、文字放大及真實郵件流程尚待驗收；發布範圍與驗證紀錄見 `docs/OTP_LOGIN_RECOVERY.md`。

- 最後更新：2026-09-07
- 本輪範圍：P0 → P1 → P2 → P3 程式調整與自動檢查。
- 本輪結論：自動檢查通過，因目前沒有可登入的一般 linked-member 與 ADMIN 裝置環境，全部維持「待驗收」。

### 2026-09-07 公開入隊 LINE 聯絡視窗

- 公開首頁的 `PublicJoinInquiryDialog` 改為兩張 LINE QR Code 與對應「開啟 LINE」連結，移除聯絡欄位與送出流程；截圖素材以 CSS 僅顯示 QR Code，保留原始碼點與掃描留白。手機單欄、桌機雙欄，沿用共用 Dialog 捲動與 footer，單一「關閉」操作維持品牌色與至少 44px。
- 4 files／12 tests、`vue-tsc --noEmit` 與 production build 通過；agent-browser 已驗證公開入口、360／390／700／1280px、390px 大字模式、body 捲動及右上角／footer 關閉。圖片載入正常、無表單與水平溢出、手機操作至少 44px；從實際瀏覽器截圖解碼得到的兩個 LINE URL 與原始素材相同。原始圖片屬靜態資產，以畫面檢查與 QR 解碼替代 unit test；招募文案模組由 `LandingView.test.ts` 涵蓋。
- 本次為公開頁局部調整；瀏覽器驗證完成，實體 iPhone safe area 與 LINE App 開啟仍待裝置驗收，狀態維持「待驗收」。未部署，未調整既有申請歷史或 DB policy。

### 2026-09-07 待確認付款回報修改／刪除

- `/my-payments` 新增 `PendingPaymentSubmissions` 與 `PendingPaymentEditDialog`，使用 Element Plus 金額、日期、文字與選單控制，以及共用 Dialog／footer；卡片只顯示修改、刪除兩個 44px 操作，刪除與付款差額皆二次確認。
- 28 files／162 tests、117 項隔離 PostgreSQL 斷言、型別檢查與建置通過。agent-browser 模擬資料驗證 360／390／700／1280px，手機 Dialog 滿版、無橫向溢出，取消／儲存 44px；後五碼修改流程通過。仍待 staging／正式 migration、真實登入全流程與 iPhone 鍵盤／safe area 驗收，維持「待驗收」。詳見 `docs/specs/2026-09-07-pending-payment-submissions.md`。

### 2026-09-03 出缺勤管理球員搜尋

- `/leave-requests` 詳細列表新增單一 `el-select filterable` 球員搜尋；輸入姓名時由全站 `AppGlobalSelect` 即時篩選選項，選取後可與既有日期條件一起縮小卡片／表格紀錄，清除後恢復全部球員。
- 搜尋與月份欄位在手機滿寬堆疊、較寬畫面並排，控制高度統一為 large；球員搜尋、全站 Select、請假與 Dashboard 共 4 files／28 tests、`vue-tsc --noEmit` 及 production build 通過，仍待登入後 360–767px 與 iPhone 中文輸入實機驗收。

### 2026-09-03 我的假單 ADMIN 全成員

- `/my-leave-requests` 的送假成員抽成單一 `el-select filterable` 元件；一般帳號維持 linked member，ADMIN 可搜尋並切換所有有效成員，進頁仍優先選 linked member。
- selector／View／service／migration 共 11 tests、請假與 Dashboard 14 tests、手機規則 60 tests、收費完整回歸 106 tests、`vue-tsc --noEmit` 與 production build 通過。DB migration 已於 2026-09-03 套用，ADMIN RPC 實測回傳 87 / 87 位有效成員；ADMIN／一般帳號登入後 360–767px 與 iPhone 中文輸入仍待實機驗收。

### 2026-09-02 付款回報金額防呆

- `/my-payments` 新增唯讀系統應收、餘額扣抵、正確應付、實際付款與差額；短繳／多繳使用醒目狀態，差額不為 0 時原因欄貼近金額區並要求二次確認。多球員季費以單欄手機卡片逐人核對，桌機使用雙欄金額控制。
- `/fees` 待審卡顯示五項核對金額與狀態；短繳／無法核對停用核准，退回 Dialog 使用 Element Plus 快捷原因與補充文字，footer 沿用 `AppDialogFooter` 及 44px 操作規格。
- Targeted、完整收費回歸、typecheck 與 build 證據記錄於 `docs/specs/2026-09-02-profile-payment-amount-reconciliation.md`；migration 尚待 staging 套用，360px、390px、640–767px 與桌機登入後視覺驗收仍待執行。

## 狀態定義

| 狀態 | 定義 |
| --- | --- |
| 待辦 | 尚未開始修改 |
| 進行中 | 已開始修改，但尚未完成驗證 |
| 待驗收 | 程式與自動檢查已完成，仍缺登入後裝置／瀏覽器驗收 |
| 完成 | 程式、自動檢查與指定手機尺寸驗收均完成 |
| 阻擋 | 缺少必要環境、權限或外部條件，已記錄原因 |

## P0：共用基礎

| ID | 範圍 | 現況差異 | 目標與完成條件 | 狀態 | 驗證證據 |
| --- | --- | --- | --- | --- | --- |
| P0-01 | `src/style.css` | 44px 與滿版 Dialog 主要只套用 `<640px` | `<768px` 使用完整手機控制與 Dialog；`<640px` 只保留窄手機微調 | 待驗收 | `vue-tsc`、build 通過；待 360–767px 驗收 |
| P0-02 | `MainLayout`／route root | 底部導覽已在排版流內，頁面仍重複預留 4.5rem；部分 route root 以 `h-full + overflow-hidden` 裁切內容 | Layout 的 `.app-main-scroll` 單一負責垂直捲動、導覽高度與 safe area；route root 使用 `min-h-full` 且保留約 20px 尾距 | 待驗收 | MainLayout＋24 頁 source contract 通過；2026-07-15 已修正捲軸回歸，待 iOS 實機驗收 |
| P0-03 | 共用 actions／檢視切換 | icon、toolbar、overflow 尺寸與 ARIA 不一致；檢視切換選取項目的白底面積過重 | 共用 44px icon button、toolbar 與 `AppActionOverflow`；檢視切換使用淡橘選取狀態與灰色未選取狀態 | 待驗收 | AppActionOverflow／ViewModeSwitch tests 通過；全站 11 個檢視切換位置共用同一元件 |
| P0-04 | 共用 Dialog | footer 排列、寬度與 safe area 不一致；未掛到 `body` 的 Dialog 會被固定 App shell 裁切 | `AppGlobalDialog` 統一掛到 `body`；`AppDialogFooter` 手機等寬、取消在前、確認在後 | 待驗收 | 全站 Dialog wrapper、註冊與 AppDialogFooter tests 通過；待實機 home indicator／鍵盤驗收 |
| P0-05 | 場地／節日活動卡片 | 可點擊卡片內含另一個按鈕 | 拆成獨立卡片選取區與操作區，HTML 不再巢狀互動 | 待驗收 | TrainingLocations／HolidayTheme tests 與 source contract 通過 |
| P0-06 | 共用搜尋／篩選 | 手機搜尋欄與篩選、檢視及操作按鈕同列，搜尋寬度不足；低頻篩選在頁內向下展開 | 搜尋使用剩餘完整寬度；進階條件使用 `AppMobileFilterSheet` 自底部展開；快速 chips 保留頁面內 | 待驗收 | AppMobileFilterSheet 3 tests＋6 個搜尋／篩選介面 source contract 通過；待 360–767px 視覺驗收 |
| P0-07 | 共用可搜尋 Select | 1.1.43–1.1.45 真機皆曾出現文字已顯示但球員／教練選項未更新；最終確認手機全域 CSS 的 `display: flex !important` 會蓋掉 Element Plus 過濾選項的 inline `display: none` | 保留原本 `el-select` 單選／多選與單一輸入欄位；Select option 只用一般 `display: flex` 保留排版，並由 `AppGlobalSelect` 在聚焦或下拉開啟期間同步實際 input value | 待驗收 | 4 個 targeted files／73 tests、收費完整 21 files／106 tests、全量 204 files／992 tests、`vue-tsc`、build 與 390px 球員餘額實際元件截圖通過，待新版 iPhone 真機驗收 |

## P1：高頻個人頁面

| ID | 路由／頁面 | 現況差異 | 目標與完成條件 | 狀態 | 驗證證據 |
| --- | --- | --- | --- | --- | --- |
| P1-01 | `/dashboard` | Hero CTA 圓角及文字連結觸控範圍不一致 | 保留 Hero 視覺，功能操作至少 44px、`rounded-xl` | 待驗收 | HomeView 16 tests＋source contract 通過 |
| P1-02 | `/calendar` | 頁首按鈕、segmented ARIA、Dialog 斷點與底距不一致 | actions 與 Dialog 符合規則，切換有 `aria-pressed` | 待驗收 | `vue-tsc`、build＋source contract 通過 |
| P1-03 | `/profile` | 功能按鈕圓角不一；Passkey icon 小於 44px | 功能按鈕 `rounded-xl`；icon 44px 並有 ARIA/title | 待驗收 | passkey 5 tests＋source contract 通過 |
| P1-04 | `/my-payments` | 重複主操作；Dialog footer 不一致；手機底部導覽會蓋住付款送出按鈕；手機成員搜尋原先沒有穩定過濾結果 | 每區一個 Primary；付款 Dialog 使用共用 footer 並掛到 `body`；手機與桌機共用單一可輸入選擇欄位及正規化比對 | 待驗收 | 單一欄位成員搜尋、全站 Dialog wrapper、比賽費角色分流與 myPayments targeted regression 通過；待登入後 360–767px 驗收 |
| P1-05 | `/my-records` | 成員選擇器位於 header actions | 搜尋／選擇移到獨立 toolbar，導航操作至少 44px | 待驗收 | MyPlayerRecords 4 tests＋service 2 tests 通過 |
| P1-06 | `/equipment-addons` | 手機加入裝備後需回到頁面上方才能看到並送出請購；離頁或登出會直接遺失草稿 | 手機固定摘要列避開底部導覽並開啟全螢幕請購 Dialog；桌機保留頁內表單；所有離頁與登出均確認未送出草稿 | 待驗收 | 裝備、cart panel、離頁 guard、MainLayout、頁面與 mobile contract 26 files／187 tests、`vue-tsc`、production build 與 `git diff --check` 通過；待 360–767px／iOS 實機驗收 |
| P1-07 | `/my-leave-requests` | 刪除、載入月份與 footer 偏小；ADMIN 全隊名單需要可搜尋 | 44px、共用 Dialog footer 與單一可搜尋成員選單 | 待驗收 | selector／View／service／migration 11 tests、請假／Dashboard 14 tests、手機規則 60 tests、收費回歸 106 tests、typecheck＋build 通過；migration 已套用且 ADMIN RPC 87 / 87 筆通過，待登入後裝置驗收 |
| P1-08 | `/training` | 管理與點數區有 32–40px 操作；點數管理手機搜尋原先沒有穩定過濾結果 | 所有功能操作至少 44px、每區一個 Primary；手機與桌機共用單一可輸入多選欄位及正規化比對 | 待驗收 | 點數球員搜尋元件、TrainingView、training API／utils、member search 與手機規則共 6 files、71 tests 通過；待登入後 360–767px 驗收 |

## P2：後台管理頁面

| ID | 路由／頁面 | 現況差異 | 目標與完成條件 | 狀態 | 驗證證據 |
| --- | --- | --- | --- | --- | --- |
| P2-01 | `/training-locations` | 巢狀按鈕、小型 actions、多重捲動；近期訓練卡原本只顯示全部配置人數且依距離現在最近排序 | 拆分互動、44px、單一主要捲動區；近期訓練依時間降冪排序，卡片同時顯示各場地總人數、上課與請假人數 | 待驗收 | View 5 tests＋場地摘要 3 tests＋API／通知 9 tests、`vue-tsc`、build 通過 |
| P2-02 | `/training-dates` | 頁首四個可見操作且高度不足 | 保留 Primary＋最高頻 Secondary，其餘 overflow | 待驗收 | dates API／utils 12 tests＋source contract 通過 |
| P2-03 | `/training-program-settings` | 手機欄位標籤與輸入框互相擠壓，星期選項觸控區偏小，狀態與儲存操作層級不清 | 欄位改為手機上下排列、星期等寬 44px 網格，狀態與儲存分區 | 待驗收 | View／mobile audit／API／utils 共 66 tests＋`vue-tsc` 通過；待 360／390px 實機驗收 |
| P2-04 | `/coach-schedules` | 新增固定範本、預覽及請假移除提示，需在窄手機操作 | segmented ARIA、44px、共用 footer、全螢幕 Dialog 與 gold-orange theme | 待驗收 | 2026-10-02：排班拆分元件、dirty editor、範本／預覽與全量 gate 通過；瀏覽器紀錄見上方，待實機驗收 |
| P2-05 | `/players` | 搜尋篩選與四個功能操作混排；舊 `<640px` CSS 曾覆蓋 `hidden` 造成上下兩組篩選 | toolbar 分層；手機只保留搜尋＋篩選觸發器，條件由底部展開；超過兩個操作使用 overflow | 待驗收 | PlayersView mobile filter regression test＋search/filter source contract 通過 |
| P2-06 | `/users` | 搜尋／篩選／檢視切換放在 header actions；桌機搜尋與登入狀態篩選的寬度、間距及高度不一致；角色權限 Drawer 原本留在 route DOM，最後一個功能會被手機底部導覽遮住 | 移到獨立 toolbar；桌機 filter group 統一 8px 間距與 44px 高度；手機狀態篩選由底部展開；row icon 44px＋ARIA；權限 Drawer 掛到 body 並保留 iOS safe area 尾距 | 待驗收 | UsersView／ViewModeSwitch／mobile audit 共 58 tests；權限 Drawer、UsersView 與元件載入共 45 tests＋`vue-tsc`＋build 通過；待登入後 iPhone 實機驗收 |
| P2-07 | `/leave-requests` | 設定、日期 chips、刪除與 footer 偏小；詳細列表原本無法依球員快速搜尋 | 44px、`aria-pressed`、共用 footer；使用可輸入搜尋的單一球員選單篩選紀錄 | 待驗收 | 球員搜尋與複合篩選已完成；相關 4 files／28 tests、`vue-tsc` 及 production build 通過，待 360–767px 與 iPhone 中文輸入實機驗收 |
| P2-08 | `/attendance` | 建立、刪除、開始點名與 footer 偏小 | 功能操作至少 44px，保留既有權限 | 待驗收 | AttendanceList test＋source contract 通過 |
| P2-09 | `/join-inquiries` | 手機清單在載入失敗或零筆資料時沒有狀態內容，會呈現整頁空白 | 手機卡片；共用 loading、可重試錯誤與明確空狀態；Danger 44px＋ARIA | 待驗收 | JoinInquiriesView tests、`vue-tsc`、build＋source contract 通過 |
| P2-10 | `/announcements` | 每筆最多四個可見操作；卡片／表格切換仍使用頁面自製白底樣式 | 保留兩個高頻操作，其餘 overflow；共用 footer 與 `ViewModeSwitch` | 待驗收 | `vue-tsc`、build＋共用檢視切換 source contract 通過 |
| P2-11 | `/equipment` | 卡片／表格最多六個操作；搜尋與分類在手機互相壓縮 | 每筆最多兩個可見操作，其餘 overflow；分類篩選由底部展開；管理者透過共用排序 Dialog 拖曳／上下移動；編輯裝備可另行上下移動尺寸／序號庫存 | 待驗收 | 2026-09-16：全量 228 files／1165 tests、型別與 build 通過；排序 Dialog 在 360／390／640／767px 無橫向溢出、移動按鈕 44px、footer 可見，完成測試資料上下移動與儲存；2026-09-21 尺寸排序驗證見下方；待正式登入／iOS 實機驗收 |
| P2-12 | `/fees` | tabs 與子元件 Dialog 規格不一；校隊月費搜尋與 program 篩選並排 | tabs 44px＋ARIA；月費結算以中港總部／國中部固定分頁切換；可見 Dialog footer 統一；裝備請購／付款移至獨立管理頁 | 待驗收 | 收費設定已拆成計次、固定月繳、季費補償、不收費四個 44px ARIA tabs；月費結算另以中港總部／國中部 44px ARIA tabs 分開名單、摘要與 CSV，手機不用另開篩選面板；計次頁籤內兩個 program 各有獨立手機友善費率卡，國中部的單次月費／訓練日期 switch 可換行且金額欄滿寬，社區成員費率手機改用卡片；待 360–767px 視覺驗收 |
| P2-13 | `/vendors` | 卡片三個操作；table icons 偏小；手機分類在頁內向下展開 | 每筆最多兩個操作，其他 overflow；icons 44px＋ARIA；分類篩選由底部展開 | 待驗收 | vendors 5 tests＋search/filter source contract 通過 |
| P2-14 | `/equipment-purchases` | 原本付款與請購六個狀態區塊同時堆疊於 `/fees`，桌機與手機資訊量過高 | 付款／請購雙頁籤；`>=1024px` 主清單＋明細，較小螢幕全螢幕 Drawer；摘要／進階篩選預設收起；進階條件統一 Element Plus 控制；請購數量依目前篩選跨分頁彙整，桌機表格／手機分組列；付款狀態沿用藍／綠／橘語意色與原說明文字；主清單依狀態顯示淡色外框／底色；分頁後捲到新頁第一筆且選取明細不重設頁碼；刪除請購使用獨立 Danger 按鈕；44px、safe area、深層連結與單一頁面捲動 | 待驗收 | 搬移後全量 154 files、754 tests；Element Plus 篩選回歸 3 files、90 tests；狀態色彩、主清單外框／底色與文案回歸測試通過；請購刪除操作 targeted tests 通過；分頁捲動回歸 3 files、73 tests；數量統計／分頁狀態 7 files、51 tests；`vue-tsc`、build 通過；管理台仍待登入後裝置驗收 |
| P2-15 | `/registration-forms` | 賽事報名／範本庫雙分頁與三步驟產檔精靈，需要在窄手機容納賽事卡片、完整球員欄位與固定操作列 | 賽事卡片與範本庫無水平溢位；新增／編輯賽事 Dialog 使用 Element Plus；隊職員姓名可搜尋並帶入電話；選球員提供所有人／U-level／清除全選；`<768px` Dialog 使用全螢幕單欄 | 待驗收 | 52 個 registration targeted tests、58 個共用 mobile rules tests、`vue-tsc` 與 production build 通過；既有精靈曾以 360px、390px、700px、1280px 驗證，新賽事雙分頁仍需補裝置驗收 |

## P3：特殊介面

| ID | 路由／頁面 | 現況差異 | 目標與完成條件 | 狀態 | 驗證證據 |
| --- | --- | --- | --- | --- | --- |
| P3-01 | `/match-records` | 搜尋在 header actions 並被篩選／檢視／操作壓縮；月份列舊 `sticky top-0` 會蓋到頁首工具列 | 手機搜尋使用完整剩餘寬度，進階條件由底部展開；月份列依頁首實際高度吸附在工具列下方；操作收斂；tabs 44px＋ARIA | 待驗收 | MatchRecords／MatchesGrid tests＋matches/stats 12 tests＋search/filter source contract 通過 |
| P3-02 | `/attendance/:id` | 返回、刪除、chips、狀態操作偏小 | 保留緊湊點名，但操作至少 44px；不新增缺席 | 待驗收 | 缺席 source contract、`vue-tsc`、build 通過 |
| P3-03 | `/holiday-theme-settings` | 活動卡片巢狀操作；circle actions 缺標籤 | 拆分互動；44px、ARIA、Danger 確認 | 待驗收 | HolidayTheme 2 tests＋source contract 通過 |
| P3-04 | `/baseball-ability`、`/physical-tests` | 共用列表每筆三個操作；手機卡片／表格切換曾被 flex 拉成整行 | 每筆最多兩個可見操作，其餘 overflow；檢視切換依內容寬度靠左 | 待驗收 | performance API/config 5 tests＋mobile source contract＋build 通過 |
| P3-05 | 能力／體測明細 | 返回及紀錄操作偏小 | 44px、`rounded-xl`、ARIA 與 Danger 確認 | 待驗收 | performance API/config 5 tests＋build 通過 |
| P3-06 | `MatchDetailDialog` 比分與團隊成績 | 比分卡會固定在對話框上方並遮住捲動內容；桌機統計卡被限制在右側 2/3 欄；手機外層 `overflow-x-auto` 與 Element Plus 表格各自產生水平捲動 | 比分卡跟隨內容正常捲動、不固定覆蓋；桌機打擊／投手統計卡使用完整內容寬度；手機每張表最多一個內建水平捲動面，總計列與表格同步捲動且頁面本身不水平溢位 | 待驗收 | Detail Dialog 7 tests、賽事／手機回歸共 12 files／109 tests、`vue-tsc`、build 通過；320／390／767／1280px Playwright 量測通過，待 iOS／Android 實機拖曳驗收 |

## 驗收紀錄

### 2026-09-01 比賽詳情手機比分卡堆疊修正

- `MatchDetailDialog` 的比分卡保留正常文件流與原本的 Hero 視覺重疊，另以 `relative z-10` 明確放在 Hero 上方，避免 iOS 實機把負 margin 上移的卡片畫在 Hero 後方，造成「HOME 主隊／AWAY 客隊」只露出最後一個「隊」且比分卡頂部被遮住。
- 同名元件測試新增比分卡必須維持非 `sticky`／非 `fixed`，並具備 `relative z-10` 的回歸檢查；390px Playwright 實際渲染量測確認比分卡與 Hero 重疊 48px、命中最上層元素仍為比分卡，兩側主客隊標籤、隊名、日期、VS 與比分皆完整顯示。

### 2026-08-31 比賽詳情比分正常捲動與團隊成績版面

- 比分卡已移除 `sticky top-16 md:top-20 z-30`，保留原本的尺寸與視覺重疊；現在位於正常文件流，向下瀏覽團隊成績時會跟隨內容捲走，不再固定於上方遮住表格。
- `MatchDetailDialog` 的「團隊打擊成績／團隊投手成績」已移出桌機三欄版面的右側 `xl:col-span-2`，改為主內容 grid 後方的完整寬度區塊；1280px 瀏覽器量測主 grid 與統計區皆為 960px，兩張表均可直接完整顯示而不需要水平捲動。
- 移除兩張表外層的 `overflow-x-auto` 與 table root 的固定 `min-width`，改由 Element Plus `el-table` 內建 scrollbar 作為唯一水平捲動面；`TEAM TOTALS` 透過 `#append` 放進同一 scroll view，拖動時不再出現第二個外層捲軸。
- Playwright 以實際 Element Plus DOM 驗證 320px、390px、767px、1280px：所有尺寸 document 水平溢位皆為 0；320px／390px 的打擊與投手表各只有 1 個 scroll owner，767px 僅較寬的投手表需要 1 個，1280px 兩表皆為 0；新開瀏覽器 session 無 console error。
- `MatchDetailDialog` 新增非空打擊／投手 fixture，以及比分卡非固定、滿寬、單一 scroll surface、總計列同層的回歸測試；賽事／手機相關 12 files／109 tests、`pnpm exec vue-tsc --noEmit`、production build 與 `git diff --check` 通過。Build 僅保留既有 chunk size warning；仍待 iOS／Android 實機確認拖曳手感與 scrollbar 顯示。

### 2026-08-31 裝備加購手機請購與未送出保護

- `/equipment-addons` 手機版在請購非空且停留「加購裝備」分頁時，於底部導覽上方固定顯示品項數、總額與「檢視並送出」；數量或庫存失效時改為「檢視並修正」。點擊後以全螢幕 Dialog 顯示成員、品項、數量、備註、訂製提示、錯誤及總額；桌機仍使用原位置的頁內表單，兩者共用 `EquipmentAddonCartPanel`。
- 請購草稿在站內導覽、通知連結、程式化跳轉及瀏覽器返回／前進前顯示「請購尚未送出」；取消、右上關閉或 Esc 會保留內容，遮罩不關閉確認視窗。重新整理、關閉分頁或 PWA 視窗使用瀏覽器原生 `beforeunload` 提醒。
- 登出先共用目前頁面的確認流程；取消不呼叫 `signOut()`，確認後以一次性 bypass 完成登出與原目的地跳轉，登出失敗時不清除頁面草稿。自動測試已涵蓋空／非空草稿、取消／確認、返回鍵、並發確認、`beforeunload`、登出取消與失敗；裝備與跨頁 targeted 共 26 files／187 tests，`vue-tsc`、production build 與 `git diff --check` 均通過，仍需 staging 登入後驗收 360px、390px、640–767px、iOS safe area、鍵盤與文字放大。

### 2026-09-14 場地區塊名單分組（待裝置驗收）

- 已配置卡片抽成 `TrainingLocationVenueMembers`，各角色／組別有標題與人數，校隊先於球員、U 層級由大到小，所有「不參賽」組別置底。
- 卡片採手機單欄、`md` 雙欄、`xl` 三欄；成員資訊可換行，移除按鈕提供 44px 觸控區及名稱標籤。
- 排序、狀態標示、空名單與各場地移除操作由 utils／component／view 測試涵蓋；360px、390px、640–767px、文字放大與 iOS 實機驗收仍待執行。

### 2026-09-24 場地名單群組標題辨識度（待實機驗收）

- `TrainingLocationVenueMembers` 的群組標題改為 `text-base`（一般模式 16px）與深藍色 `text-sky-700`，和姓名的 slate 文字區分；標題原為桌機 14px、窄手機經全域規則調整為 15px。長組名可換行。
- 使用實際元件、全域樣式與虛構名單進行本機瀏覽器預覽：360px、390px、640px、767px、1280px 及 360px 下 150% 根字級均無水平溢出，長組名可完整換行，移除操作正常；360px／640px／767px／1280px 的移除按鈕皆保留至少 44px 觸控區。
- 既有 component／分組 utils／view 共 3 files／11 tests 與 `vue-tsc --noEmit` 通過。本次為字級與色彩調整，沿用既有行為測試並以瀏覽器驗證外觀；完整登入頁面與 iOS／Android 實機仍待驗收。

### 2026-09-03 場地配置近期訓練角色人數

- 中港總部的各場地摘要會在總人數下方，依 assignment 角色分列「社區」與「校隊」人數；國中部及其他 program 不顯示此分類列，避免套用不相符的分類語意。
- 分類沿用 session 已載入的 `venues[].assignments[].role`，不新增 RPC、資料庫查詢或權限範圍；`球員` 計為社區、`校隊` 計為校隊。
- 請假人數大於 0 時提供 tooltip：桌機 hover、手機點擊請假人數開啟，內容以上方「社區」、下方「校隊」分組顯示姓名；空組顯示「無」，手機觸發區維持至少 44px。
- 場地摘要元件與 TrainingLocations view 共 12 tests、場地通知回歸 15 tests、`vue-tsc --noEmit` 與 production build 通過；登入後 360px、390px 與桌機實際 tooltip 定位／換行仍待 staging 驗收。

### 2026-08-27 場地配置近期訓練個別人數

- `/training-locations` 的近期訓練卡保留「場地總數｜總人數」，並依場地順序顯示「場地編號・場地名稱：總人數」，下方再分列上課與請假人數；空白場地名稱會回退為場地編號。
- 個別總人數直接使用管理端 session 已載入的 `venues[].member_ids`，請假人數沿用 `venues[].assignments[].is_on_leave` 的場地日期／時段重疊判定，上課人數為場地總人數扣除請假人數；不新增 RPC、資料庫查詢或權限範圍。
- 近期訓練清單改依訓練日期與時間降冪排序，同一天較晚時段在前；未設定開始時間時沿用既有結束時間／午夜 fallback。
- 摘要顯示已拆成獨立元件，targeted 3 files／12 tests、通知回歸 2 files／15 tests、`vue-tsc --noEmit` 與 production build 通過；登入後 360px、390px 與桌機實際卡片高度／換行仍待 staging 驗收。

### 2026-08-20 全站手機 Select 中文輸入搜尋

- 1.1.43 的第一版只在組字中的 `input` 事件提早刷新；新的 iPhone 截圖證實輸入框已顯示「張」時仍保留完整名單，因此不能假設 iOS 每次組字更新／結束後都會另送可用的 `input`。
- 1.1.44 再補 `compositionupdate`／`compositionend`，但新版真機截圖仍顯示輸入「田」後保留完整名單；production bundle 已確認共用 `AppGlobalSelect` 有完成註冊，因此問題收斂為 iOS 顯示值更新不一定會經過 wrapper 可用的文字事件。
- 1.1.45 已在線上 `/version.json` 確認部署，但「收費管理 → 球員餘額」真機仍失敗；該頁原始碼確實使用全域接管的 `<el-select>`，不是漏換元件。
- 載入實際 `src/style.css` 後成功在 390px 瀏覽器重現：Element Plus 內部查詢與 option visibility 已更新，但手機規則及可讀文字模式把 `.el-select-dropdown__item` 設為 `display: flex !important`，權重高於過濾時的 inline `display: none`，因此畫面仍顯示全部選項。兩處規則改用一般 `display: flex`，保留垂直置中與觸控高度，同時讓過濾隱藏恢復生效。
- `AppGlobalSelect` 另補下拉啟動韌性：除了原本焦點路徑，也會在 Element Plus `visible-change` 回報開啟時直接取得 input ref 並啟動 50ms 比對；下拉關閉、失焦、輸入節點移除或元件卸載即停止。所有既有 `el-select` 標記、底層元件、單選／多選 model、props、events 與 slots 保持不變。
- 回歸測試涵蓋完全沒有文字／可辨識焦點事件的內建與自訂篩選、既有 `visible-change` handler、球員餘額實際元件，以及禁止全域 CSS 再以 `!important` 強制顯示 Select options；targeted 共 4 files／73 tests，收費完整計算回歸 21 files／106 tests，全量 204 files／992 tests、`vue-tsc --noEmit` 與 production build 均通過。
- 390×844 Playwright 使用實際 `PlayerBalanceManager`、`AppGlobalSelect` 與完整專案樣式：開啟下拉後直接把 input value 改為「田」且不派送文字事件，欄位持續顯示「田」，清單只剩「田小明｜校隊」，console／page error 為 0；仍需發布後 iPhone 真機最終驗收。

### 2026-08-18 報名表管理

- 頁面已提升為「賽事報名／範本庫」雙分頁；賽事卡片顯示狀態、截止日、範本數與最近產生時間，並由獨立 Dialog 編輯賽事 metadata 與多範本關聯。
- `/registration-forms` 清單在 360px 保持單欄卡片與完整操作；三步驟精靈在 360px、390px 使用全螢幕單欄，在 700px、1280px 使用可捲動 Dialog，四種寬度的 document scroll width 均未超出 viewport。
- 實際操作驗證隊職員必填阻擋、球員依背號排序、多人選取、肖像授權／缺照片警告、Excel 非必填守位欄位，以及桌機多欄排列；固定 footer 在手機與桌機皆保持可見。
- Playwright 驗收以本機 ADMIN store 與 REST fixtures 隔離後端資料，沒有寫入 production；因模擬登入未建立真實 Supabase session，MainLayout 通知 feed 出現預期的未驗證錯誤，報名表頁面本身沒有 console error。

### 2026-07-27 收費設定分頁與國中部計次月費

- `/fees` 收費設定改為「計次月費／固定月繳／季費補償／不收費」四個可橫向捲動的 44px ARIA tabs，避免所有設定同時垂直堆疊；國中部費率整合於計次月費頁籤，計次與固定月繳成員在 `<768px` 使用單欄卡片與滿寬輸入、儲存按鈕，桌機保留表格。
- 中港校隊與國中部各自有獨立費率卡；國中部新增可換行的「單次月費／當月訓練日期計算」switch，預設單次月費 2,000 元，切換後才依國中部訓練日期與一般／折扣單次費率計算。中港維持依中港總部日期並扣除全日／上午請假，國中部兩種模式的請假都只記錄不扣款。社區計次與社區固定月繳維持原規則。
- Targeted regression、`vue-tsc --noEmit` 與 production build 已通過；migration 尚待套用資料庫，登入後 360px、390px、640–767px 與桌機版型仍待 staging 驗收。

### 2026-07-27 月費結算中港總部／國中部分頁

- `/fees` 月費結算移除「全部訓練項目」下拉與手機篩選面板，改為頁面上固定顯示的「中港總部／國中部」44px ARIA tabs，並顯示各分頁人數；手機可橫向捲動，不需先開啟篩選。
- 搜尋、訓練堂數說明、月費摘要、空狀態與 CSV 都跟隨目前分頁；由通知深層連結指定球員時會先切到該球員所屬分頁再定位。一鍵存檔仍保存跨分頁的全部待存變更。
- Targeted regression 共 4 files、68 tests，`vue-tsc --noEmit` 與 production build 均已通過；登入後 360px、390px、640–767px 與桌機版型仍待 staging 驗收。

### 2026-07-25 全站手機選擇器單一搜尋欄位

- 全站稽核確認，和特訓點數管理相同、在 `el-select` 下拉內再放第二個搜尋框的實作只剩 `/my-payments` 的 `PaymentMemberSelector`；其他 `filterable` 選擇器原本就是單一欄位，Dialog／表格的 `#header` 插槽不屬於此模式。
- `/my-payments` 已改為手機與桌機共用同一個可輸入成員選擇欄位，並沿用 `matchesMemberSearch` 比對姓名、角色、繳費標籤與訓練項目；linked member 範圍、`selectedMemberId` 與付款資料載入 watcher 不變。
- Targeted regression 共 7 files、79 tests，`pnpm exec vue-tsc --noEmit` 與 production build 通過；登入後手機中文輸入法與鍵盤位置仍待實機驗收。

### 2026-07-25 特訓點數管理手機球員搜尋

- `/training` 的點數管理球員多選已拆成 `TrainingPointMemberSelector`；手機與桌機現在共用同一個 Element Plus 可輸入多選欄位，不再於下拉選單內顯示第二個搜尋框。
- 手機搜尋使用共用 `matchesMemberSearch` 正規化全形／半形、空白與常見分隔符號，並可跨姓名、身分與所屬群組比對；關閉選單後清除查詢，既有已選球員 ID、快速選取與 `grant_player_points()` 流程不變。
- Targeted regression 共 6 files、71 tests，`pnpm exec vue-tsc --noEmit` 與 production build 通過；build 僅有既有 chunk size warning。登入後 360px、390px、640–767px 的中文輸入法、鍵盤與選單位置仍待實機驗收。

### 2026-07-23 裝備減少庫存

- `/equipment` 的卡片與表格更多選單新增「減少庫存」，只對 `equipment:EDIT` 顯示；共用庫存調整 Dialog 會顯示總量、可用量與尺寸量前後變化，減量原因必填並保留二次確認，footer 改用 `AppDialogFooter` 的 Danger 操作。
- 前端依聚合庫存 snapshot 限制目前可減數量；DB migration 以負數 RPC 輸入辨識 `stock_out`，流水帳保存正數數量與方向，並在鎖定裝備後重算交易及已核准／已備貨請購占用量，總量與尺寸量都不得扣低於已使用或已預留庫存。
- Targeted regression 與手機規則回歸共 11 files、104 tests，`pnpm exec vue-tsc --noEmit` 與 production build 通過。新 migration 已完成靜態 ACL／庫存 guard 測試但尚未套用資料庫，因此 RPC 編譯、實際角色權限及登入後 360px、390px、640–767px、桌機 Dialog 仍待 staging 驗收。

### 2026-07-20 裝備請購逐品項處理

- `/equipment-purchases` 的多品項請購在每個品項卡新增獨立「刪除此品項」與依狀態顯示的「標記備貨完成」／「完成領取」；每張卡最多兩個可見操作且皆維持至少 44px。單品項沿用原頁尾操作，頁尾既有整單刪除、整單備貨與整單領取按鈕保留。
- 品項以備貨／領取 timestamp 顯示個別狀態、備註與照片；父單維持既有狀態值作清單聚合。逐項領取的已收款只更新目標 transaction，逐項與整單刪除都改走付款 guard 保護的原子 RPC，最後一項刪除會一併刪除父單。
- `/my-payments` 與管理端付款清單的商品履約標籤改依 transaction 關聯品項推導；多品項父單尚未全部完成時，已領取的單一品項仍顯示「已領取」。
- 裝備回歸共 16 files、85 tests，`vue-tsc --noEmit`、production build 與 `git diff --check` 通過；build 僅有既有 chunk size warning。新 migration 已做靜態結構與 ACL 檢查但尚未套用資料庫，因此 RPC 編譯、付款／退款資料整合與登入後 360px、390px、640–767px、1024px、1440px 實際版面仍待 staging 驗收。

### 2026-07-18 繳費資訊手機成員搜尋

- `/my-payments` 的「查看成員」已拆成 `PaymentMemberSelector`；`<768px` 開啟成員選單後使用獨立 Element Plus 搜尋欄處理查詢與結果，`>=768px` 維持既有可搜尋 select。
- 手機搜尋會正規化全形／半形字元、空白與常見分隔符號，並比對姓名、角色、繳費標籤與訓練項目；關閉選單後清除查詢，下一次開啟恢復完整名單。成員 ID、linked member 限制與既有繳費資料載入流程未變更。
- Targeted regression 共 6 files、102 tests，`pnpm exec vue-tsc --noEmit` 與 production build 通過；build 僅有既有 chunk size warning。因目前沒有可登入的 linked-member／ADMIN 手機環境，360px、390px 與 640–767px 的中文輸入法、鍵盤與選單位置仍維持待驗收。

### 2026-07-17 裝備請購數量統計與分頁狀態

- `/equipment-purchases` 的請購管理新增可收合數量統計，依目前狀態、搜尋、日期與資料類型篩選後的全部請購結果，按裝備、尺寸與背號彙整請購單數與品項數量；付款單與付款交易不納入，避免生命週期重複計數。
- 統計元件放在請購狀態說明正下方並預設收合，仍可手動展開；在 `<768px` 使用分組列顯示規格、請購單數與總數量，桌機使用五欄表格，空結果保留明確說明。點選／關閉主清單明細不再把第二頁重設為第一頁，切換管理類型、狀態或篩選仍回第一頁，資料異動後頁碼收斂到最後有效頁。
- Targeted regression 共 7 files、51 tests，`pnpm exec vue-tsc --noEmit` 與 production build 通過；build 僅有既有 chunk size warning。登入後 360px、390px、640–767px、1024px 與 1440px 實際版面及第二頁明細操作仍維持待驗收。

### 2026-07-16 全站手機 Dialog 底部操作列

- 全站小寫 `<el-dialog>` 由 `AppGlobalDialog` 統一包裝並預設掛到 `body`，避免 `MainLayout` 的固定高度／內容裁切與手機底部導覽蓋住 Dialog footer。
- `/my-payments`「新增付款回報」沿用既有 `AppDialogFooter`，付款計算、餘額扣抵與送出 RPC 均未變更；本次只修正 overlay 掛載層級。
- 重點回歸 5 files、65 tests 通過，驗證 wrapper 預設 teleport、內容／footer／`v-model` 事件轉送，以及 App 啟動時的全站元件註冊；`vue-tsc` 通過。
- 全量回歸 158 files、787 tests 與 production build 通過；build 僅有既有 chunk size warning。
- 尚無 linked-member 登入實機環境，360px、390px、640–767px、iOS safe area 與鍵盤展開後送出按鈕可見性維持「待驗收」。

### 2026-07-16 比賽費用開放繳費保護

- `/fees` 比賽費卡預設收合，依日期與開始時間由早到晚排列，未知時間置於當日最後；卡頭保留應收 / 已收 / 未處理與已開放 / 未開放狀態，操作區使用至少 44px 按鈕與 `aria-expanded` / `aria-controls`。
- 比賽費卡手機操作區固定為等寬雙欄：開放 / 關閉 / 刪除位於左欄，展開 / 收合固定於右欄；即使沒有管理操作，展開按鈕也不再左右跳動，`>=768px` 恢復內容寬度的靠右排列。
- `/my-payments` 依權限分流：一般 linked member 不取得也不顯示未開放比賽費；具 `fees:VIEW` / `fees:EDIT` 者會在待審核之後看到中性的「尚未開放繳費」分類與頁首筆數，但無 checkbox，且不計入「目前需要處理」、待付款合計或提醒卡。駁回 / 回滾後保留的未開放歷程仍列「已關閉」，狀態膠囊不再沿用紅色待付款樣式。
- 本次角色分流 targeted regression：4 files、17 tests 通過，涵蓋已開放待付款、尚未開放、關閉後保留歷程、待審核、已付款、已取消與失效選取清除；`vue-tsc --noEmit`、production build 與 `git diff --check` 通過，build 僅有既有 chunk size warning。
- 2026-07-16 唯讀核對 production schema：`matches.match_fee_payment_opened_at`、`list_my_match_fee_items()` 的管理者分支 / 一般會員開放或歷程過濾，以及 `set_match_fee_payment_open_state()` 均已存在。本次不新增 migration，也不修改 RPC、RLS 或資料 wire shape。
- 尚未取得可切換 `fees:VIEW` / linked-member 的登入環境，因此 360px、390px、640–767px 與桌機的角色分組、徽章換行及實際確認視窗 / 橫向明細捲動仍維持「待驗收」；原始碼已維持 `flex-wrap` 與 `md` 斷點配置。

### 2026-07-16 裝備主清單分頁捲動

- `/equipment-purchases` 切換主清單頁碼後，使用既有 `MainLayout` 頁面捲動將新頁第一筆資料帶到可見位置；不捲回 route 頂端，也不新增清單內部捲軸。
- `EquipmentPurchaseMasterList` 同名測試驗證第二頁第一筆與 `scrollIntoView` 行為；相關 3 files、73 tests、`vue-tsc` 與 production build 通過，仍待登入後桌機與手機實際捲動驗收。

### 2026-07-15 捲動與搜尋／篩選回歸修正

- 比賽紀錄月份列保留 sticky，並以 `ResizeObserver` 取得頁首工具列實際高度作為吸附距離，避免在 MainLayout 單一捲動架構下蓋到頁首。
- 比賽紀錄桌機工具列的搜尋、篩選、檢視切換、更多與新增操作統一為 44px 高度及一致圓角、對齊基準；檢視切換選取項目使用淡橘底，未選取項目的 hover 使用淡 slate 灰以維持狀態辨識。
- 使用者名單桌機搜尋與登入狀態篩選改為同一 filter group，統一 8px 間距與 44px 高度；全站 11 個網格／卡片／表格切換位置改由 `ViewModeSwitch` 提供淡橘選取狀態，不再使用大面積白底。
- Topbar 漢堡按鈕恢復既有無框視覺，保留 44×44 觸控範圍、focus ring 與導覽 ARIA。
- 球員名單窄手機重複篩選：移除舊 `.players-toolbar-filters { display: grid; }` 覆蓋；`<768px` 僅顯示底部篩選面板，桌機才顯示行內 selects。
- 全站 route root source contract：24 個登入後 view 與 2 個 performance 共用頁面均不再以 `h-full + overflow-hidden` 阻擋 `MainLayout` 垂直捲動。
- 搜尋／進階篩選 source contract：MatchRecords、Players、Users、Equipment、Vendors 共 5 個介面使用滿寬搜尋列與 `AppMobileFilterSheet`；SchoolTeamFees 的中港總部／國中部為高頻主分頁，固定留在頁面上並使用滿寬搜尋列。
- `pnpm exec vitest run ...`（共用篩選面板、MainLayout、source contract、MatchRecords、Players、equipment、vendors、monthly fee）：15 files、117 tests 通過。
- 最終回歸測試：4 files、61 tests 通過；`pnpm exec vue-tsc --noEmit`、`pnpm build`、`git diff --check` 通過。
- Build 僅有既有 chunk size warning；`dist` 與自動更新的 `public/version.json` 未納入變更。
- 尚無可登入的一般 linked-member 與 ADMIN 裝置環境，因此 360px／390px／640px／767px、iOS safe area 與實際上下滑動仍維持「待驗收」。

### 2026-07-15 自動檢查

- `/equipment-purchases` 主清單由每頁 20 筆調整為每頁 10 筆，降低桌機與手機單頁清單長度；分頁、狀態與篩選行為維持不變。相關 2 files、14 tests 與 `vue-tsc` 通過。
- `/equipment-purchases` 左側主清單依目前狀態恢復淡色外框與底色：處理中 blue、請購待審 amber、付款待審 emerald、尚未付款 sky、已收款可退款 orange；內容維持白色資料卡，選取狀態與文字 badge 仍清楚可辨。相關 3 files、18 tests、`vue-tsc` 與 production build 通過。
- `/equipment-purchases` 請購明細的「刪除請購」由更多選單移為獨立紅色 Danger 按鈕，維持 `fees:DELETE` 顯示限制與既有二次確認；待審核的退回流程仍留在更多選單。相關 2 files、9 tests、`vue-tsc` 與 production build 通過。
- `/equipment-purchases` 恢復既有付款狀態辨識：尚未付款為藍色、付款待審為綠色、已收款可退款為橘色，並在狀態切換、目前狀態說明、金額摘要與清單標籤保留一致色彩；舊版三段標題與說明文字逐字保留，不以顏色作為唯一資訊。相關 4 files、41 tests、`vue-tsc` 與 production build 通過。
- `/equipment-purchases` 進階篩選由原生日期／選單改為 Element Plus `el-date-picker`／`el-select`，統一 large、滿寬、44px、明確日期格式與清除行為；相關 3 files、90 tests、`vue-tsc` 與 production build 通過。
- `/equipment-purchases` 獨立主從式管理台：targeted tests 16 files、159 tests；全量 `pnpm exec vitest run` 154 files、754 tests，全部通過。
- `pnpm exec vue-tsc --noEmit` 與 `pnpm build`：通過；build 僅有既有 chunk size warning。
- Playwright 以 360／390／768／1024／1440px 開啟新保護路由，五種尺寸均無 console error、page error 或公開頁水平溢出；因測試瀏覽器無登入 session，路由依預期導回 `/`，主從欄位、Drawer、safe area 與操作焦點仍列為登入後待驗收。
- `/fees` 裝備請購／付款收合調整：相關 12 files、134 tests、`vue-tsc`、production build 與 `git diff --check` 通過；build 僅有既有 chunk size warning。
- `pnpm exec vitest run ...`（本次共用元件、頁面與相關 feature 測試）：36 files、163 tests 通過。
- `pnpm exec vue-tsc --noEmit`：通過。
- `pnpm build`：通過；僅保留既有 chunk size warning，建置產物與 `public/version.json` 未納入變更。
- `git diff --check`：通過。
- `viewImportCoverage`／`componentImportCoverage` 額外檢查：既有 `file:///baseball-field.png` 測試 URL 解析問題造成 VisualField、Landing、Calendar、MatchRecords import case 失敗；正式 build 與對應頁面測試均通過，未將此問題誤列為本次完成項目。

### 2026-09-21 裝備尺寸／序號排序

- `EquipmentFormDialog` 新增「調整排序」模式，以 44px 上下箭頭移動整列尺寸／序號與數量，首尾停用越界操作；排序期間每列僅有兩個操作，新增／移除留在欄位編輯模式。
- 使用原有 `sizes_stock` 陣列保存順序，按主表單「儲存」才生效；取消、重開、儲存失敗與儲存期間停用操作均有元件測試，並涵蓋排序後增刪／修改數量及重複尺寸合併。
- 相關 5 files／32 tests 通過；首次全量與建置並行時出現測試逾時，改以 `pnpm exec vitest run --maxWorkers=2` 重跑後 229 files／1170 tests 全數通過。`pnpm build`（含型別檢查）通過，僅有既有 Browserslist／chunk size 提示。
- 本機測試資料搭配實際 Vue／Element Plus 元件，以瀏覽器完成尺寸移動、儲存與重開；360／390／640／767／1280px 頁面與 Dialog 水平溢出皆為 0，排序按鈕均為 44×44px，390px 長序號可換行且 footer 可操作，無瀏覽器錯誤。
- 本次未操作正式資料；正式登入權限與 iOS 實機驗收仍待完成，P2-11 保持待驗收。

### 待登入環境驗收

- `/equipment-purchases`：360px／390px／768px 的全螢幕 Drawer，以及 1024px／1440px 的 38%／62% 主從欄位，待登入後瀏覽器驗收。
- 360px／390px／640px／767px：其他登入後頁面待瀏覽器驗收。
- 一般 linked member／ADMIN 權限：待登入後瀏覽器驗收。
- iOS safe area、文字放大、長文案、loading、disabled、Danger：待驗收。

- 2026-09-09 球員自訂身分：`PlayerIdentitySelect` 維持全域 Element Plus 中文選單，新增名稱提示、群組說明關聯與 44px 輸入區，長選項可換行；桌機與 390px 本機球員頁（mock API）已操作選取、中文新建、捲至 footer 儲存，320px 重新載入／編輯後名稱及不收費設定保留。名稱持久化、RLS 與四種收費模式另由隔離 PostgreSQL 驗證；真實手機鍵盤／IME、正式 DB 與正式前端尚未驗收／部署。原 P2-05 整頁狀態仍待驗收。
- 2026-09-09 球員表單高度補正：新增／編輯表單以 `players-member-form` 將文字、日期與單／多選控制的基本高度統一為 44px，多選內容仍可增高；身分驗證補上 `required: true`，讓既有驗證同時顯示紅色必填星號。已在 localhost:5174 的登入頁以桌機、390px、320px 檢查，17 個控制均為 44px，新增與編輯的身分皆有必填星號；390px 無表單水平溢出，320px 既有關閉球員／畢業 switch 列仍超出約 5px，整頁驗收狀態維持待驗收。本次只改表單樣式與驗證 metadata，沿用前次已拆出的身分元件／helper，避免為尺寸修正搬動既有表單資料流程；後續完整表單拆分可按個人資料、聯絡資料與授權區塊進行。既有相關 21 項測試與型別檢查通過，瀏覽器驗證未提交任何球員資料，未部署正式前端。

## 2026-09-24 裝備管理可用庫存

- `/equipment` 摘要、卡片、表格、交易與增減庫存預覽統一只顯示可用量；尺寸顯示件數。編輯草稿帶入可用量，有尺寸時自動加總，保留排序、取消、原因與減量確認。
- 舊資料不一致以核對提示及確認欄位處理，單純 metadata 編輯不改庫存；缺少新 RPC 時明確阻擋儲存。
- 瀏覽器隔離 fixture：360／390／640／767／1280px 編輯視窗內容無橫向溢出；檢查卡片、無尺寸新增、尺寸可用量、合計、庫存增加選單與調整前後值。未以正式帳號寫入，仍待正式登入與 iOS 實機 safe area／文字放大驗收。
- 驗證：裝備相關 unit tests、106 項收費回歸、隔離 PostgreSQL 40 項檢查、型別檢查與正式建置通過；SQL fixture 使用真實 migration，涵蓋零可用、尺寸加總、借出／歸還、請購預留與轉交易去重、版本失效、權限、回滾及保留交易。
- 新儲存邏輯獨立於 `equipmentAvailableStockApi.ts`，既有較長 `equipmentApi.ts` 僅增加流水帳讀取欄位，避免牽動付款 service；後續可按主檔、交易與付款職責拆分。migration 以隔離 PostgreSQL 驗證，純型別及文件以型別檢查／diff 檢查替代 unit test。
- `20260924014519_equipment_available_stock.sql` 已於 2026-09-24 部署正式資料庫；同日依管理者確認完成 7 項庫存核對（見 `EQUIPMENT_STOCK_RECONCILIATION_20260924.md`）。前端未發布，正式登入與實機驗收仍待完成。

## 2026-09-24 教練排班訓練項目

- 卡片新增來自來源配置的訓練項目標籤（國中部／中港總部），首頁教練排班摘要同步顯示；標籤可換行；後續依使用者確認改為同一場合班共用排班，標籤顯示所有參與訓練項目。
- 管理頁摘要拆為 `CoachScheduleEventSummary.vue`，保留原有 Element Plus 表單及排班操作。
- Playwright 本機 fixture 使用實際管理頁，360／390／640／767／1365px 皆顯示正確標籤且水平溢出為 0，已檢視 390px／1365px 截圖；31 項 targeted tests、型別檢查及建置通過。
- 資料庫 migration 已部署並驗證來源修復、刪除連動及過期來源拒絕；前端尚未發布，正式登入／iOS 實機驗收待完成，P2-04 保持待驗收。詳見 `COACH_SCHEDULE_SOURCE_REPAIR_20260924.md`。
- 同日後續合班修正：Playwright 360／390／640／767／1365px 均只顯示一張 `合班｜中港總部、國中部` 卡片、水平溢出 0；更新操作帶入完整 3 位教練及編輯版本。合班 SQL 52 項與前端 33 項檢查、型別檢查／建置通過；正式資料庫已合併，前端發布與實機驗收仍待完成。

- 2026-09-24 後續顯示調整：依使用者要求移除教練排班卡片及首頁摘要的國中部／中港總部／合班標籤，保留活動類型、狀態、日期／時間、場地與教練。合班與來源連動不變；既有標籤截圖為移除前記錄。


### 2026-09-27 比賽費單場免繳

- 比賽費明細拆至 `MatchFeeMemberList`；`<768px` 使用球員卡片，桌機保留表格。免繳開關使用 Element Plus、球員姓名 ARIA label、44px 觸控高度、儲存中停用及錯誤提示；僅 `fees:EDIT` 可操作，待確認／已付款停用。
- 以本機隔離測試資料掛載實際 Vue 元件及 Element Plus，瀏覽器實際展開、開啟免繳、刷新個人清單；應收從兩筆 1,000 元降至一筆 500 元，免繳者無付款候選。360／390／640／767px 及 root 20px 文字放大沒有頁面水平溢出，手機開關至少 44px；1440px 恢復表格。
- 直接元件與費用完整回歸 24 files／124 tests、型別檢查與 production build 通過。正式登入、真實 iPhone safe area 及遠端 migration 尚未驗收；本次瀏覽器使用 mock service，資料庫規則另由隔離 SQL integration 執行真實 RPC 驗證，不能視為正式環境已上線。

### 2026-09-27 隊費與比賽費獨立設定

- 球員編輯的收費欄位拆至 `PlayerBillingFields`，使用 Element Plus radio／switch，分別設定「不收隊費」與「依參賽收費」。手機雙欄隊費選項、桌機四欄；選項與比賽費開關觸控高度至少 44px，保留群組名稱、說明文字關聯及儲存中停用。
- 本機瀏覽器掛載實際 `PlayersView`、共用 Dialog／Select 與 Element Plus；使用假資料與 mock API，不連正式服務。實際開啟球員、保留不收隊費、開啟比賽費、捲至 footer 儲存、重新開啟後，獨立開關與生效日期皆保留；切換隊費模式不影響比賽費開關。
- 360／390／640／767／1440px 與 390px 下 root 20px 放大文字均檢查頁面及收費欄位，沒有水平溢出，放大文字後仍可操作及儲存。正式登入、iPhone safe area／鍵盤與遠端 migration 尚待驗收，本機瀏覽器證據不能視為正式環境已上線。
- 型別檢查、全量 239 files／1,229 tests、收費完整回歸加元件 22 files／111 tests、收費 SQL 225 項及 production build 通過。首次全量執行有兩項既有測試超時，以 2 workers 完整重跑全數通過。SQL 測試使用真實 migration／RPC／trigger，包含預設值與重跑、啟用日期、單場免繳、請假、付款歷程、linked scope、欄位權限及 Google 同步保留；新 migration 尚未遠端套用。
- `PlayersView` 已抽離收費選項、說明與樣式；既有大型 `MyPaymentsView`／`FeeSettings` 僅更正文案，為避免擴大付款流程風險未在此次拆分，後續可依付款表單與設定分頁拆出子元件。純型別／文件以型別及 diff 檢查驗證，migration 以隔離 PostgreSQL integration 驗證。
