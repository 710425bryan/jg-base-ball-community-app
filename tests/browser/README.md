# 教練功能手機瀏覽器回歸

## 帳號停權即時退出回歸

`node tests/browser/verify-account-suspension.mjs [output-directory]` 使用既有本機 `http://127.0.0.1:5174` dev server，可用 `SUSPENSION_TEST_URL` 指定本機網址。實際 App、Pinia、Auth SDK、router 與 LoginModal 不替換；REST/Auth 及 Realtime WebSocket 協定使用隔離資料，其他外部請求阻擋。沒有正式登入、帳號修改或寄信。

390／1365px 兩個獨立登入工作階段同時收到停權 UPDATE，驗證不用重新整理即卸載後台、清掉記憶體及持久 session、回首頁且持續顯示原因；返回首頁後寄碼被拒，Auth OTP 呼叫數為零；重新啟用後可寄碼。量測畫面高度、水平溢出與返回按鈕 44px；輸出截圖與 evidence.json。正式 Realtime publication、真實裝置休眠與網路延遲須另驗，不以本機事件到畫面的時間作正式 SLA。

## 教練功能

從專案根目錄執行：

```sh
node tests/browser/verify-coach-ui.mjs
```

可傳入輸出資料夾，例如 `node tests/browser/verify-coach-ui.mjs /tmp/coach-ui-evidence`。
只快速驗證 360 px 的月份總覽情境可用 `COACH_UI_OVERVIEW_ONLY=1 node tests/browser/verify-coach-ui.mjs /tmp/coach-overview-smoke`；輸出明確標記此模式，完整交付仍需執行預設三尺寸回歸。

Runner 自行啟動 `127.0.0.1:5178` 專用 Vite，先用 agent-browser 驗證載入，再以 Playwright Chromium 操作 360、390、767 px 寬度。需要現有 pnpm dependencies、Chromium 與可由 npx 呼叫的 agent-browser；5178 需未占用。

Fixture 掛載實際 Vue 頁面、Element Plus、AppGlobalSelect、AppGlobalDialog 與全域樣式。只有 Pinia 帳號／權限和 API 資料替換為本機 fixture；Supabase import 被替換為會拒絕非預期呼叫的模組，Vite 不讀專案環境變數，不使用 PWA 或版本寫入 plugin。所有非 127.0.0.1:5178 請求均阻擋並記錄，測試要求外部請求為零。Date 固定為台灣 2026-10-02，以驗證未來日期；保留真實 timer 與 animation 時序，截圖等待 Dialog 完成淡入並停用有限 CSS 動畫。

回歸涵蓋橫向溢出、44 px 主要按鈕／關閉控制、滿版 Dialog 捲動與 footer、既有金橘主色、最多兩個頁首按鈕、中文教練搜尋、本人固定身分與 hash 路由。教練新增假單以實際 UI 操作四種請假模式：預設上課日期快選、單日、連續多日、固定週期。驗證多日期與上午時段、追加月份／日期載入重試／切換訓練項目保留選取、過去日期禁選、批次送出失敗不新增假單且重試保留內容與 UUID、連續多日強制全日、兩個固定星期展開下午假單，以及既有修改仍使用單筆版本保存。

排班回歸保留卡片存成範本、自動帶入、手動更新與手動排班流程。範本只保存場地與固定教練；表單僅有場地、固定教練、選填名稱與啟用四欄，驗證已移除活動來源、星期、時間及課程條件。從卡片複製只取實體場地與目前選取教練。隔離 fixture 場地字典包含沒有本月活動的場地，另有同場地不同課程的重疊活動；預覽同時呈現請假與同批撞班的排除原因，僅確認一筆可用活動。

場地選單使用實際 AppGlobalSelect／Element Plus 的 filterable + allow-create：中文自訂場地選取時不寫字典，取消不留下選項；儲存失敗保留場地與教練，成功後重開可選取同一場地 ID，且不建立重複場地。名稱留白由場地名稱命名。空白與自訂場地兩種表單均量測 input／select wrapper 與 switch 至少 44×44 px、輸入字級 16 px，以及 switch 名稱「啟用範本」。固定範本的新增、失敗重試與取消都不直接改寫排班。

固定教練使用實際 Element Plus option groups，依已載入角色的 weight 與 role_name 分組。Fixture 只使用原有三名教練，刻意反轉同組輸入順序；驗證預設總教練／教練排序、動態權重反轉、角色改名、同組姓名排序，以及中文搜尋後隱藏空群組。跨組多選可保留兩位教練，以第一次觸控儲存相同 profile IDs；角色 metadata 不改變候選資格或新增 API 寫入。

排班卡片與手動排班沿用相同分組回歸，量測選單控制與可見選項 44×44 px、輸入 16 px。卡片中已請假的教練仍標示並禁選，搜尋不會解除 disabled；角色改名與權重調整即時反映至卡片。手動排班與卡片跨組多選皆以一次觸控保存教練 ID，保留既有排班、草稿與範本流程。

原有回歸完成後才注入 `SCHEDULINGCOACH`（排班教練、weight 15）及全月資料，驗證新候選的分組／指派 ID。月份總覽情境拆在 `coach-month-overview.mjs`：月初與月末、同日不同場地、所有來源、未指派與取消狀態皆保留，卡片六種來源篩選不影響總覽。場地訓練與比賽來源標籤量測為不同背景與文字色。正常 footer 只有「關閉」，每次開啟與回到前景均讀獨立 RPC snapshot；模擬後端修改已儲存教練時，未儲存卡片草稿仍保留且不混入總覽。讀取失敗清空過期結果，錯誤區域提供唯一的一次觸控重試；回到前景刷新、明確捨棄草稿後切換新月份，都不寫入排班。驗證 44px 入口／重試按鈕、手機內部觸控捲動、固定 footer 與長場地文字無水平溢出。

`coach-unassigned-filter.mjs` 驗證「未指派教練」依已儲存的指派資料與六種來源條件取交集，顯示當前來源未指派活動筆數，並移除原三個唯讀統計。取消而未指派的卡片仍保留取消標記；未儲存的教練草稿仍在未指派清單，保存後才消失。切回「全部」保留 toggle，需再按未指派才關閉。月份總覽持續包含全月全部來源與已儲存指派，不受缺額篩選影響。錯誤狀態另外量測 Dialog/header/footer 與 overlay 捲動位置，並以 elementFromPoint 確認兩個關閉控制可觸及；內容更新截圖等待 paint frame 並保留實際動畫狀態。

多選選單保留 Element Plus 標準行為：選完後透過原有箭頭關閉，再操作儲存；更多選單與儲存必須第一次觸控就生效。批次送出失敗案例是刻意的 API 錯誤注入，只有在錯誤顯示後才重試；一般操作不重試點擊。輸出 `evidence.json`、agent-browser snapshot 與各尺寸截圖；失敗會保留當前截圖及文字診斷。成功條件為 result PASS、沒有 browser error／外部請求，每個尺寸恰好一次自動帶入確認且只送出一筆可用活動。

這是 Chromium 模擬手機尺寸驗證，不能取代實體 iPhone／Android、硬體 safe area、真實 Supabase 授權／RPC 或瀏覽器推播送達驗收。資料庫規則另由隔離 SQL 回歸驗證。
