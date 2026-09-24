# 教練排班合班去重與來源連動（2026-09-24）

## 結果與部署狀態

- 已部署正式資料庫 `qwxzwomzoyfkorbwsscv`：`supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql`。CLI 原建立時間為 `20260924053647`，套用後檔名對齊遠端 migration history。
- 管理 RPC 實測：9/25 中港國小只回傳一筆已儲存排班，09:00–12:30，保留原本 3 位教練；輔大棒球場地也只回傳一筆，保留原本兩筆合計 5 位教練。Dashboard 同日回傳兩個場地各一筆。
- 全部已儲存排班由 31 筆變為 30 筆；91 筆教練指派全部保留，assignment ID／coach ID 校驗碼前後同為 `e6c84c4f5c3daeca261478344104bdf3`。輔大 4 筆指派改連至保留的既有排班 ID。
- 資料庫合班、防重及來源連動已生效；前端已依後續要求移除訓練項目標籤；編輯版本檢查已完成本機驗證。前端交付版本為 `1.1.64`，依使用者授權透過 `main` 推送交付，正式上線狀態以自動部署結果為準。舊前端重新載入即可取得合併後清單，但不會送出新版本欄位。

## 原因與修正規則

原程式把每個 program 的場地配置 UUID 當成獨立課程。9/25 中港國小實際為同一堂合班訓練，但中港總部／國中部分別存在 09:00–12:30 與 09:00–12:00 來源，因此畫面呈現「一筆已儲存＋一筆未排班候選」。僅顯示 program 名稱或修復失效 UUID 無法處理這個原因。

- 場地課以日期、實體 `venue_id`、標準化開始時間、去除頭尾空白的課程標題共同判定；program 與結束時間不拆班，結束時間取最晚。
- 不同日期、實體場地、開始時間或課程標題仍分開；沒有 `venue_id` 時不按地點文字猜測合併，archived 來源單獨保留。比賽、特訓課及手動排班維持原本 UUID／人工事件規則。
- 候選清單、儲存與來源同步使用同一個 private slot resolver，資料庫唯一約束與交易鎖共同防重。跨 program 的重複儲存會指向同一筆排班。
- 每筆排班記錄所有來源場地 ID；移除代表來源時重新連結其他來源，只有最後來源刪除才清除排班。拆成不同時間時，原本課程保留教練，移出的新候選不複製指派。
- 合併已儲存排班保留最早的事件 ID，教練取聯集、備註保留；同一教練不重複。狀態若不一致，只要其中一筆正常上課，合併後維持正常上課。原始事件與指派保存在 `private.coach_schedule_merge_audit`，正式本次有 2 筆原始事件快照。
- 舊的未排班候選只有完全相同的重送可成功；若其他來源已排班且內容不同，要求重新整理，避免覆蓋既有教練。新前端編輯傳送 `updated_at`，資料庫拒絕過期版本；舊版前端未帶此欄位的既有編輯流程仍維持原行為，版本防護須隨前端發布。
- 後續依使用者要求，教練排班卡片與首頁摘要移除國中部／中港總部／合班標籤。RPC metadata 保留，合班、防重及來源連動不變。前述瀏覽器截圖記錄的是移除前版本。

## 驗證與防回歸

- 提交前完整 `pnpm check` 通過：235 個測試檔／1,202 項單元測試、81 項 SQL 檢查、型別檢查及 Vite production build。

- `pnpm test:coach-schedules:sql`：隔離 PGlite 執行實際 migrations，來源修復 29 項、合班 52 項 SQL 檢查通過。包含教練／備註保存、相同來源重送、防重唯一約束、失效版本、拆班／重新合班、來源新增／異動／刪除、同一 SQL 交換時段、最後來源清除、不同課程與未知場地不誤併、比賽與手動排班隔離、Dashboard 自己／管理者權限。
- 固定開發依賴 `@electric-sql/pglite@0.3.14`；上述 SQL 回歸加入 `pnpm check`，現有 GitHub CI 會在後續修改時自動執行，不連接正式資料庫。交易鎖與唯一約束已測行為，未宣稱有多連線壓力測試。
- 6 個檔案共 33 項前端 unit tests、`pnpm exec vue-tsc --noEmit`、`pnpm build` 通過。建置僅有既有 Browserslist／chunk size 提示，HomeView 測試有既有天氣 mock fallback 訊息。
- Playwright 本機 fixture 掛載實際 Vue／Element Plus 管理頁，360／390／640／767／1365px 皆只有一張合班卡片、水平溢出 0、無 page error；已檢視 390／1365px 截圖。實際點擊更新確認送出 3 位教練及完整 `updated_at`。截圖位於工作區外的 `coach-schedule-evidence/coach-shared-390.png` 與 `coach-shared-1365.png`。
- 正式資料庫核對：重複 slot 為 0；管理與 Dashboard RPC 實際回傳合班清單，所有教練指派 ID／coach ID 保留。唯讀 RPC 權限模擬使用回滾交易。
- Supabase advisors 無新增 WARN／ERROR；private audit 啟用 RLS 且不授予 client 權限，刻意沒有允許政策，因此新增一項 [RLS 無 policy 的 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。
- 本次未更動球員配置、點名、訓練日期與收費規則，不需費用全量回歸。migration 以 SQL 實測、純型別以型別檢查、文件以 diff check 驗證。

## 前一階段修復與回復

- 先前已部署 `20260924043936_coach_schedule_program_source_integrity.sql`：修復 1 筆同 session 的唯一替代來源，另將 7 筆 7–8 月找不到來源的歷史排班轉手動，保存事件及指派。該階段依 program 分開的假設已由使用者「同一場訓練」確認及本次 shared-slot migration 取代。
- 前端管理頁原本 622 行，已抽出 `CoachScheduleEventSummary.vue`，維持既有 Element Plus 操作。
- 回復採 forward-fix；需要復原合併前內容時由 private audit 取回，勿重跑舊同步／刪除 trigger migration，否則會破壞共用來源規則。
- 正式登入畫面與 iOS 實機驗收仍待完成；本機瀏覽器 fixture 不代表正式前端已發布。
