# AGENT.md

本檔是此專案的 AI / Agent 工作入口。任何自動化代理、程式助手或協作型 AI 在閱讀、分析、修改本專案前，應先閱讀本檔，再閱讀任務相關檔案。

## 1. 專案定位

- 專案名稱：`jg-base-ball-community-app`
- 主要用途：中港國小社區棒球管理系統
- 前端技術：Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus
- 後端服務：Supabase
- 其他重點：PWA、Google Sheet / Google Calendar 同步、Supabase Edge Functions

## 2. 讀取順序

當 AI 接到任務時，請依照以下順序建立上下文：

1. 先讀本檔 `AGENT.md`
2. 若任務可能命中 repo 內既有 AI skills，補讀 `AI_SKILLS.md` 與對應 `.codex/skills/*/SKILL.md`
3. 再讀與任務直接相關的檔案
4. 若涉及路由、權限、登入、資料同步，再補讀對應的 `router`、`stores`、`services`、`utils`
5. 不要一次大量掃描全部檔案，避免引入無關上下文

## 3. 全域工作規則

- 優先做最小必要修改，避免大範圍重構
- 保留既有功能與資料流，除非任務明確要求調整架構
- 沿用原檔案既有風格，不要因個人偏好大改格式
- UI 文案以繁體中文為主，保持現有語氣與用詞一致
- 若功能涉及手機/平板使用情境，需注意響應式與觸控操作
- 全專案 `el-dialog` 在手機模式（`max-width: 639px`）預設必須滿版顯示；右上角關閉按鈕需避開 `env(safe-area-inset-top/right)`，觸控區不得小於 44px。若某 Dialog 需要非滿版，必須在該元件註明原因並確認手機可操作性。
- 若功能涉及登入、權限或敏感資料，先確認是否已有安全讀取路徑可用
- 修改前先辨識該檔案是不是原始碼、產物、腳本或 migration，再決定是否應編輯

## 4. 目前目錄規則

### `/src`

- `src/views/`：頁面級功能。每個檔案通常對應一個路由頁面。
- `src/components/`：可重用區塊元件。跨頁共用的 UI 優先放這裡。
- `src/layouts/`：頁面骨架。公開頁與登入後頁面在這裡切分。
- `src/router/`：路由設定與進頁權限檢查。
- `src/stores/`：Pinia 狀態管理，放登入、權限、資料狀態等共用邏輯。
- `src/services/`：對外部服務或資料來源的存取封裝，例如 Supabase API。
- `src/composables/`：可重用的 Vue 組合式邏輯。
- `src/utils/`：純函式或可測試工具邏輯。若邏輯可脫離 UI，優先放這裡。
- `src/types/`：集中型別定義。

### `/supabase`

- `supabase/functions/`：Supabase Edge Functions。
- 根目錄的 `supabase_*_migration.sql`：資料表、view、RLS、欄位調整等 migration 檔。
- 新資料庫變更優先新增 migration，不要任意覆寫既有 migration，除非確認仍未部署或任務明確要求。

### 其他目錄與檔案

- `public/`：靜態資產。可直接提供給前端使用。
- `dev-dist/`：建置產物或測試產物，預設不要手動修改。
- `scripts/`：一次性或維運型腳本。
- `.codex/skills/`：本 repo 的可重用 Codex skills。若任務明確落在權限、球員同步、推播或賽事日曆同步，先讀對應 `SKILL.md` 再擴大上下文。
- `check_db.ts`、`check_db2.ts`：資料庫檢查腳本，非正式產品流程。
- `vite.config.ts`：Vite、PWA、版本輸出行為。
- `package.json`：套件與可用指令定義。

## 5. 檔案級注意事項

### `src/router/index.ts`

- 目前使用 `createWebHashHistory()`，註解已說明這是為了相容舊版 WebView。
- 除非任務明確要求且已評估部署影響，不能直接改成 `createWebHistory()`。

### `src/services/supabase.ts`

- 依賴 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。
- 已有 `visibilitychange` 的 token refresh 保護邏輯，修改時不要破壞行動端休眠恢復機制。

### `vite.config.ts`

- 內含 `versionUpdatePlugin()`，會維護 `public/version.json`。
- 含 PWA 設定與 chunk 拆分規則，若不是為了解決建置或快取問題，不要隨意改動。

### `public/version.json`

- 這是版本輸出結果，主要由 Vite plugin 維護。
- 若只是功能開發，不需要手動編輯。

### `dev-dist/*`

- 預設視為輸出檔，不作為主要修改目標。
- 除非任務明確是修建置結果、快取產物或 PWA 輸出，否則不要編輯。

### 棒球能力 / 體能測驗數據

- 後台路由為 `/baseball-ability`、`/baseball-ability/:memberId`、`/physical-tests`、`/physical-tests/:memberId`。
- 權限 feature key 分別為 `baseball_ability` 與 `physical_tests`，actions 為 `VIEW / CREATE / EDIT / DELETE`。
- 資料表為 `baseball_ability_records` 與 `physical_test_records`，讀取預設走 `get_baseball_ability_records()`、`get_physical_test_records()` 與 `get_performance_member_options()`。
- 只有 `VIEW` 權限者與有 `profiles.linked_team_member_ids` 綁定的家長/球員，都只能唯讀自己的綁定球員資料；必須具備對應 feature 的 `CREATE / EDIT / DELETE` 任一維護權限，才能讀取全隊資料。
- 新增、編輯、刪除必須依 DB RLS 檢查對應 feature/action，不可只靠前端按鈕隱藏。
- 這些 RPC 不得回傳 `national_id`、`guardian_phone`、`contact_line_id` 等敏感欄位。

## 6. 資料與安全規則

- 本專案包含敏感欄位，例如 `national_id`、`guardian_phone`、`contact_line_id`。
- 顯示或查詢球員資料時，優先確認是否已有安全 view，例如 `team_members_safe`。
- 不要為了方便而把敏感欄位直接擴散到更多頁面、更多查詢或前端快取。
- 涉及權限顯示時，先檢查 `stores/auth.ts`、`stores/permissions.ts` 與 router meta。

## 7. 功能修改原則

- 頁面專屬邏輯留在 `views`，可抽象且可測試的邏輯抽到 `utils` 或 `composables`
- 若只是小型 UI 修正，不要把現有結構整個拆掉重做
- 若新增同步、對帳、名單整理等資料規則，優先補單元測試
- 若修的是 Supabase 寫入流程，留意 `upsert`、唯一鍵、批次資料去重與 RLS
- 若改到球員、請假、收費、賽事等核心流程，需檢查是否影響通知、彙總或關聯資料
- 若改到裝備管理或裝備加購，需同時檢查 `equipment`、`equipment_transactions`、`equipment_purchase_requests`、`equipment_payment_submissions` 的資料流、RLS、付款回報與推播連結
- Google 表單 / Google Sheet 同步不得覆蓋 `team_members.is_primary_payer` 與 `team_members.is_half_price`；這兩個欄位視為系統內手動維護欄位。同步既有球員時必須保留資料庫現值，新增球員時兩者皆預設為 `false`
- 球員、請假、繳費、入隊詢問等事件若需要手機推播，前端與表單入口應統一走 `src/utils/pushNotifications.ts`；收件對象必須依 `feature` + `action` 權限決定，不可再把所有推播綁死在 `leave_requests`
- 若同一事件可能同時從表單提交、Realtime 監聽或多個入口觸發，必須提供穩定 `eventKey`，並由 `send-push-notification` 搭配 `push_dispatch_events` 做去重，避免重複推播

## 7.1 裝備管理規則

- 裝備後台路由為 `/equipment`，使用 feature key `equipment` 與 actions `VIEW / CREATE / EDIT / DELETE`。
- 家長加購路由為 `/equipment-addons`，只要求登入；資料安全由 `linked_team_member_ids` 與 DB RLS 限制，不要改成需要 `equipment:VIEW`。
- 裝備付款回報整合在 `/my-payments`，管理端審核整合在 `/fees?tab=equipment`。
- 裝備圖片與請購處理照片使用 Supabase Storage bucket `equipments`。
- 裝備加購流程是：加購申請 `pending` → 審核 `approved` → 備貨 `ready_for_pickup` → 領取 `picked_up` → 裝備付款回報 `pending_review` → 費用端確認 `approved` 或退回 `rejected`。
- 裝備交易 `purchase` 產生後才會進入付款回報；不要把來源專案的 `fee_records` 或月結關帳模型直接搬進本專案。
- 新增裝備 UI 時避免 Element Plus `size="small"`，保持手機觸控尺寸；大型裝備頁應拆成 components/stores/services/utils，不要集中成單一長檔。

## 7.2 節日主題設定規則

- 節日主題後台路由為 `/holiday-theme-settings`，使用 feature key `holiday_theme_settings` 與 actions `VIEW / EDIT`。
- 節日主題通知使用 feature key `holiday_theme` 與 action `VIEW`；收件對象為具備該權限且有啟用推播裝置的有效登入帳號。
- 設定儲存在 `system_settings` 的 `holiday_theme_config` row，payload 為 v2 多活動格式；要保留 legacy single-theme config 的轉換相容性。
- 公開首頁與未登入頁不可直接查 `system_settings` raw table；只能走 `get_public_holiday_theme_config()`。
- 後台儲存必須走 `save_holiday_theme_config(jsonb)`，DB 端需檢查 `holiday_theme_settings:EDIT`，不可只靠前端按鈕隱藏。
- 球員主題選單只讀非敏感欄位，優先走 `get_holiday_theme_player_options()` 或 `team_members_safe`，不得暴露 `national_id`、`guardian_phone`、`contact_line_id`。
- 自動通知 event key 固定為 `holiday_theme:auto:<activityId>:<scheduleStartAt>`；手動補送每次確認產生新的 request key，但同一次操作需避免雙擊重送。
- 排程 Edge Function 不可硬編碼 Supabase URL、authorization token 或 sync secret；cron migration 使用 `current_setting('app.holiday_theme_function_url')`、`app.holiday_theme_authorization`、`app.holiday_theme_secret`。
- 全站套用點為 `LandingView`、`HomeView`、`App.vue`、`PublicLayout`、`MainLayout`；調整動畫或橫幅時需同時確認公開頁與後台不遮擋既有操作。

## 8. 驗證規則

依任務範圍選擇對應驗證，至少做最貼近修改範圍的檢查：

- 型別檢查：`pnpm exec vue-tsc --noEmit`
- 單元測試：`pnpm exec vitest run <target>`
- 完整建置：`pnpm build`

若沒有對應 script，請不要假設存在；先以 `package.json` 為準。

## 9. 提交前檢查

- 只修改和任務直接相關的檔案
- 確認沒有誤動產物檔與無關檔案
- 確認新增規則與現況一致，不要寫成理想化但不符合實際 repo 的文件
- 回報時要清楚說明：改了什麼、為什麼、怎麼驗證、是否有未處理風險

## 10. AI 回應風格

- 先講結論，再補細節
- 優先用繁體中文
- 簡潔、可執行、貼近專案現況
- 若規則與實際程式碼衝突，先指出衝突，再提出建議，不要直接假設規則永遠正確

## 11. 本檔維護原則

- 這份文件是專案現況規則，不是抽象模板
- 當專案結構、資料流或部署方式改變時，應同步更新本檔
- 若新增重要目錄、建置流程、資料同步規則或安全邊界，請一併補到本檔
## Security Boundary Update (2026-04)

- `permissionsStore.can()`、按鈕顯示、router guard 只算前端 UX 控制，不算資料安全邊界。
- 任何受保護資料若能被 API / Supabase 直接讀取，必須同步補 DB 端 RLS、policy、或 `security definer` RPC。
- 公開頁面不可直接查受保護 raw table；請優先使用公開安全 RPC，例如 `get_public_landing_snapshot()`。
- 登入前的 email 存在性 / 可登入性檢查，不可匿名直查 `profiles`；必須走 `can_request_magic_link()` 這類只回 boolean 的 RPC。
- `team_members_safe` 是非敏感讀取的預設路徑；若流程需要 `national_id`、`guardian_phone`、`contact_line_id` 等敏感欄位，必須改走 `team_members` 並確認有對應 DB 權限。
- 權限功能若新增或調整 `feature/action`，要一起更新三層：DB helper / RLS、前端 permission store、AI 文件與 skill。
