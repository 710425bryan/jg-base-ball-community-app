# 比賽卡片與取消比賽

- 日期：2026-10-12（台灣）
- 交付目標：`IMPLEMENTED`；本機實作與隔離驗證，尚未部署。
- 需求：依桌機／手機設計圖重整未來賽事及賽事紀錄卡片，直接顯示上傳圖片與預設封面；集合時間、比賽時間、地點醒目；新增取消比賽。
- 採用流程：project-workflow、match-records-media、auth-permissions、finance-payments、delivery-workflow，以及 Supabase / imagegen skills。

## 確認的行為

- 短橫幅立即顯示 `photo_url`，無圖／讀取失敗使用本機預設封面；照片預覽與查看詳情為獨立操作。
- 日期、集合時間、比賽時間及完整地點直接顯示，場地自然換行並提供導航。集合時間沿用備註 `集合時間:`／`集合時間：`，未設定顯示「待確認」，不由開賽時間推算。空值不得讀到下一行備註。
- 未來卡片顯示對戰，歷史卡片顯示勝／敗／平及比分；集合時間在歷史卡片降為中性色。沿用現有依日期分頁規則，今天在賽事紀錄。
- 44px 操作區、更多選單集中複製／影片／通知／編輯／取消／刪除。卡片拆成 MatchCard、MatchScheduleInfo，Grid 只負責月份分組與排序；頁面的通知操作抽成 composable。
- 具 `matches:EDIT` 的有效使用者可取消非特訓賽事。需選原因，選「其他」需說明，合計 1–500 字；取消確認顯示日期、時間、集合與地點。處理中禁止重送及關閉，錯誤保留輸入。
- 取消保留 ID、封面、名單、逐局／成績與原因。卡片、表格、詳情／行事曆顯示「已取消／無須集合」，不顯示勝負、不再提供編輯與賽前通知。不自動發送取消推播；後續誤取消恢復需求另見 [恢復規格](2026-10-12-match-restoration.md)，取代初版不可恢復的限制。

## 資料與安全

- 新欄位：`matches.cancelled_at`、`cancellation_reason`、`cancelled_by`，既有紀錄為 NULL。取消欄位不屬於一般新增／編輯 payload。
- RPC `cancel_match(uuid,text,timestamptz)` 回傳 matches 單筆資料。檢查有效登入與 EDIT、理由、特訓排除，先取得與教練來源一致的鎖再鎖賽事，檢查 `updated_at`。重送回傳原取消結果。
- 取消、開放繳費、費用同步、單場免繳及建立比賽付款五個入口統一先取教練來源 advisory lock，再鎖賽事／費用；避免免繳或同步關閉付款時與取消形成反序鎖。以 catalog 唯一錨點補齊既有函式，owner、ACL、SECURITY 與 search_path 保持不變。
- DB trigger 防止 raw REST 偽造、修改或恢復取消稽核；保留 actor UUID，不隨 profile 刪除。未啟用新 RPC 時前端顯示明確錯誤；多個選用欄位尚未部署仍保留舊 schema 讀取 fallback。
- 已開啟的舊編輯表單更新須在 DB query 同時符合 `cancelled_at IS NULL`；詳情開啟強制讀最新資料。較慢的舊查詢不得蓋回取消狀態。正常近期摘要在 limit 前排除取消；行事曆另讀取消場次。
- 取消時關閉比賽費付款開放，只將未繳且無目前付款關聯的款項轉取消；待審／已付、金額快照及球員餘額保留，後續退款走既有財務管理。待審退回亦不得恢復已取消比賽的欠款。
- 排程／手動賽前提醒排除取消，建立事件及派送前再次確認。Next Up、公開摘要、個人成績、出席及彙總不計取消；既有通知事件保存但從賽前提醒 feed 排除。教練排班標記取消且保留指派。
- Google 同步不產出取消稽核欄位；沿用原 UID／fallback 配對，既有已取消場次直接略過，不改 ID、不因外部欄位差異中斷整批匯入。手動 fallback、Edge 預覽及自動同步共用此規則。未更動登入、角色權限列、Storage policy 或路由。
- 本次已拆分卡片、時程資訊與提醒操作；既有大型 parser 僅增加同步計畫的取消判斷，避免連動重構 iCal 解析與身分配對。後續可獨立拆出同步規劃模組。

## 驗證

- 目標單元測試：API／store／卡片／時間資訊／取消視窗／表格／詳情／頁面／提醒操作／日曆／統計／同步；涵蓋圖片正常、缺圖、失敗，取消成功、失敗、無權限、重送、版本與舊回應。
- 取消 SQL：`pnpm test:matches:sql`，LF／CRLF 共 136 checks，涵蓋 raw DML、有效帳號、角色權限、理由、版本、保留照片／付款／餘額、後續退回、來源統計與排班、五個入口鎖定順序、函式權限設定保留、免繳後自動關閉與正常付款及重跑。
- 費用完整單元回歸：21 files／108 tests 通過。付款與教練排班 SQL 全數通過。
- 全域驗證：`pnpm typecheck` 通過；Vitest 286 files／1,669 tests 全數通過，另 observer 13 tests 通過。首次 `pnpm check` 發現舊勝負文案斷言與三個 5 秒 import timeout；更新對應斷言後，以 `vitest run --exclude scripts/supabase-recovery-observer.test.mjs --maxWorkers 4` 完成整套驗證，未放寬測試 timeout。
- `test:roles:sql`、`test:training:sql`、`test:coach-schedules:sql`、`test:payments:sql`、`test:matches:sql` 全數通過；`pnpm build`（含 vue-tsc）與 `git diff --check` 通過。建置仍有既有 Browserslist 資料過期及大 chunk 提示。
- 隔離瀏覽器在 390／768／1365 px 共 24 checks 通過、18 張截圖，另置頂截圖驗證 6 checks；使用假的 Supabase 網址並攔截所有外部 API，不使用正式帳號。Console page errors、非預期寫入與未模擬外部請求均為 0。證據及檢查 log 存 `output/playwright/match-cancellation/`（Git ignored）。
- GitHub CI / Secret scan、Vercel Preview、遠端 Supabase staging 與正式發布未執行；本次交付為本機實作，不代表已通過正式發布 gate。
- 純型別、SQL、文件、圖片為 unit test 例外；以型別檢查、實際 PGlite SQL 與瀏覽器呈現驗證。

## 第二次手機閱讀調整（2026-10-12）

- 使用者要求預設圖改 Logo 浮水印，並確認手機是否能讀完單一卡片。實測原手機工具列固定占用 221–273px；現改為隨頁捲動，月份吸頂設為 0，桌機保留原吸頂行為。
- 手機封面由 112 改 80px，縮減內距及次要標籤；比賽時間欄加寬、地點全文獨占一列且整區可導航。集合時間仍 24px、地點仍 16px、按鈕至少 44px，沒有固定卡片高度或截斷重要內容。

| 尺寸 | 實際閱讀區：前→後 | 普通卡：前→後 | 長地址卡：前→後 |
| --- | --- | --- | --- |
| 375×812 | 409→630px | 590→499px | 694→551px |
| 390×844 | 441→662px | 590→499px | 668→551px |
| 360×740 | 285→558px | 638→499px | 742→551px |
| 320×568 | 113→386px | 638→546px | 768→624px |

- 「完整呈現」指捲到卡片位置後，扣除 App shell 與吸頂月份的空間。320px 小螢幕仍需自然捲動，360px 的取消長地址卡（629px）也須約 71px 捲動；更長內容或放大文字不保證一屏容納，優先保留可讀性。
- 此輪 7 檔／42 unit tests、typecheck、build、四尺寸 32 density checks、三尺寸 24 完整操作 checks 均通過；沒有 page errors／外部請求／非預期寫入。證據在 `output/playwright/match-cancellation/mobile-density-before`、`mobile-density-after`、`mobile-compact-final-flow`，建置／單元 log 為同父目錄 `mobile-density-build.log`、`mobile-density-unit.log`。
- 此輪僅改 UI 與圖片，沿用前節既有後端驗證；未新增資料庫、費用或通知邏輯，也未發布到遠端。PNG／WebP 為 unit test 例外，以實際卡片與 asset 視覺檢查驗證。實體 iPhone／Android 與 safe area 仍待驗收。

## 發布清單與限制

### 取消後的行事曆同步防覆蓋（2026-10-12）

- 依使用者補充需求，手動與排程同步均保留已取消場次的 ID、時間、地點、名單、照片、費用及取消原因。規劃階段略過；實際 UPDATE 再帶 `cancelled_at IS NULL`，防止「先讀取、後取消、再寫入」覆蓋原資料。
- 手動同步傳遞 `requireActive: true`，即使此前有舊 schema 快取或選用欄位重試，也不可移除取消條件；零列更新後強制讀取，只有確認已取消才略過並繼續。權限、讀取與真正資料庫錯誤仍顯示，不誤報取消。
- 排程 UPDATE 使用同一原子條件，零列計入 `skipped_count`，不計更新、不補建；選用欄位重試不移除保護。取消欄位不存在時失敗，須依下方順序先部署 migration。
- 回歸：Dialog／API／store／同步 service／parser／Edge handler 共 6 檔 60 tests 通過；取消 SQL 的 LF／CRLF 共 136 checks 通過。證據存 `calendar-cancel-after.log`、`calendar-cancel-sql.log`。Edge handler 使用隔離 runtime 與真 parser；本機無 Deno，真實部署／多連線競態仍待 staging。
- 此輪完整 Vitest 288 檔／1,686 tests（包含完整費用計算回歸）與 `pnpm build`（含 vue-tsc）通過；log 為 `calendar-full-suite.log`、`calendar-build.log`。建置仍有既有 Browserslist／大 chunk 提示。沒有新增 DB migration，本機 SQL 重新確認既有取消流程；未操作遠端資料或發布。
- 既有比對規則不變：缺 UID 的歷史紀錄只按日期＋開始時間＋標題 fallback；若外部同時改了這些身分欄位，無法可靠辨識為同場，可能被視為新事件。原取消列仍不可被同步覆蓋；本次不加入可能誤配的模糊比對。

### 發布步驟

1. 在 staging 驗證 `supabase/migrations/20261012024808_match_cancellation.sql`。以現有 catalog 的唯一錨點擴充最新函式，保留 hotfix／ACL；錨點或必要來源不符合即中止。
2. 部署 `send-match-reminders` 與引用共用 parser 的 `sync-match-calendar`，沿用原 bearer／排程 secret 驗證，沒有新增 secret；同步函式的 gateway auth mode 需於 staging 發布前對照現況確認。
3. 發布前端，再檢查取消、付款保留、通知與排班。正式環境及 Vercel Preview 尚未部署或驗收。
4. PostgreSQL 真實多連線競態、RLS 與實體手機須在 staging／裝置驗收。已交付推播供應商的通知無法撤回；外部 Google 月曆本體不會自動取消，系統近期列表會標示取消。
5. 回滾前端／Edge 使用前一版本；DB 不刪取消稽核欄位或還原賽事，需 forward-fix，避免舊提醒程式忽略取消。

## 收費管理取消標示補充（2026-10-12）

- 使用者要求在「收費管理 → 比賽費用」醒目標示「比賽已取消」。場次卡頭使用紅底白字＋圖示，原因與停止開放提示不收進明細；手機自然換行，取消卡隱藏開放／關閉繳費入口。
- 狀態必須來自 `matches.cancelled_at`，不能從個別費用取消、免繳或歷史原因推測。待確認／已付款保留原狀態與摘要金額，恢復後刷新清單即回一般未開放卡；未增加退款、轉餘額或變更審核流程。
- 新增 RPC `list_match_fee_items_by_month_with_match_status(text)` 包裝原費用清單，附加 `match_cancelled_at`／`match_cancellation_reason`。保留舊 RPC 的授權、計算與既有月同步，另檢查有效登入及 fees VIEW/EDIT；相容 fallback 只用於新 RPC 不存在，不能將真正讀取失敗當作正常。
- 先部署 `20261012053334_match_fee_cancellation_status.sql`（依賴取消與既有免繳 migrations），再發布前端；前端回滾可保留新增 RPC。未部署新 RPC 時保留舊清單、不猜測取消狀態。
- 驗收包括：收合可見、原因以純文字呈現、待審／已付正常顯示、個別取消不誤標、恢復後標示消失、唯讀可看、390／768／1365px 長原因無水平溢出。
- 本機單元 23 檔／134 tests（含完整費用計算回歸與卡片明細）、新 RPC SQL LF／CRLF 56 checks、整套 `pnpm test:payments:sql`、`pnpm build`（含型別檢查）通過。Log 在 `output/playwright/match-cancellation/fee-cancellation-unit.log`、`fee-cancellation-payments-sql.log`、`fee-cancellation-build.log`。原 RPC definition／ACL／原欄位與排序維持一致；SQL 檢查匿名、無權限、停權、存取期及僅 fees VIEW 情境。型別檔以編譯＋service／SQL 契約驗證，migration 以隔離 Postgres 驗證。
- 此輪僅本機完成；Vercel Preview、正式／staging migration 與實體手機未驗收，尚未發布。瀏覽器證據另見手機稽核文件。

## 預設封面

- 路徑：`public/images/match-default-cover.webp`，2172×724、149,206 bytes；內建 imagegen 編修後僅轉檔為 WebP，非外部下載圖片。
- 2026-10-12 第二次調整：依使用者要求移除手套與球，保留深藍／琥珀球場，中央放清晰可辨識的中港熊戰 Logo 浮水印。Logo 參考專案原圖 `public/少棒元素_20260324_232837_0000.png`，不改動原品牌資產。手機預設封面以完整顯示優先，避免短封面裁掉 Logo。
- 最終編修提示（內建工具，兩張參考圖）：Use case: compositing / precise-object-edit. Asset: wide 3:1 default match card cover for Jhong Gang community youth baseball app. Image 1 is the EDIT TARGET: navy and amber baseball field banner. Image 2 is the exact team LOGO to insert, not a style inspiration. Remove the entire leather glove and loose baseball in image 1 and reconstruct the baseball-field background seamlessly in that region. Preserve the rest of image 1: calm deep navy palette, warm amber field lines, subtle Taipei skyline, textured flat illustration. Put exactly one copy of the supplied Image 2 team logo in the precise horizontal AND vertical CENTER of the banner as a prominent watermark, same original bear face/sunglasses/backwards cap and exact existing JHONG / 中港 GANG wordmark, claw marks, shapes and layout. Preserve the logo identity faithfully, do not rebrand or invent lettering. Composite only the logo artwork, no rectangular original-image background. Watermark should be clearly visible and confidently recognizable, around 70–75% opacity with warm muted gold/cream/gray rather than pale barely visible. Let a slight suggestion of the field show through the watermark. Logo entire bounding box including claw tips should occupy approximately the central 58–62% of canvas HEIGHT, with generous navy breathing room above and below so it survives a shallow mobile crop. No gloves or loose balls anywhere. No extra text, dates, captions, UI, buttons or additional logos. Deliver a single flat wide 3:1 production-ready banner image, not a screenshot or device mockup.
