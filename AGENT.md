# AGENT.md

本檔是 `jg-base-ball-community-app` 的 AI / Agent 工作入口。任何自動化代理、程式助手或協作型 AI 在閱讀、分析、修改本專案前，必須先讀本檔，再依任務讀對應 skill 與程式碼。

若 `AGENTS.md`、其他提示或舊文件與本檔衝突，以本檔為準；若本檔與實際程式碼衝突，先相信程式碼現況，並在回報中指出文件需要更新。

## 0. 專案定位

- 專案名稱：`jg-base-ball-community-app`
- 產品定位：中港熊戰 / 中港國小社區棒球管理系統
- 主要使用者：管理員、經理、教練、家長、球員
- 前端技術：Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus + Tailwind CSS
- 後端服務：Supabase Auth / Database / Storage / Edge Functions
- 其他重點：PWA、Web Push、Google Sheet / Google Form 同步、Google Calendar / iCal 賽事同步、行動裝置與舊版 WebView 相容

## 1. Codex 啟動流程

每次開始任務，依序做：

1. 讀本檔 `AGENT.md`。
2. 看 `git status --short`，確認工作區是否已有他人或使用者改動。
3. 若需要理解整體功能資料流，讀 `docs/PROJECT_LOGIC.md`；若需要找檔案與責任邊界，讀 `docs/FILE_MAP.md`。
4. 依任務分類讀 `AI_SKILLS.md` 與 `.codex/skills/*/SKILL.md`。
5. 只讀任務直接相關的 `views`、`components`、`stores`、`services`、`utils`、`types`、migration 或 Edge Function。
6. 如果任務碰到路由、登入、權限、敏感資料、公開頁或推播，必須補讀安全邊界相關檔案，不能只改 UI。
7. 動手前先辨識目標檔案是原始碼、產物、維運腳本還是 migration。
8. 修改後依本檔的驗證矩陣跑最貼近的檢查。
9. 回報時說清楚改了什麼、原因、驗證結果、剩餘風險。

不要一開始就全專案掃檔；先用 `rg` / `rg --files` 精準定位。

## 2. 任務分類與必讀 Skill

本 repo 的 Codex skills 放在 `.codex/skills/`，索引在 `AI_SKILLS.md`。命中下列情境時，先讀對應 `SKILL.md`。

| 任務類型 | 必讀 skill | 常見必讀檔案 |
| --- | --- | --- |
| 一般 Vue / Supabase 修改 | `jg-baseball-project-workflow` | `src/router/index.ts`、相關 `view/component/store/service/type` |
| 登入、角色、路由守衛、feature/action | `jg-baseball-auth-permissions` | `src/router/index.ts`、`src/stores/auth.ts`、`src/stores/permissions.ts`、相關 migration |
| 球員名單、Google Form / Sheet 同步 | `jg-baseball-player-sync` | `src/utils/playerSync.ts`、`src/utils/playerSync.test.ts`、`PlayersView.vue` |
| 推播、通知中心、eventKey、subscription | `jg-baseball-push-notifications` | `src/utils/pushNotifications.ts`、`supabase/functions/send-push-notification/*` |
| Google Calendar / iCal 賽事同步 | `jg-baseball-match-calendar-sync` | `src/utils/googleCalendarParser.ts`、`src/services/matchesApi.ts`、`SyncCalendarDialog.vue` |
| 特訓報名、球員點數、特訓點名 | `jg-baseball-training` | `src/views/TrainingView.vue`、`src/services/trainingApi.ts`、`src/utils/training.ts`、`supabase_training_points_migration.sql` |
| 裝備管理、加購、庫存、裝備付款 | `jg-baseball-equipment-management` | `src/types/equipment.ts`、`src/services/equipmentApi.ts`、`src/stores/equipment*.ts`、`src/components/equipment/*` |
| 棒球能力 / 體能測驗數據 | `jg-baseball-performance-data` | `src/services/performanceApi.ts`、`src/stores/performance.ts`、`src/components/performance/*` |
| 節日主題、全站動畫、節日推播 | `jg-baseball-holiday-theme` | `src/composables/useHolidayTheme.ts`、`HolidayThemeSettingsView.vue`、`notify-holiday-theme/*` |

若任務橫跨多個類型，先讀最直接命中的 skill，再讀安全邊界相關 skill。

## 3. 目錄與責任邊界

### `/src`

- `src/views/`：頁面級功能，每個檔案通常對應一個路由頁。
- `src/components/`：可重用 UI 與功能區塊；跨頁共用優先放這裡。
- `src/layouts/`：公開頁與登入後頁面骨架。
- `src/router/`：路由設定、登入檢查、feature-based guard。
- `src/stores/`：Pinia 狀態與跨頁資料，例如 auth、permissions、equipment、matches、performance。
- `src/services/`：Supabase / 外部服務存取封裝；新的資料存取優先放這裡。
- `src/composables/`：可重用 Vue 狀態邏輯，例如版本檢查、通知中心、節日主題。
- `src/utils/`：可測試純邏輯，例如同步 parser、推播 key、費用計算、裝備庫存。
- `src/types/`：集中型別定義。
- `src/style.css`：全域樣式、Tailwind layer、共用 page title / dialog 規則。

### `/supabase`

- `supabase/functions/`：Edge Functions。
- 根目錄 `supabase_*_migration.sql`：資料表、view、RLS、RPC、cron、storage policy 等 migration。
- 新資料庫變更優先新增 migration，不要任意覆寫既有 migration，除非確認尚未部署或任務明確要求。

### 其他

- `docs/PROJECT_LOGIC.md`：目前專案功能邏輯、資料流、主要資料表與 RPC 對照。
- `docs/FILE_MAP.md`：重要檔案地圖，協助 AI 快速定位該讀或該改的檔案。
- `.codex/skills/`：專案 AI workflow。
- `public/`：靜態資產；`public/version.json` 由 Vite plugin 維護，功能開發不手動改。
- `dist/`、`dev-dist/`：建置產物，預設不要編輯。
- `scripts/`：維運、修復、資產產生腳本。
- `check_db.ts`、`check_db2.ts`、`test_db.sql`：資料庫檢查或臨時驗證用，不是正式產品流程。
- `vite.config.ts`：Vite、PWA、legacy plugin、chunk 拆分、`versionUpdatePlugin()`。

## 4. 編輯原則

- 做最小必要修改，避免順手重構。
- 沿用原檔案命名、排版、資料流與元件拆分方式。
- UI 文案以繁體中文為主，語氣貼近現有系統。
- 頁面專屬邏輯留在 `views`；可重用 UI 放 `components`；可測試邏輯放 `utils` / `composables`；外部資料存取放 `services`。
- 新增或調整型別時同步更新 `src/types/*` 與實際資料 normalize 流程。
- 新增 route-level 頁面時，同步建立或更新該頁面的流程規則：至少更新 `AGENT.md`、`docs/PROJECT_LOGIC.md`、`docs/FILE_MAP.md`，若是新功能域或資料流複雜，還要新增 / 更新 `.codex/skills/<feature>/SKILL.md` 與 `AI_SKILLS.md`。
- 修改前確認是否有使用者尚未提交的變更；不得 revert unrelated changes。
- 不編輯 `dist/`、`dev-dist/`、`public/version.json`，除非任務就是建置輸出或 PWA 版本問題。

## 5. 目前 App 啟動與路由邏輯

- `src/main.ts` 建立 Vue app，掛載 Pinia、Vue Router、Vue Query、Element Plus zh-tw。
- `src/App.vue` 在 `onMounted` 呼叫 `authStore.ensureInitialized()`，初始化期間顯示全頁 loading；初始化後掛 `HolidayThemeSiteEffects` 與 `router-view`。
- `src/services/supabase.ts` 用 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 建立 Supabase client，並在 `visibilitychange` 時 stop/start auth auto refresh，避免手機休眠後 token 不刷新。
- Router 使用 `createWebHashHistory()`，這是為了相容舊版 WebView；沒有明確部署評估，不可改成 `createWebHistory()`。
- Router 有 dynamic import chunk load error fallback，會透過 `refreshAppShell()` 重新載入目前路徑；修改 router 時不要破壞這段。

### 公開路由

- `/`：`PublicLayout` + `LandingView`，公開首頁。
- `/push-entry`：公開推播入口頁。
- 公開頁不可直接查受保護 raw table；公開摘要走安全 RPC，例如 `get_public_landing_snapshot()`、`get_public_holiday_theme_config()`。

### 登入後路由

登入後頁面掛在 `MainLayout`，父層 `meta.requiresAuth = true`。

- 不需額外 feature 的登入頁：`/dashboard`、`/calendar`、`/profile`、`/my-payments`、`/equipment-addons`、`/my-leave-requests`。
- 需要 `meta.feature` 的後台頁：`leave_requests`、`players`、`users`、`join_inquiries`、`announcements`、`holiday_theme_settings`、`attendance`、`training`、`matches`、`fees`、`baseball_ability`、`physical_tests`、`equipment`。
- `baseball_ability` 與 `physical_tests` 有 `allowLinkedMemberView` 例外：有綁定球員者可唯讀自己的資料；管理權限者可看全隊。
- 無權限時導回 `/dashboard`。

## 6. Auth、權限與安全邊界

- 登入使用 magic link / OTP；登入前 email 檢查走 `can_request_magic_link()`，不可匿名直查 `profiles`。
- `src/stores/auth.ts` 負責 session、profile、last seen、role permissions hydration。
- `src/stores/permissions.ts` 從 `app_role_permissions` 讀取 feature/action；`ADMIN` 有前端 bypass。
- `permissionsStore.can()`、按鈕顯示、router guard 只算 UX 控制，不是資料安全邊界。
- 真正安全邊界在 DB RLS、policy、`security definer` RPC、Edge Function 驗證。
- 新增或調整 `feature/action` 時要同步三層：DB helper / RLS、前端 permission store / UI、AI 文件與 skill。
- 敏感欄位包含 `national_id`、`guardian_phone`、`contact_line_id`；展示名單預設走 `team_members_safe` 或安全 RPC。
- 只有確定流程需要完整個資，且 DB 與畫面權限一致時，才查 `team_members` raw table。

## 7. 目前功能邏輯地圖

### 公開首頁與入隊

- `LandingView` 透過 `src/services/publicLanding.ts` 呼叫 `get_public_landing_snapshot(p_today)` 顯示公開摘要。
- 入隊申請會寫入 `join_inquiries`；公開 insert 由 DB policy 控制。
- 公開頁若需要新增資料，只能拿非敏感摘要，不可直接擴散 profiles / team_members / leave_requests 等 raw table。

### 個人首頁與個人功能

- `HomeView` 同時有後台 dashboard 與個人化區塊；個人化摘要走 `src/services/myHome.ts` 的 `get_my_home_snapshot()`，RPC 未部署時顯示空狀態 fallback。
- `MyLeaveRequestsView` 走 `src/services/myLeaveRequests.ts`：`list_my_leave_members()`、`list_my_leave_requests()`、`create_my_leave_requests()`、`delete_my_leave_request()`。
- `MyPaymentsView` 走 `src/services/myPayments.ts`：`list_my_payment_members()`、`get_my_payment_records()`、`list_my_payment_submissions()`、`create_my_payment_submission()`、`get_my_payment_submission_estimate()`。
- `ProfileSettingsView` 透過 `update_my_profile_settings()` 更新個人設定，大頭照使用 `avatars` bucket。

### 後台大廳、公告與通知中心

- `MainLayout` 顯示桌機導覽、手機更多選單、底部行動導覽、通知中心、版本更新提示、節日橫幅。
- 通知中心優先走 `get_notification_feed()`；若 RPC 缺失，依 `useNotificationFeed` 的 fallback fetcher 邏輯處理。
- 公告管理在 `AnnouncementsView`，資料表為 `announcements`，附件 / 圖片目前使用 storage。

### 球員、使用者與權限

- 球員名單主要在 `PlayersView`，資料表為 `team_members`；同步邏輯與 dedupe 在 `src/utils/playerSync.ts`。
- 球員名單顯示經由 `src/stores/playerRoster.ts` 做 session 內記憶體快取；進頁先呼叫 `get_team_members_cache_meta()` 比對 `team_members` 的 `row_count` / `latest_changed_at`，有差異才重新抓完整名單。
- Google 表單 / Sheet 同步不得覆蓋既有 `team_members.is_primary_payer` 與 `team_members.is_half_price`；新增球員時兩者預設 `false`。
- 使用者管理在 `UsersView`，profile 新增 / 更新 / 刪除優先走 `admin_insert_profile()`、`admin_update_profile()`、`admin_delete_user()`。
- 權限 UI 在 `RolePermissionsManager.vue`，對應 `app_roles` 與 `app_role_permissions`。

### 請假與點名

- 家長 / 球員自己的請假走 `myLeaveRequests` RPC。
- 後台請假管理在 `LeaveRequestsView`，會讀 `team_members` 與 `leave_requests`，需受 `leave_requests` feature RLS 保護。
- 點名列表與點名頁使用 `attendance_events`、`attendance_records`，並會參照 `team_members`、`leave_requests`。
- 改到請假或點名時，要檢查通知中心、推播、今日缺席摘要與費用計算是否受影響。

### 賽事與 Google Calendar 同步

- 賽事資料表為 `matches`，主要 API 在 `src/services/matchesApi.ts`。
- `matchesApi` 保留 `google_calendar_event_id` 欄位缺失 / schema cache 尚未更新時的 fallback。
- Google Calendar / iCal parsing 與同步規劃在 `src/utils/googleCalendarParser.ts`，UI 在 `SyncCalendarDialog.vue`。
- 比賽紀錄相關元件在 `src/components/match-records/*`，照片使用 `matches-photos` bucket。

### 特訓報名與球員點數

- 特訓沿用 `matches.match_level = '特訓課'`，報名與點數資料集中在 `training_session_settings`、`training_registrations`、`player_point_transactions`、`training_no_show_blocks`。
- 前端頁面為 `/training`，分為個人報名、教練管理、點數管理；資料存取皆走 `src/services/trainingApi.ts` 封裝的 security definer RPC。
- `training` feature/actions：`VIEW / CREATE / EDIT / DELETE`；linked member 可進入 `/training` 看自己的點數與報名。教練管理與點數管理只給 `CREATE / EDIT / DELETE` 其中一種管理權限者，單純 `VIEW` 不顯示管理工具。
- 報名開關由 DB 端檢查手動狀態與時間窗；個人端不可直接寫 raw table。
- 教練可在沒有資料時建立特訓課與報名設定；新增特訓課預設上課時間 `09:00 - 11:00`、地點 `中港國小`，上課時間使用 Element Plus 時間範圍元件。
- 點數管理支援大量發放：可依全隊、角色、組別快速選取，並套用常用點數 / 原因 preset；送出仍只呼叫 `grant_player_points(uuid[], integer, text)`，不可直接寫 `player_point_transactions`。
- 特訓點名透過 `attendance_events.training_session_id` 串接；`缺席` 會建立下一場禁報，出席 / 請假會解除該次禁報。

### 收費與付款

- 收費後台在 `FeesView` 與 `src/components/fees/*`。
- 主要資料表包含 `fee_settings`、`monthly_fees`、`quarterly_fees`、`profile_payment_submissions`。
- 個人繳費回報走 `profile_payment_submissions` RPC；管理端審核在費用頁。
- sibling / quarter fee / monthly settlement 等邏輯已拆在 `src/utils/*fee*` 與相關測試。

### 裝備管理與加購

- 後台裝備管理路由 `/equipment`，feature key 為 `equipment`。
- 家長加購路由 `/equipment-addons`，只要求登入；資料安全由 `linked_team_member_ids` 與 DB RLS 限制，不要改成需要 `equipment:VIEW`。
- 裝備資料流集中在 `src/types/equipment.ts`、`src/services/equipmentApi.ts`、`src/stores/equipment*.ts`、`src/components/equipment/*`。
- 主要資料表包含 `equipment`、`equipment_transactions`、`equipment_inventory_adjustments`、`equipment_purchase_requests`、`equipment_purchase_request_items`、`equipment_payment_submissions`、`equipment_payment_submission_items`。
- 裝備流程：加購申請 `pending` -> 審核 `approved` -> 備貨 `ready_for_pickup` -> 領取 `picked_up` -> 裝備付款回報 `pending_review` -> 費用端確認 `approved` 或退回 `rejected`。
- 裝備圖片與處理照片使用 `equipments` bucket；主檔 / 備貨 / 領取照片可多張，並保留 `image_url`、`ready_image_url`、`pickup_image_url` 首圖相容欄位。
- 裝備交易 `purchase` 產生後才進入付款回報；不要把來源專案的 `fee_records` 或月結關帳模型直接搬進本專案。

### 棒球能力與體能測驗

- 後台路由：`/baseball-ability`、`/baseball-ability/:memberId`、`/physical-tests`、`/physical-tests/:memberId`。
- feature key：`baseball_ability`、`physical_tests`；actions：`VIEW / CREATE / EDIT / DELETE`。
- 資料表：`baseball_ability_records`、`physical_test_records`。
- 讀取預設走 `get_baseball_ability_records()`、`get_physical_test_records()`、`get_performance_member_options()`。
- 只有 `VIEW` 權限者與有 `profiles.linked_team_member_ids` 綁定的家長 / 球員，都只能唯讀自己的綁定球員資料。
- 具備對應 feature 的 `CREATE / EDIT / DELETE` 任一維護權限，才可讀取全隊資料與做維護。
- 新增、編輯、刪除必須依 DB RLS 檢查對應 feature/action，不可只靠前端按鈕隱藏。
- RPC 不得回傳 `national_id`、`guardian_phone`、`contact_line_id`。

### 節日主題

- 後台路由 `/holiday-theme-settings`，feature key `holiday_theme_settings`，actions `VIEW / EDIT`。
- 設定儲存在 `system_settings.key = 'holiday_theme_config'`，payload 為 v2 多活動格式，需保留 legacy single-theme config 轉換。
- 公開與未登入頁只能走 `get_public_holiday_theme_config()`。
- 後台儲存走 `save_holiday_theme_config(jsonb)`，DB 端需檢查 `holiday_theme_settings:EDIT`。
- 節日通知 feature/action 為 `holiday_theme:VIEW`。
- 全站套用點：`LandingView`、`HomeView`、`App.vue`、`PublicLayout`、`MainLayout`。

### 推播與 Web Push

- 前端派送入口統一走 `src/utils/pushNotifications.ts` 的 `dispatchPushNotification()`。
- Edge Function：`supabase/functions/send-push-notification/index.ts`；共用 helper 在 `supabase/functions/_shared/push.ts`。
- 訂閱資料表：`web_push_subscriptions`。
- 同一事件可能由表單、Realtime、重試或多入口觸發時，必須提供穩定 `eventKey`，由 `send-push-notification` 搭配 `push_dispatch_events` 去重。
- 收件對象以 `feature` + `action` 權限決定；`targetRoles` 只能縮小範圍，不可取代權限查詢。

### PWA、版本與更新

- `vite.config.ts` 內的 `versionUpdatePlugin()` 維護 `public/version.json`。
- `useVersionCheck()` 輪詢 `/version.json`，發現新版本後在 `PublicLayout` / `MainLayout` 顯示更新列。
- Router chunk 載入失敗會觸發 app shell refresh；修改 PWA、build 或 router 時要確認這條恢復路徑仍可用。

## 8. UI 與行動裝置規則

- 登入後 route-level 功能頁第一層標題統一使用 `src/components/common/AppPageHeader.vue`，不可在 view 內手寫 page title 結構。
- `AppPageHeader` 必須提供 Element Plus icon；標題旁的 badge / 計數放 `title-suffix` slot，返回按鈕放 `before` slot，右側操作放 `actions` slot。
- Page title 樣式由 `src/style.css` 的 `.app-page-header`、`.app-page-title`、`.app-page-title-icon`、`.app-page-subtitle` 統一控制。
- 預設 title 規格為 mobile `text-xl`、desktop `md:text-2xl`、`font-black`、`leading-tight`、`tracking-normal`、`text-slate-800`；title icon 是小型 inline 主色 icon。
- 不要在功能頁 page title 直接堆疊 `text-3xl`、`text-primary`、`tracking-tight`、`tracking-wider`、大型方框 icon、漸層 icon、手寫 SVG 或裝飾性 uppercase subtitle。
- 首頁 hero、公開 landing、卡片標題、section title、dialog title 可依情境保留自己的視覺層級。
- 全站頁面級或大區塊 loading 統一使用 `src/components/common/AppLoadingState.vue`，維持橘色 loading icon 搭配灰色文字；各頁只改 `text` 文案，不在 view 內手寫大型 spinner / loading 結構。
- 按鈕內 loading、表單提交中、`v-loading` 的局部遮罩、通知中心等小型互動狀態可依 Element Plus 原本模式處理。
- 全專案 `el-dialog` 在手機模式（`max-width: 639px`）預設滿版顯示；右上角關閉按鈕避開 `env(safe-area-inset-top/right)`，觸控區不得小於 44px。
- 若某 Dialog 必須非滿版，需在該元件註明原因並確認手機可操作性。
- 新增 Element Plus 按鈕盡量避免 `size="small"`，尤其是手機主要操作與裝備流程。

## 9. 資料庫與 migration 規則

- DB 權限 helper 以 `has_app_permission()`、`has_any_app_permission()` 等既有函式為基礎。
- 新增受保護資料表時要同步 RLS、policy、必要 RPC、前端 service/type、AI 文件。
- 公開資料讀取優先做成公開安全 RPC，只回傳必要且去敏感化欄位。
- 修改 `profiles`、`team_members`、付款、裝備、請假、推播等核心表時，先檢查是否已有後續 migration 覆寫同名 function / policy。
- Edge Function 不硬編碼 secret、service role key、cron authorization；使用環境變數或 DB setting。
- Storage bucket policy 要跟功能權限一致；例如 avatars、equipments、matches-photos 各自有不同使用情境。

## 10. 驗證矩陣

以 `package.json` 為準，本專案目前有：

- 開發：`pnpm dev`
- 建置：`pnpm build`
- 預覽：`pnpm preview`

依修改範圍選擇：

- 文件-only：`git diff --check`
- TypeScript / Vue：`pnpm exec vue-tsc --noEmit`
- 純 utils：`pnpm exec vitest run <target.test.ts>`
- UI 或整合風險高：`pnpm build`
- 裝備：`pnpm exec vitest run src/utils/equipmentInventory.test.ts src/utils/equipmentPricing.test.ts src/utils/equipmentRequestStatus.test.ts`
- 賽事同步：`pnpm exec vitest run src/utils/googleCalendarParser.test.ts src/services/matchesApi.test.ts`
- 球員同步：`pnpm exec vitest run src/utils/playerSync.test.ts`
- 推播工具：`pnpm exec vitest run src/utils/pushNotifications.test.ts`
- 節日主題：`pnpm exec vitest run src/composables/useHolidayTheme.test.ts src/utils/holidayMotionLayout.test.ts src/components/layout/__tests__/HolidayThemeRibbon.test.ts src/views/HolidayThemeSettingsView.test.ts supabase/functions/notify-holiday-theme/logic.test.ts`
- 能力 / 體測：至少 `pnpm exec vue-tsc --noEmit` 與 `pnpm build`，並人工檢查 ADMIN CRUD、linked member 唯讀、無權限導回、兩 feature 權限互不互通。

若因環境限制無法驗證，回報必須明確說明未跑哪個檢查與原因。

## 11. 回報規則

- 先講結論，再補細節。
- 使用繁體中文。
- 明確列出修改檔案、核心原因、驗證結果。
- 若發現規則與實作不一致，說出衝突位置與建議處理方式。
- 不把理想化流程寫成已存在現況；文件必須貼近實際 repo。

## 12. 本檔維護規則

- 這份文件是專案現況規則，不是抽象模板。
- 當路由、權限、資料流、migration、Edge Function、PWA 或重要 UI 規則改變時，要同步更新本檔、`docs/PROJECT_LOGIC.md`、`docs/FILE_MAP.md` 與對應 skill。
- 新增 route-level 頁面或功能域時，補上：路由、feature/action、主要檔案、資料表/RPC、RLS 邊界、資料流、UI 入口、驗證方式，並建立或更新對應 skill；沒有對應 skill 時要新增一份，或在回報中說明為何併入既有 skill。
- 若本檔變得過長，仍保留啟動流程、任務分類、安全邊界與功能地圖在本檔；細節可拆到 skill，但入口不能失去導航能力。
