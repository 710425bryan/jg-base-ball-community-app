# 手機版版面與功能按鈕一致性規則

本文件定義 `jg-base-ball-community-app` 登入後手機版面的目標規格，供後續新增、修改與稽核 UI 時共同遵守。

本文件是「目標基準」，不代表現有頁面已全部符合。逐頁現況、調整順序與驗證證據記錄在 `docs/MOBILE_UI_UX_AUDIT.md`，實作時仍以實際程式碼為準。

## 1. 適用範圍

適用：

- 掛在 `MainLayout` 下的個人功能與後台 route-level 頁面。
- 登入後頁面使用的共用元件、表單、列表、卡片、工具列與 Element Plus Dialog。
- 新增頁面，以及後續實際修改到的既有頁面區塊。

保留獨立視覺：

- 公開首頁、登入前頁面與 `PublicLayout`。
- Dashboard hero、首頁展示型 section、卡片標題與行銷內容。
- 比賽即時控制器、比分板等需要高密度操作的專業介面。
- 上述例外仍必須遵守觸控尺寸、safe area、可讀性、操作狀態與無障礙規則。

## 2. 設計基準

### 2.1 既有品牌與色彩

不建立新的品牌色盤，沿用 `src/style.css` 與 `tailwind.config.js`：

| 用途 | 既有值 | 規則 |
| --- | --- | --- |
| 主色 | `#D88F22` / `primary` | 主要操作、選取狀態、重點 icon |
| 主色 hover | `#C27C1C` / `primary-hover` | 只作互動回饋，不建立另一套橘色 |
| 頁面背景 | `#f8fafc` / `background` | 登入後內容背景 |
| 卡片表面 | `#ffffff` / `surface` | 卡片、工具列、次要按鈕 |
| 主要文字 | slate 800 | 標題與主要資料 |
| 次要文字 | slate 500–600 | 說明、輔助資訊 |
| 危險 | red 500–700 | 刪除、拒絕、不可逆操作 |
| 成功 | emerald 500–700 | 核准、完成、成功狀態 |
| 警告 | amber 500–700 | 待處理、提醒、風險提示 |

- 功能按鈕不得用裝飾性漸層區分層級。
- 狀態色只表達語意，不取代文字、icon 或狀態標籤。
- 不因參考其他產品而大幅更換主色、背景或文字色。

### 2.2 形狀、字級與間距

| 項目 | 手機目標規格 |
| --- | --- |
| 觸控範圍 | 最小 `44 × 44px` |
| 一般功能按鈕 | `min-height: 44px`、`rounded-xl`、左右 padding 16px |
| icon-only 按鈕 | `44 × 44px`、`rounded-xl`、icon 約 18–20px |
| 按鈕文字 | 約 15px、`font-bold`、正常字距 |
| 頁面左右留白 | 12–16px |
| 控制項間距 | 8px |
| 同區塊間距 | 12px |
| 區塊間距 | 16px；大型 section 可使用 20–24px |
| 卡片 | 預設 `rounded-2xl`，不為了裝飾任意混用更多圓角 |
| badge / 狀態膠囊 | `rounded-full` |

- 不以縮小到 12px 以下的按鈕文字解決空間不足。
- 功能文案以繁體中文為主，不使用裝飾性 uppercase 或過寬字距。
- 文字放大模式不得造成按鈕文字被裁切或操作列水平溢出。

## 3. 響應式定義

| 範圍 | 定義 | 用途 |
| --- | --- | --- |
| `< 768px` | 手機模式 | 與 `MainLayout` 的 `md:hidden` 底部導覽一致 |
| `< 640px` | 窄手機附加調整 | 只處理更小字寬、網格降欄與極窄空間 |
| `>= 768px` | 平板橫向 / 桌面模式 | 可恢復桌面工具列、表格與非滿版 Dialog |

- 不可只在 `<640px` 處理關鍵手機操作，卻讓 640–767px 同時出現手機導覽與桌面版操作密度。
- 新規則或共用元件優先以 Tailwind `md:` 作為手機與桌面切換點。
- 若業務介面確實需要不同斷點，需在元件中註明原因並加入對應驗收尺寸。

## 4. 頁面版面

### 4.1 捲動與安全距離

- `MainLayout` 已提供固定 app shell、上方導覽與手機底部導覽；`.app-main-scroll` 是登入後 route 唯一的頁面級垂直捲動區。
- Route 根節點使用 `min-h-full`；不得同時使用 `h-full` 或 `overflow-hidden` 裁切由 `MainLayout` 管理的內容。只有 Dialog、Drawer、表格 body 等局部元件可建立自己的內容捲動區。
- 需要無限載入的頁面應觀察 `MainLayout` 捲動容器內的 sentinel，不得為了 scroll event 再建立第二個全頁捲動容器。
- `MainLayout` 的手機底部導覽位於正常排版流，由 layout 負責 `4.5rem` 高度與 `env(safe-area-inset-bottom)`；route 頁面不得重複預留這段高度，只保留至少 20px 內容尾距。
- Sticky CTA 或固定操作列必須位於底部導覽上方，且自行加入左右與底部 safe area。
- 不可把主要操作放在會被 iOS home indicator、鍵盤或底部導覽遮住的位置。

### 4.2 頁面標題與頁首

- 登入後 route-level 頁面第一層標題使用 `AppPageHeader`，不可在 view 重建另一套 page title。
- `title-suffix` 只放數量或簡短狀態；返回按鈕放 `before`；頁面操作放 `actions`。
- 手機順序固定為：標題／說明 → page actions → 搜尋或篩選 → 主要內容。
- 搜尋、篩選、分頁、檢視模式不混在 `actions` 裡；應放在標題下方的獨立工具列。
- Page actions 在手機可佔滿可用寬度，控制項可換行，但不可出現水平捲動。

### 4.3 搜尋、篩選與表單

- 登入後業務表單與篩選預設使用既有 Element Plus 控制：文字用 `el-input`、單／多選用 `el-select`、日期／時間用 `el-date-picker`／`el-time-picker`；同一欄位群組不可混用原生 `<input type="date">`、`<select>` 與 Element Plus。
- 日期控制需明確設定 `type`、`format`、`value-format`、placeholder 與是否 `clearable`；選單使用 `el-option` 並提供清楚的「全部／不限」空值語意。並排控制需統一 `size="large"`、滿寬與 label 間距，確保高度、focus、disabled、clear icon 及鍵盤操作一致。
- 原生表單控制只保留給 Element Plus 沒有對應的檔案、顏色或平台能力；使用例外時需在同名 unit test 或稽核紀錄說明原因，不得只為省略元件寫法而混用。
- 搜尋輸入、select、date picker 與主要表單欄位在手機預設滿寬；搜尋與篩選同列時採 `minmax(0, 1fr) + 44px`，搜尋欄取得扣除篩選按鈕後的完整可用寬度。
- 輸入控制高度不得低於 44px；文字輸入維持至少 16px，避免 iOS 自動縮放。
- `<768px` 的低頻 select、日期區間與進階條件使用 `AppMobileFilterSheet` 從畫面底部展開；觸發按鈕為 44×44 icon button，已套用條件以數字 badge 顯示。
- 底部篩選面板需有拖曳提示、標題、44px 關閉按鈕、可獨立捲動內容，以及避讓 home indicator 的等寬「清除／完成」footer。
- 搜尋欄保持在頁面可見，不收進面板；「清除」只重設面板中的進階條件，不應連帶清空搜尋文字。
- 狀態 chips、頁籤、月份前後切換與點名群組等高頻快速切換保留在頁面上，使用 `aria-pressed` 與可橫向捲動容器，不視為進階篩選。
- 同一生命週期狀態在狀態按鈕、說明區、摘要卡、主清單狀態容器與清單 badge 必須使用穩定且一致的語意色；狀態容器以淡色背景和外框包住白色資料卡，不整片填滿高彩度色。顏色只作輔助，仍需顯示完整狀態文字與必要說明，不可只靠藍／綠／橘辨識。
- 搬移或重組既有流程 UI 時，若業務規則沒有改變，需保留原本已核對的狀態標題與說明文案；若因新資訊架構需縮短按鈕文字，仍須在目前狀態說明區保留完整原文。
- `>=768px` 可維持桌機行內篩選或 popover，但不得讓桌機工具列的寬度設定壓縮手機搜尋欄。
- 表單錯誤訊息顯示在欄位附近；不可只用 toast 告知哪個欄位錯誤。

### 4.4 列表、卡片與表格

- 手機優先使用卡片、分組列或明確設計的橫向捲動表格；不可直接縮小桌面表格文字塞進畫面。
- 重要資料、狀態與主要操作不可只存在於 hover。
- 單筆資料最多直接顯示兩個操作；更多操作收進 item menu。
- icon-only row action 在手機仍需 44px 觸控範圍，並提供 `aria-label` 與 `title`。

### 4.5 主從式管理台

- 資料密集型主從頁可使用 `1024px` 作為專屬斷點，但需在頁面規則與測試明確記錄；`>=1024px` 顯示主清單＋明細，較小螢幕只顯示主清單並以全螢幕 Drawer 開啟明細。
- 主清單需保留搜尋、快速狀態與分頁，不得把高頻切換收進進階篩選；大量摘要與低頻條件可收合並預設收起。
- 未選資料時桌機明細顯示明確引導空狀態，不得自動打開第一筆；通知或 URL 深層連結可直接選取指定資料。
- 全螢幕 Drawer 必須有清楚的返回／關閉按鈕、單一 body 捲動區與避讓 `env(safe-area-inset-bottom)` 的操作列；每個操作區仍只允許一個 Primary。
- 主清單與明細不得各自建立平行的全頁捲動；route-level 捲動仍由 `MainLayout` 負責，長清單使用搜尋與分頁控制資訊量。
- 主清單切換分頁後，應把 `MainLayout` 的頁面捲動位置帶到新頁第一筆資料；不得捲回整個 route 頂端，也不得建立清單內部的第二條垂直捲軸。

## 5. 功能按鈕規則

### 5.1 按鈕決策表

| 類型 | 視覺 | 使用情境 | 手機排列 |
| --- | --- | --- | --- |
| Primary | `bg-primary`、白字、`rounded-xl` | 新增、建立、儲存、送出、確認主要流程 | 每個操作區最多一個；優先取得剩餘寬度 |
| Secondary | 白底、灰框、slate 文字 | 重新整理、取消、返回、設定、次要工具 | 單獨時保留文字；與 Primary 並列可改 44px icon-only |
| Tertiary | 透明或淡色背景、文字／icon | 卡片內查看、展開、低風險輔助動作 | 不得搶過 Primary 層級 |
| Danger | red 語意色 | 刪除、拒絕、退款、不可逆操作 | 與一般 Primary 分開，執行前二次確認 |
| Segmented | 同一容器內的互斥選項 | 卡片／表格、月份／清單等檢視切換 | 使用 `aria-pressed`，不當成多個主要按鈕 |

語意配對如「核准／拒絕」可使用 emerald／red，但仍需完整文案，不能只靠顏色辨識。
裝備付款的退款／作廢收款延續既有 orange 淡色警示樣式，仍必須顯示完整文案與二次確認；刪除請購維持獨立 red Danger，不可因兩者都屬風險操作而套成同一顏色。

### 5.2 操作數量與排列

- 同一操作區最多一個 Primary。
- 手機頁首只有一個 Primary 時可佔滿整列；Secondary 與 Primary 並列時，Primary 取得剩餘寬度。
- Secondary 若改為 icon-only，icon 必須是常見且無歧義的操作，例如重新整理或設定。
- 可見操作超過兩個時，保留 Primary 與最高頻 Secondary，其餘收進「更多」選單。
- Dialog footer 在手機為等寬雙欄：取消在前、確認在後；若只有一個確認動作則可滿寬。
- 桌面操作順序維持由次要到主要，Primary 位於最右側。

### 5.3 Icon 與文案

- 按鈕 icon 預設放在文字左側，統一使用 Element Plus icon 或既有共用 icon。
- 不為相同動作在不同頁面混用手寫 SVG、Element Plus icon 與純文字。
- icon-only 按鈕必須同時提供 `aria-label` 與 `title`；不能只依圖示猜測用途。

建議統一文案：

| 意圖 | 文案 |
| --- | --- |
| 重新取得資料 | `重新整理`；loading 為 `更新中…` |
| 新增主檔資料 | `新增{項目}` |
| 建立事件／單據 | `建立{項目}` |
| 儲存表單 | `儲存`；必要時使用 `儲存變更` |
| 提交流程 | `送出` 或具體的 `送出申請` |
| 取消 | `取消` |
| 刪除 | `刪除`；確認按鈕為 `確定刪除` |
| 返回上一層 | `返回`，或有 accessible label 的返回 icon |

- 不在相同意圖混用「刷新／更新資料／重載／重新整理」。
- 避免只有「確定」的模糊文案；使用能描述結果的動詞。

### 5.4 狀態與回饋

- 提交後立即進入 loading 並 disabled，防止重複送出；loading 不應改變按鈕寬度造成跳動。
- disabled 除了降低透明度，也要移除 hover／active 效果並保留可讀文字。
- 觸控裝置需有 `active` 回饋，不可只寫 hover 樣式。
- 鍵盤操作需保留清楚的 `focus-visible`；不可用 `outline: none` 後不提供替代焦點。
- 成功、失敗與驗證錯誤沿用現有 Element Plus message／notification 模式；不可只改按鈕顏色卻沒有文字回饋。
- 權限不足的操作依既有 permission 規則隱藏或停用；前端按鈕控制仍不是資料安全邊界。

## 6. Dialog 規則

- 手機模式 `<768px` 的目標是滿版 Dialog；640–767px 不應回退成擁擠的桌面 Dialog。
- Header 必須避讓 `env(safe-area-inset-top/right)`，關閉按鈕觸控區至少 44px。
- Body 是 Dialog 內唯一主要捲動區，使用 `min-height: 0` 並保留慣性捲動。
- Footer 固定在 Dialog 內容底部，加入 `env(safe-area-inset-bottom)`；按鈕不可被鍵盤或 home indicator 遮住。
- 手機 footer 預設等寬排列；取消在前、確認在後。窄到文案無法容納時改為垂直堆疊，Primary 放在最後。
- Danger 確認使用具體結果文案並搭配確認說明；不可把刪除 icon 放在關閉按鈕旁造成誤觸。
- 必須非滿版的 Dialog 要在元件註明原因，並驗證 360px 與文字放大模式。

## 7. 禁止事項與例外管理

禁止：

- 新增另一套主色、按鈕漸層或只為單一頁面建立新的按鈕視覺語言。
- 同層操作混用 `rounded-lg`、`rounded-2xl`、`rounded-full` 表達相同功能。
- 依賴 hover 才顯示主要操作、狀態或說明。
- 以縮小文字、縮小觸控區或隱藏關鍵文案處理手機空間不足。
- 讓 page actions、sticky CTA、Dialog footer 或浮動按鈕蓋住底部導覽。
- 在同一列放入三個以上同等權重的功能按鈕。

例外流程：

1. 先確認能否用既有 Primary／Secondary／Danger 或 overflow menu 解決。
2. 若不能，於元件註解與 PR／回報中說明業務理由、適用範圍及手機驗收方式。
3. 可重用的新模式應提升為共用元件或全域 class，不要散落在單一 view。

## 8. 驗收檢查表

每次新增或修改手機 UI，至少驗證：

- [ ] 360px 寬度：無水平溢出，長標題與長按鈕文案可換行或合理收合。
- [ ] 390px 寬度：頁首、搜尋、主要操作與內容層級清楚。
- [ ] 640–767px：仍使用完整手機模式，不出現手機底部導覽搭配桌面操作密度。
- [ ] 文字放大模式：按鈕、tab、badge 與 Dialog footer 不裁切。
- [ ] iOS safe area：頁首、關閉按鈕、底部內容與 CTA 不碰到瀏海或 home indicator。
- [ ] Bottom nav：最後一筆內容與固定操作不被 4.5rem 導覽遮住。
- [ ] Touch target：主要按鈕與 icon-only 按鈕至少 44px。
- [ ] Loading：不可重複送出，文案與版面不跳動。
- [ ] Disabled：狀態清楚且不觸發 hover／active。
- [ ] 權限：無權限使用者看不到不該出現的操作，DB/RPC 邊界仍照 feature skill 驗證。
- [ ] Danger：有二次確認、具體結果文案與錯誤回饋。
- [ ] 無障礙：icon-only 有 `aria-label`／`title`，segmented control 有 `aria-pressed`，focus 可見。

## 9. 分批稽核清單

下表是優先級摘要；逐頁 backlog、狀態與驗證證據以 `docs/MOBILE_UI_UX_AUDIT.md` 為準。

| 優先級 | 範圍 | 已觀察到的差異 | 目標與完成條件 | 狀態 |
| --- | --- | --- | --- | --- |
| P0 | `src/style.css`、`MainLayout`、`AppPageHeader`、共用 Dialog | 底部導覽以 `<768px` 顯示，但按鈕最小高度與滿版 Dialog 主要套在 `<640px`；頁首 action 圓角、尺寸與排列不一致 | 對齊手機斷點；統一 44px 觸控、page actions、Dialog footer 與 safe area；完成 360/390/640–767px 驗收 | 待辦 |
| P1 | Calendar、MyPayments、MyLeaveRequests、EquipmentAddons、Training、Profile、MyRecords、Home 個人功能 | 高頻頁面的重新整理、新增、提交按鈕混用文字按鈕與 icon-only；頁面 padding 與底部避讓重複且不一致 | 套用同一 action hierarchy、文案、尺寸與底部安全距離；主要個人流程可單手完成 | 待辦 |
| P2 | Players、Users、LeaveRequests、Attendance、TrainingLocations、TrainingDates／Programs、Equipment、Fees、Vendors、CoachSchedules | 管理頁操作密集，列表／卡片 action、搜尋篩選、圓角與 Danger 表現不一 | 每區最多一個 Primary、每筆最多兩個可見操作，其餘進 overflow；手機列表與 Dialog 通過檢查表 | 待辦 |
| P3 | MatchRecords、RollCall、HolidayTheme、能力／體測與特殊操作介面 | 有 sticky toolbar、緊湊 action、專業操作面板與局部自訂樣式 | 保留必要專業視覺，但補齊 44px、safe area、accessible label、loading 與危險操作確認 | 待辦 |

## 10. 後續開發流程

- 手機版面、功能按鈕、Dialog、sticky action 或 safe area 任務，先讀本文件再讀相關 feature skill。
- 新頁面從一開始遵守本規則；修改既有頁面時至少讓本次觸及區塊符合，不順手重構無關功能。
- 若規則與現有程式碼衝突，先相信程式碼現況並在回報指出差異，不把目標規格描述成已完成。
- 共用模式若在三個以上頁面重複，優先評估抽成 `src/components/common/` 元件或 `src/style.css` 共用 class，並同步補測試。
- 本文件只定義 UI 行為，不改變 permission、RLS、RPC、資料流程或 feature-specific 業務規則。
