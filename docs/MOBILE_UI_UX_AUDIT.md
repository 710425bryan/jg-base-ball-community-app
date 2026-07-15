# 手機 UI/UX 一致性稽核與執行清單

本文件依 `docs/MOBILE_UI_UX_RULES.md` 追蹤登入後 `MainLayout` 頁面的實際調整進度。規則文件是目標規格，本文件是執行帳本；未完成程式修改與視覺驗收前，不得將項目標示為「完成」。

清單涵蓋 28 個登入後路由、26 個實作頁面；能力／體測列表與明細各自共用一套實作頁面。

- 最後更新：2026-07-16
- 本輪範圍：P0 → P1 → P2 → P3 程式調整與自動檢查。
- 本輪結論：自動檢查通過，因目前沒有可登入的一般 linked-member 與 ADMIN 裝置環境，全部維持「待驗收」。

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
| P0-04 | 共用 Dialog | footer 排列、寬度與 safe area 不一致 | `AppDialogFooter` 手機等寬、取消在前、確認在後 | 待驗收 | AppDialogFooter 3 tests 通過；待實機 home indicator 驗收 |
| P0-05 | 場地／節日活動卡片 | 可點擊卡片內含另一個按鈕 | 拆成獨立卡片選取區與操作區，HTML 不再巢狀互動 | 待驗收 | TrainingLocations／HolidayTheme tests 與 source contract 通過 |
| P0-06 | 共用搜尋／篩選 | 手機搜尋欄與篩選、檢視及操作按鈕同列，搜尋寬度不足；低頻篩選在頁內向下展開 | 搜尋使用剩餘完整寬度；進階條件使用 `AppMobileFilterSheet` 自底部展開；快速 chips 保留頁面內 | 待驗收 | AppMobileFilterSheet 3 tests＋6 個搜尋／篩選介面 source contract 通過；待 360–767px 視覺驗收 |

## P1：高頻個人頁面

| ID | 路由／頁面 | 現況差異 | 目標與完成條件 | 狀態 | 驗證證據 |
| --- | --- | --- | --- | --- | --- |
| P1-01 | `/dashboard` | Hero CTA 圓角及文字連結觸控範圍不一致 | 保留 Hero 視覺，功能操作至少 44px、`rounded-xl` | 待驗收 | HomeView 16 tests＋source contract 通過 |
| P1-02 | `/calendar` | 頁首按鈕、segmented ARIA、Dialog 斷點與底距不一致 | actions 與 Dialog 符合規則，切換有 `aria-pressed` | 待驗收 | `vue-tsc`、build＋source contract 通過 |
| P1-03 | `/profile` | 功能按鈕圓角不一；Passkey icon 小於 44px | 功能按鈕 `rounded-xl`；icon 44px 並有 ARIA/title | 待驗收 | passkey 5 tests＋source contract 通過 |
| P1-04 | `/my-payments` | 重複主操作；Dialog footer 不一致 | 每區一個 Primary，付款 Dialog 使用共用 footer | 待驗收 | 比賽費開放 gate、既有付款歷程與 myPayments targeted regression 納入 10 files、48 tests；待登入後 360–767px 驗收 |
| P1-05 | `/my-records` | 成員選擇器位於 header actions | 搜尋／選擇移到獨立 toolbar，導航操作至少 44px | 待驗收 | MyPlayerRecords 4 tests＋service 2 tests 通過 |
| P1-06 | `/equipment-addons` | tabs、移除與歷史操作尺寸／數量不一致 | 44px、segmented ARIA；每筆最多兩個可見操作 | 待驗收 | equipment API／inventory 19 tests＋source contract 通過 |
| P1-07 | `/my-leave-requests` | 刪除、載入月份與 footer 偏小 | 44px 並使用共用 Dialog footer | 待驗收 | MyLeaveRequests 2 tests＋service 2 tests 通過 |
| P1-08 | `/training` | 管理與點數區有 32–40px 操作 | 所有功能操作至少 44px、每區一個 Primary | 待驗收 | training API／utils 6 tests＋source contract 通過 |

## P2：後台管理頁面

| ID | 路由／頁面 | 現況差異 | 目標與完成條件 | 狀態 | 驗證證據 |
| --- | --- | --- | --- | --- | --- |
| P2-01 | `/training-locations` | 巢狀按鈕、小型 actions、多重捲動 | 拆分互動、44px、單一主要捲動區 | 待驗收 | View 3 tests＋API／通知 9 tests 通過 |
| P2-02 | `/training-dates` | 頁首四個可見操作且高度不足 | 保留 Primary＋最高頻 Secondary，其餘 overflow | 待驗收 | dates API／utils 12 tests＋source contract 通過 |
| P2-03 | `/training-program-settings` | 手機欄位標籤與輸入框互相擠壓，星期選項觸控區偏小，狀態與儲存操作層級不清 | 欄位改為手機上下排列、星期等寬 44px 網格，狀態與儲存分區 | 待驗收 | View／mobile audit／API／utils 共 66 tests＋`vue-tsc` 通過；待 360／390px 實機驗收 |
| P2-04 | `/coach-schedules` | 篩選缺 ARIA；actions/footer 偏小 | segmented ARIA、44px、共用 footer | 待驗收 | coach schedules 10 tests＋source contract 通過 |
| P2-05 | `/players` | 搜尋篩選與四個功能操作混排；舊 `<640px` CSS 曾覆蓋 `hidden` 造成上下兩組篩選 | toolbar 分層；手機只保留搜尋＋篩選觸發器，條件由底部展開；超過兩個操作使用 overflow | 待驗收 | PlayersView mobile filter regression test＋search/filter source contract 通過 |
| P2-06 | `/users` | 搜尋／篩選／檢視切換放在 header actions；桌機搜尋與登入狀態篩選的寬度、間距及高度不一致 | 移到獨立 toolbar；桌機 filter group 統一 8px 間距與 44px 高度；手機狀態篩選由底部展開；row icon 44px＋ARIA | 待驗收 | UsersView／ViewModeSwitch／mobile audit 共 58 tests＋`vue-tsc` 通過 |
| P2-07 | `/leave-requests` | 設定、日期 chips、刪除與 footer 偏小 | 44px、`aria-pressed`、共用 footer | 待驗收 | LeaveRequests 2 tests＋source contract 通過 |
| P2-08 | `/attendance` | 建立、刪除、開始點名與 footer 偏小 | 功能操作至少 44px，保留既有權限 | 待驗收 | AttendanceList test＋source contract 通過 |
| P2-09 | `/join-inquiries` | 手機清單在載入失敗或零筆資料時沒有狀態內容，會呈現整頁空白 | 手機卡片；共用 loading、可重試錯誤與明確空狀態；Danger 44px＋ARIA | 待驗收 | JoinInquiriesView tests、`vue-tsc`、build＋source contract 通過 |
| P2-10 | `/announcements` | 每筆最多四個可見操作；卡片／表格切換仍使用頁面自製白底樣式 | 保留兩個高頻操作，其餘 overflow；共用 footer 與 `ViewModeSwitch` | 待驗收 | `vue-tsc`、build＋共用檢視切換 source contract 通過 |
| P2-11 | `/equipment` | 卡片／表格最多六個操作；搜尋與分類在手機互相壓縮 | 每筆最多兩個可見操作，其餘 overflow；分類篩選由底部展開 | 待驗收 | equipment 19 tests＋search/filter source contract 通過 |
| P2-12 | `/fees` | tabs 與子元件 Dialog 規格不一；校隊月費搜尋與 program 篩選並排 | tabs 44px＋ARIA；可見 Dialog footer 統一；手機 program 篩選由底部展開；裝備請購／付款移至獨立管理頁 | 待驗收 | 比賽費卡預設收合、ARIA、44px actions、排序與開關 / 刪除 targeted tests 通過；手機操作固定為管理動作左欄、展開 / 收合右欄的等寬雙欄，桌機恢復緊湊排列；production build 通過，待逐 tab 與 360–767px 視覺驗收 |
| P2-13 | `/vendors` | 卡片三個操作；table icons 偏小；手機分類在頁內向下展開 | 每筆最多兩個操作，其他 overflow；icons 44px＋ARIA；分類篩選由底部展開 | 待驗收 | vendors 5 tests＋search/filter source contract 通過 |
| P2-14 | `/equipment-purchases` | 原本付款與請購六個狀態區塊同時堆疊於 `/fees`，桌機與手機資訊量過高 | 付款／請購雙頁籤；`>=1024px` 主清單＋明細，較小螢幕全螢幕 Drawer；摘要／進階篩選預設收起；進階條件統一 Element Plus 控制；付款狀態沿用藍／綠／橘語意色與原說明文字；主清單依狀態顯示淡色外框／底色；分頁後捲到新頁第一筆；刪除請購使用獨立 Danger 按鈕；44px、safe area、深層連結與單一頁面捲動 | 待驗收 | 搬移後全量 154 files、754 tests；Element Plus 篩選回歸 3 files、90 tests；狀態色彩、主清單外框／底色與文案回歸測試通過；請購刪除操作 targeted tests 通過；分頁捲動回歸 3 files、73 tests；`vue-tsc`、build 通過；管理台仍待登入後裝置驗收 |

## P3：特殊介面

| ID | 路由／頁面 | 現況差異 | 目標與完成條件 | 狀態 | 驗證證據 |
| --- | --- | --- | --- | --- | --- |
| P3-01 | `/match-records` | 搜尋在 header actions 並被篩選／檢視／操作壓縮；月份列舊 `sticky top-0` 會蓋到頁首工具列 | 手機搜尋使用完整剩餘寬度，進階條件由底部展開；月份列依頁首實際高度吸附在工具列下方；操作收斂；tabs 44px＋ARIA | 待驗收 | MatchRecords／MatchesGrid tests＋matches/stats 12 tests＋search/filter source contract 通過 |
| P3-02 | `/attendance/:id` | 返回、刪除、chips、狀態操作偏小 | 保留緊湊點名，但操作至少 44px；不新增缺席 | 待驗收 | 缺席 source contract、`vue-tsc`、build 通過 |
| P3-03 | `/holiday-theme-settings` | 活動卡片巢狀操作；circle actions 缺標籤 | 拆分互動；44px、ARIA、Danger 確認 | 待驗收 | HolidayTheme 2 tests＋source contract 通過 |
| P3-04 | `/baseball-ability`、`/physical-tests` | 共用列表每筆三個操作；手機卡片／表格切換曾被 flex 拉成整行 | 每筆最多兩個可見操作，其餘 overflow；檢視切換依內容寬度靠左 | 待驗收 | performance API/config 5 tests＋mobile source contract＋build 通過 |
| P3-05 | 能力／體測明細 | 返回及紀錄操作偏小 | 44px、`rounded-xl`、ARIA 與 Danger 確認 | 待驗收 | performance API/config 5 tests＋build 通過 |

## 驗收紀錄

### 2026-07-16 比賽費用開放繳費保護

- `/fees` 比賽費卡預設收合，依日期與開始時間由早到晚排列，未知時間置於當日最後；卡頭保留應收 / 已收 / 未處理與已開放 / 未開放狀態，操作區使用至少 44px 按鈕與 `aria-expanded` / `aria-controls`。
- 比賽費卡手機操作區固定為等寬雙欄：開放 / 關閉 / 刪除位於左欄，展開 / 收合固定於右欄；即使沒有管理操作，展開按鈕也不再左右跳動，`>=768px` 恢復內容寬度的靠右排列。
- `/my-payments` 只有管理者已開放的未繳比賽費可進入摘要、勾選與合併付款；駁回 / 回滾後保留的未開放歷程改列「已關閉」，不再呈現為可付款。
- targeted regression：10 files、48 tests 通過；`vue-tsc` 與 production build 通過，build 僅有既有 chunk size warning；migration 以 PostgreSQL parser 驗證 70 statements，`git diff --check` 通過。
- Supabase security / performance advisors 已在目前 production schema 做部署前基線檢查；本 migration 會撤銷比賽費相關 anon SECURITY DEFINER 執行權、移除重複管理 policy、包裝 RLS `auth.uid()` 並補付款歷程反查索引。migration 尚未部署，需部署後再跑 advisors 確認結果。
- 尚未取得已套用 migration 的 ADMIN / linked-member 登入環境，因此 360px、390px、640–767px 與桌機實際確認視窗 / 橫向明細捲動仍維持「待驗收」。

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
- 搜尋／進階篩選 source contract：MatchRecords、Players、Users、Equipment、Vendors、SchoolTeamFees 共 6 個介面使用滿寬搜尋列與 `AppMobileFilterSheet`。
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

### 待登入環境驗收

- `/equipment-purchases`：360px／390px／768px 的全螢幕 Drawer，以及 1024px／1440px 的 38%／62% 主從欄位，待登入後瀏覽器驗收。
- 360px／390px／640px／767px：其他登入後頁面待瀏覽器驗收。
- 一般 linked member／ADMIN 權限：待登入後瀏覽器驗收。
- iOS safe area、文字放大、長文案、loading、disabled、Danger：待驗收。
