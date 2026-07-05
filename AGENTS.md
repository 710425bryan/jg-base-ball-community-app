# AGENTS.md

本檔是 `jg-base-ball-community-app` 的 AI / Agent 工作入口。任何自動化代理、程式助手或協作型 AI 在閱讀、分析、修改本專案前，必須先讀本檔，再依任務讀對應 skill 與程式碼。

若其他提示或舊文件與本檔衝突，以本檔為準；若本檔與實際程式碼衝突，先相信程式碼現況，並在回報中指出文件需要更新。

## 0. 專案定位

- 專案名稱：`jg-base-ball-community-app`
- 產品定位：中港熊戰 / 中港國小社區棒球管理系統
- 主要使用者：管理員、經理、教練、家長、球員
- 前端技術：Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus + Tailwind CSS
- 後端服務：Supabase Auth / Database / Storage / Edge Functions
- 其他重點：PWA、Web Push、Google Sheet / Google Form 同步、Google Calendar / iCal 賽事同步、行動裝置與舊版 WebView 相容

## 1. Codex 啟動流程

每次開始任務，依序做：

1. 讀本檔 `AGENTS.md`。
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
| 球員名單、使用者、綁定球員、team group | `jg-baseball-roster-users-team-groups` | `PlayersView.vue`、`UsersView.vue`、`TeamGroupSettingsDialog.vue`、`src/stores/playerRoster.ts`、`src/stores/teamGroups.ts` |
| 球員名單、Google Form / Sheet 同步 | `jg-baseball-player-sync` | `src/utils/playerSync.ts`、`src/utils/playerSync.test.ts`、`PlayersView.vue` |
| 請假、點名、今日點名摘要 | `jg-baseball-leave-attendance` | `MyLeaveRequestsView.vue`、`LeaveRequestsView.vue`、`AttendanceListView.vue`、`RollCallView.vue`、`leave-webhook/*` |
| 推播、通知中心、eventKey、subscription | `jg-baseball-push-notifications` | `src/utils/pushNotifications.ts`、`supabase/functions/send-push-notification/*` |
| 賽事紀錄、陣容、照片、語音、天氣 | `jg-baseball-match-records-media` | `CalendarView.vue`、`MatchRecordsView.vue`、`src/services/matchesApi.ts`、`src/components/match-records/*` |
| Google Calendar / iCal 賽事同步 | `jg-baseball-match-calendar-sync` | `src/utils/googleCalendarParser.ts`、`src/services/matchesApi.ts`、`SyncCalendarDialog.vue` |
| 特訓報名、球員點數、特訓點名 | `jg-baseball-training` | `src/views/TrainingView.vue`、`src/services/trainingApi.ts`、`src/utils/training.ts`、`supabase_training_points_migration.sql` |
| 訓練項目、每月訓練日期、日期異動通知 | `jg-baseball-training-dates` | `src/views/TrainingProgramSettingsView.vue`、`src/views/TrainingDatesView.vue`、`src/services/trainingProgramsApi.ts`、`src/services/trainingDatesApi.ts`、`src/utils/trainingMonthDates.ts`、`supabase_training_dates_migration.sql` |
| 場地與人員配置 | `jg-baseball-training-locations` | `src/views/TrainingLocationsView.vue`、`src/services/trainingLocationsApi.ts`、`src/utils/trainingLocationNotification.ts`、`supabase_training_locations_migration.sql` |
| 教練排班表、教練上課日 | `jg-baseball-coach-schedules` | `src/views/CoachSchedulesView.vue`、`src/services/coachSchedulesApi.ts`、`src/utils/coachSchedules.ts`、`supabase_coach_schedules_migration.sql` |
| 收費、付款、球員餘額、比賽費、匯款匯入 | `jg-baseball-finance-payments` | `FeesView.vue`、`MyPaymentsView.vue`、`src/services/myPayments.ts`、`src/services/matchFees.ts`、`src/services/playerBalances.ts` |
| 裝備管理、加購、庫存、裝備付款 | `jg-baseball-equipment-management` | `src/types/equipment.ts`、`src/services/equipmentApi.ts`、`src/stores/equipment*.ts`、`src/components/equipment/*` |
| 廠商名單、交易類別、廠商照片 | `jg-baseball-vendors` | `src/views/VendorsView.vue`、`src/services/vendorsApi.ts`、`src/stores/vendors.ts`、`src/components/vendors/*` |
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
- `docs/MIGRATIONS.md`：migration / hotfix / repair 索引，修改 DB function / policy 前必讀。
- `docs/EDGE_FUNCTIONS.md`：Supabase Edge Functions、外部服務與環境變數索引。
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
- 新增、修改或刪除原始碼檔案時，必須同步新增或更新對應 unit test；每個被動到的 `views`、`components`、`stores`、`services`、`composables`、`utils`、Edge Function logic 檔案，都要有同名測試或明確被既有測試涵蓋。若是文件、純型別、migration、產物或其他不適合 unit test 的例外，回報時必須說明原因與替代驗證。
- 新增 route-level 頁面時，同步建立或更新該頁面的流程規則：至少更新 `AGENTS.md`、`docs/PROJECT_LOGIC.md`、`docs/FILE_MAP.md`，若是新功能域或資料流複雜，還要新增 / 更新 `.codex/skills/<feature>/SKILL.md` 與 `AI_SKILLS.md`。
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

- 不需額外 feature 的登入頁：`/dashboard`、`/calendar`、`/profile`、`/my-records`、`/my-payments`、`/equipment-addons`、`/my-leave-requests`。
- 需要 `meta.feature` 的後台頁：`leave_requests`、`players`、`users`、`join_inquiries`、`announcements`、`holiday_theme_settings`、`attendance`、`training`、`training_dates`（含 `/training-dates`、`/training-program-settings`）、`training_locations`、`coach_schedules`、`matches`、`fees`、`baseball_ability`、`physical_tests`、`equipment`、`vendors`。
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

- `HomeView` 同時有後台 dashboard 與個人化區塊；個人化摘要走 `src/services/myHome.ts` 的 `get_my_home_snapshot()`，RPC 未部署時顯示空狀態 fallback；`MyHomeTodayPanel` 會一次顯示當月份全部訓練日期，未設定月份預設為該月所有星期六；特訓點數卡只顯示目前選取 linked member 的 snapshot 點數欄位，若線上 snapshot 尚未帶點數欄位，前端會用 `list_my_training_members()` 補齊。
- `MyLeaveRequestsView` 走 `src/services/myLeaveRequests.ts`：`list_my_leave_members()`、`list_my_leave_requests()`、`create_my_leave_requests()`、`delete_my_leave_request()`。
- `MyPaymentsView` 走 `src/services/myPayments.ts`：`list_my_payment_members()`、`get_my_payment_records()`、`list_my_payment_submissions()`、`create_my_payment_submission()`、`get_my_payment_submission_estimate()`；一般繳費與裝備付款皆可使用 `player_balance_transactions` 計算出的球員餘額扣抵。
- `MyPlayerRecordsView` 走 `src/services/myPlayerRecords.ts`：`list_my_player_record_members()`、`get_my_player_match_records()`；一般使用者只能看綁定球員，具 `players:VIEW` 者可切換全隊球員但預設仍優先關聯球員。
- `ProfileSettingsView` 透過 `update_my_profile_settings()` 更新個人設定，大頭照使用 `avatars` bucket。

### 後台大廳、公告與通知中心

- `MainLayout` 顯示桌機導覽、手機更多選單、底部行動導覽、通知中心、版本更新提示、節日橫幅。
- `HomeView` 的「今日訓練點名狀態」走 `get_dashboard_today_attendance_status()`，會列出今日所有點名單並只顯示給 `leave_requests:VIEW` 使用者。
- 通知中心優先走 `get_notification_feed()`；若 RPC 缺失，依 `useNotificationFeed` 的 fallback fetcher 邏輯處理。
- 公告管理在 `AnnouncementsView`，資料表為 `announcements`，附件 / 圖片目前使用 storage。

### 球員、使用者與權限

- 球員名單主要在 `PlayersView`，資料表為 `team_members`；同步邏輯與 dedupe 在 `src/utils/playerSync.ts`。
- 球員名單顯示經由 `src/stores/playerRoster.ts` 做 session 內記憶體快取；進頁先呼叫 `get_team_members_cache_meta()` 比對 `team_members` 的 `row_count` / `latest_changed_at`，有差異才重新抓完整名單。
- team group 設定經由 `src/stores/teamGroups.ts`、`src/services/teamGroupsApi.ts` 與 `TeamGroupSettingsDialog.vue` 管理；改名、排序、刪除轉移時要檢查 `PlayersView`、`TrainingView`、`TrainingLocationsView`、`LeaveRequestsView`、`RollCallView` 的分組選項。
- Google 表單 / Sheet 同步不得覆蓋既有 `team_members.is_primary_payer`、`team_members.is_half_price` 與 `team_members.fee_billing_mode`；新增球員時前兩者預設 `false`，收費模式預設 `role_default`。
- 使用者管理在 `UsersView`，profile 新增 / 更新 / 刪除優先走 `admin_insert_profile()`、`admin_update_profile()`、`admin_delete_user()`。
- 權限 UI 在 `RolePermissionsManager.vue`，對應 `app_roles` 與 `app_role_permissions`。

### 請假與點名

- 家長 / 球員自己的請假走 `myLeaveRequests` RPC。
- 後台請假管理在 `LeaveRequestsView`，會讀 `team_members` 與 `leave_requests`，需受 `leave_requests` feature RLS 保護。
- 點名列表與點名頁使用 `attendance_events`、`attendance_records`，並會參照 `team_members`、`leave_requests`。
- 場地配置建立的點名單透過 `attendance_events.training_location_session_id` / `training_location_session_venue_id` 串接；每個場地可各自建立一張點名單，`RollCallView` 名單只取該場地最新 `training_location_assignments`，不回退成全隊名單。
- 外部請假 webhook 在 `supabase/functions/leave-webhook/index.ts`，改動時要檢查 secret、member match、假單 RPC 與推播 target。
- `/attendance/:id` 點名 Detail（`RollCallView`）不可顯示或提供 `缺席` 操作；Detail UI 只保留 `出席`、`請假` 等允許操作，若需處理既有缺席資料或禁報流程，必須另設明確管理流程，不可直接把 `缺席` 按鈕放回 Detail。
- 改到請假或點名時，要檢查通知中心、推播、今日缺席摘要與費用計算是否受影響。

### 賽事與 Google Calendar 同步

- 賽事資料表為 `matches`，主要 API 在 `src/services/matchesApi.ts`。
- `/calendar` 是登入後賽程入口，`?match_id=` 會開啟 `MatchDetailDialog`；推播與通知連結應導向 `/calendar?match_id=...`。
- 個人成績頁 `/my-records` 不直接使用後台 `matchesApi` 讀列表，而是透過 `myPlayerRecords` RPC 依球員可見範圍取回比賽紀錄；打擊 / 投球彙總邏輯在 `src/utils/matchRecordStats.ts`。
- `matchesApi` 保留 `google_calendar_event_id` 欄位缺失 / schema cache 尚未更新時的 fallback。
- Google Calendar / iCal parsing 與同步規劃在 `src/utils/googleCalendarParser.ts`，UI 在 `SyncCalendarDialog.vue`。
- 比賽紀錄相關元件在 `src/components/match-records/*`，照片使用 `matches-photos` bucket。
- `/match-records` 的「未來賽事」可由具 `matches:EDIT` 的使用者手動發送單場賽事通知；「提醒排程」同樣只給 `matches:EDIT` 使用者管理，設定存在 `system_settings.match_reminder_schedule_config`，前端走 `src/services/matchReminderNotifications.ts` 呼叫 RPC 或 `send-match-reminders`，通知 URL 仍使用 `/calendar?match_id=...`；排程健康檢查由 `get_match_reminder_health_status()` 與 `send-match-reminders` 自動檢查，異常只通知 active `ADMIN`。
- 陣容照片解析走 `src/utils/lineupPhotoParser.ts` 與 `supabase/functions/parse-lineup/index.ts`；比賽語音轉紀錄走 `MatchAudioRecorder`、`src/services/matchAudioApi.ts`、`src/utils/matchAudioTranscription.ts` 與 `supabase/functions/transcribe-match-audio/index.ts`。
- 賽事天氣走 `src/services/weatherApi.ts`，地點解析優先透過 `supabase/functions/resolve-location`，失敗時保留前端 fallback。

### 特訓報名與球員點數

- 特訓沿用 `matches.match_level = '特訓課'`，報名與點數資料集中在 `training_session_settings`、`training_registrations`、`player_point_transactions`、`training_no_show_blocks`。
- 前端頁面為 `/training`，分為個人報名、教練管理、點數管理；資料存取皆走 `src/services/trainingApi.ts` 封裝的 security definer RPC。
- `training` feature/actions：`VIEW / CREATE / EDIT / DELETE`；linked member 可進入 `/training` 看自己的點數與報名。教練管理與點數管理只給 `CREATE / EDIT / DELETE` 其中一種管理權限者，單純 `VIEW` 不顯示管理工具。
- 報名開關由 DB 端檢查手動狀態與時間窗；個人端不可直接寫 raw table。`training_session_settings.auto_select_enabled` 只影響開啟後的新報名：名額未滿且點數足夠時 DB 端直接錄取並保留點數，滿額時仍維持待審。
- 教練可在沒有資料時建立特訓課與報名設定；新增特訓課預設上課時間 `09:00 - 12:00`、地點 `中港國小`，上課時間使用 Element Plus 時間範圍元件。
- 報名開始時間到達且狀態為開放時，由 `send-training-registration-notifications` 排程檢查發送「特訓課開放報名」通知；報名截止前 24 小時內若還有錄取名額，會再發送一次「特訓課報名即將截止」通知；公布錄取名單時由 `send-training-selection-notifications` 發送「特訓課錄取名單已公布」通知；單筆報名 / 錄取狀態由 `send-training-registration-status-notifications` 發送，報名完成只通知 `training:EDIT` 管理者，錄取只通知報名使用者；事件寫入 `push_dispatch_events` 供通知中心顯示，同時發送 Web Push。
- 點數管理支援大量發放：可依全隊、角色、組別快速選取，並套用常用點數 / 原因 preset；送出仍只呼叫 `grant_player_points(uuid[], integer, text)`，不可直接寫 `player_point_transactions`。
- 特訓點名透過 `attendance_events.training_session_id` 串接；後端缺席狀態會建立下一場禁報，出席 / 請假會解除該次禁報，但 `/attendance/:id` Detail UI 不顯示或提供 `缺席` 操作。

### 場地與人員配置

- 後台路由 `/training-program-settings` 與 `/training-dates`，feature key 為 `training_dates`，actions：`VIEW / EDIT`；訓練項目設定使用 `training_program_settings`，只保存 program 名稱、對應 `team_group`、預設星期 / 時間 / 場地與啟用狀態。
- `role = 校隊` 保持不變；中港 / 新泰身分存於 `team_members.training_program`，`team_group` 只作所屬群組（熊隊）使用。舊資料若沒有 `training_program`，才 fallback 用 `team_group` 對應 `training_program_settings.team_group`；仍找不到時校隊與計次月費 fallback 到中港校隊。
- 資料表為 `training_month_date_settings`；`program_key` 與 `month_start` 共同決定每個 program 的月份設定。未設定月份由 `get_training_month_dates(p_month, p_program_key)` 依訓練項目預設星期產生。
- 後台儲存走 `save_training_month_dates()`，只管理該 program 日期，不取代 `/training-locations` 的場地與人員配置。
- DB 排程 `training-month-date-defaults-daily` 於台灣時間每日 00:05 呼叫 `ensure_training_month_date_setting()`；每月 1 日會自動建立預設設定，已存在設定時不覆蓋，也不發送通知。
- 日期有新增或取消時，`send-training-date-notifications` 只通知該 program 綁定有效球員 / 校隊的家長與球員；通知中心只顯示 `target_user_id = auth.uid()` 的訓練日期通知。
- 後台路由 `/training-locations`，feature key 為 `training_locations`，actions：`VIEW / CREATE / EDIT / DELETE`。
- 資料表為 `training_venues`、`training_location_sessions`、`training_location_session_venues`、`training_location_assignments`；前端一律走 `src/services/trainingLocationsApi.ts` 封裝的 security definer RPC。
- 設定頁可建立某天訓練的多場地區塊，先選訓練 program；新增配置會套用 `training_program_settings` 的預設時間與場地，球員池與全隊快捷加入列出全部有效球員 / 校隊，再手動拖曳 / 勾選微調；program 只決定配置主檔、預設場地時間與通知語意，不限制可編排球員；同一訓練同一球員只能被配置到一個場地。
- 場地配置的每個場地區塊可各自建立一張連動點名單；建立需 `training_locations:EDIT` + `attendance:CREATE`，開啟與操作仍走既有 `attendance:VIEW / EDIT / DELETE`。配置儲存後若場地已有連動點名單，DB 會同步該場地最新球員名單，移除已不在該場地內的點名紀錄。
- 個人首頁透過 `get_my_home_snapshot()` 或 `list_my_week_training_locations()` 顯示 linked member 本週訓練場地；已請假球員仍可看到配置，但只有假單時段與場地訓練時間重疊才標示已請假。場地沒有開始 / 結束時間時，請假判斷使用上午區段 `09:00 - 12:00`；若場地使用預設上午時間 `09:00 - 12:30`，假單判斷仍收斂為上午區段，所以下午假不標示上午場地已請假。
- `send-training-location-notifications` 於台灣時間前一天 20:10 或手動觸發，僅通知該球員綁定的有效使用者，且排除假單時段與該場地訓練時間重疊的球員；場地無時間或預設上午時間時同樣以上午區段判斷，下午假不排除上午場地通知；通知事件寫入 `push_dispatch_events.target_user_id` / `target_member_ids`，通知中心只顯示自己的場地通知。

### 教練排班表

- 後台路由 `/coach-schedules`，feature key 為 `coach_schedules`，actions：`VIEW / CREATE / EDIT / DELETE`。
- 資料表為 `coach_schedule_events`、`coach_schedule_assignments`；排班對象綁定 `profiles.id`，候選教練只列 active 且可登入期間內的 `HEAD_COACH`、`COACH`。
- 候選活動由 `list_coach_schedule_admin_month()` 產生：場地配置區塊優先，其次 `/training-dates` 的訓練日期；同月 `matches.match_level = '特訓課'` 顯示特訓，其餘 `matches` 顯示比賽。
- 已儲存的場地訓練排班只保留教練指派與排班備註；日期、時間、標題、地點與地圖連結需跟著 `training_location_session_venues` / `training_location_sessions` 同步。
- `/training-dates` 只決定訓練日；教練上課日與指派在 `/coach-schedules` 設定，並可由訓練日期設定頁帶同月份跳轉。
- Dashboard 走 `list_coach_schedule_dashboard()`；具 `coach_schedules:VIEW` 者看全體教練排班，`HEAD_COACH` / `COACH` 只看自己被指派的排班，一般使用者不顯示。
- `matches.coaches` 只作比賽原始教練文字參考，不作個人權限或 Dashboard 可見性判斷。

### 收費與付款

- 收費後台在 `FeesView` 與 `src/components/fees/*`。
- 主要資料表包含 `fee_settings`、`monthly_fees`、`quarterly_fees`、`profile_payment_submissions`。
- 個人繳費回報走 `profile_payment_submissions` RPC；管理端審核在費用頁。
- 球員餘額以 `player_balance_transactions` 流水帳管理，餘額屬於 `team_members`；管理員可手動調整與確認溢繳入帳，家長自助使用餘額後仍需管理端確認才正式扣款。
- 社區球員固定月繳用 `team_members.fee_billing_mode = 'monthly_fixed'` 表示；球員身分仍是 `球員`，但併入 `monthly_fees`、排除 `quarterly_fees`，金額從 `fee_settings.monthly_fixed_fee` 帶入並在 `monthly_fees.fixed_monthly_fee` 留快照。
- 球員計次月費用 `team_members.fee_billing_mode = 'monthly_per_session'` 表示；球員身分仍是 `球員`，但隊費併入 `monthly_fees`、排除 `quarterly_fees`，堂數 / 請假 / 單次金額公式與校隊計次月費相同。
- 校隊與球員計次月費的請假扣減只統計落在訓練日期內且時段為全日 / 上午的假單日期；下午假不扣計次月費。
- 球員 / 校隊不收費用 `team_members.fee_billing_mode = 'no_fee'` 表示；不產生新的月費、季費與比賽費，切換前既有帳款保留，裝備加購付款仍維持自費。
- 月繳付款回報開放期別依 `monthly_fees.calculation_type` / 有效收費模式判斷：校隊與球員計次月費只開放已結束月份，避免本月堂數與請假還沒完整就提前收費；球員固定月繳 `monthly_fixed` 每月 25 日起開放下個月。前端 helper、RPC / DB trigger 與文件規則必須同步。
- 季繳球員付款回報以台灣日期判斷開放期別：每季最後一個月 25 日起開放下一季，開放前不可新增未來季付款回報；過去未繳季度仍可補繳。
- 裝備付款在加購申請 `approved` 後即可回報，費用端確認收款只代表款項已完成，不代表商品已備貨或已領取；若要刪除已收款測試請購，必須先走退款 / 作廢收款，並反向處理球員餘額。
- 季費堂數不足補償以當月週六數對比 `/training-dates` 訓練日期設定總天數；任何設定日期都算一堂，達當月週六數就不補償。補償先產生 `quarterly_fee_compensation_items` 待審核單，核准後才用 `quarterly_compensation` source 寫入 `player_balance_transactions`。
- sibling / quarter fee / monthly settlement 等邏輯已拆在 `src/utils/*fee*` 與相關測試。
- 手足主要繳費人退隊、離隊或關閉 / 畢業後，剩餘有效手足的新一期月費 / 季費試算不得沿用手足半價；主要繳費人恢復有效後，若 `sibling_ids` 與 `is_primary_payer` 仍保留，另一位有效手足可恢復手足減免。既有已保存帳款金額不自動覆寫，需由管理端重算或手動調整。
- 比賽費走 `src/services/matchFees.ts`、`match_fee_items`、`match_payment_submissions`、`match_payment_submission_items`，可在 `/my-payments` 合併回報，在 `/fees` 審核。
- 匯款表單匯入走 `supabase/functions/record-fee-remittance/index.ts` 與 `scripts/google-form-remittance-apps-script.js`，不得硬編碼 secret。
- 費用提醒走 `src/services/feeManagementReminders.ts` 與 `supabase_fee_management_reminders_migration.sql`，改提醒時要檢查通知中心 `get_notification_feed()`。

### 裝備管理與加購

- 後台裝備管理路由 `/equipment`，feature key 為 `equipment`。
- 家長加購路由 `/equipment-addons`，只要求登入；資料安全由 `linked_team_member_ids` 與 DB RLS 限制，不要改成需要 `equipment:VIEW`。
- 裝備資料流集中在 `src/types/equipment.ts`、`src/services/equipmentApi.ts`、`src/stores/equipment*.ts`、`src/components/equipment/*`。
- 主要資料表包含 `equipment`、`equipment_transactions`、`equipment_inventory_adjustments`、`equipment_purchase_requests`、`equipment_purchase_request_items`、`equipment_payment_submissions`、`equipment_payment_submission_items`。
- 裝備流程：加購申請 `pending` -> 審核 `approved` 後即可進行裝備付款回報 `pending_review`；備貨 / 可取貨 `ready_for_pickup` 與領取 `picked_up` 是後續履約狀態，不作為付款回報前置條件；費用端確認付款後為 `approved` / 已收款完成，也可退回 `rejected`，已收款測試或取消需求需改走 `refunded` 退款 / 作廢收款流程。
- 裝備圖片與處理照片使用 `equipments` bucket；主檔 / 備貨 / 領取照片可多張，並保留 `image_url`、`ready_image_url`、`pickup_image_url` 首圖相容欄位。
- 裝備交易 `purchase` 產生後才進入付款回報；不要把來源專案的 `fee_records` 或月結關帳模型直接搬進本專案。

### 廠商名單

- 後台廠商名單路由 `/vendors`，feature key 為 `vendors`，actions：`VIEW / CREATE / EDIT / DELETE`。
- 廠商資料流集中在 `src/types/vendor.ts`、`src/services/vendorsApi.ts`、`src/stores/vendors.ts`、`src/utils/vendors.ts`、`src/views/VendorsView.vue` 與 `src/components/vendors/*`。
- 主要資料表包含 `vendors` 與 `vendor_trade_categories`；交易類別是獨立資料表，自行輸入後保留為下次可選選項，刪除廠商不刪交易類別。
- 廠商照片使用 private `vendors` bucket，資料表只保存 storage path；前端上傳前先壓縮，讀取時由 `vendorsApi` 產生 signed URL。
- 列表預設表格模式，也支援卡片模式；兩種模式都依交易類別分組，並支援搜尋與交易類別 filter。列表資料走分頁，進頁先抓第一頁，捲動接近底部才抓下一頁。
- 廠商名單獨立於裝備與收費，不複製 `equipment` 或 `fees` 權限；新增角色權限時由「角色與權限設定」手動開啟。
- 新增、編輯、刪除按鈕由 `vendors:CREATE / EDIT / DELETE` 控制；資料安全仍必須由 DB RLS 與 storage policy 檢查。

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
- Edge Function：`supabase/functions/send-push-notification/index.ts`；排程型通知可用專屬 Edge Function，例如 `send-match-reminders`、`send-training-registration-notifications`；共用 helper 在 `supabase/functions/_shared/push.ts`。
- 訂閱資料表：`web_push_subscriptions`。
- 同一事件可能由表單、Realtime、重試或多入口觸發時，必須提供穩定 `eventKey`，由 `send-push-notification` 搭配 `push_dispatch_events` 去重。
- 收件對象以 `feature` + `action` 權限決定；`targetRoles` 只能縮小範圍，不可取代權限查詢。
- 通知點擊導向必須同時考慮 iOS PWA 與已開啟 client：`public/push-sw.js` 在 `notificationclick` 需同步啟動 client 導向，並把 target 寫入 IndexedDB `jg-baseball-push-deeplink/pendingTargets/latest` 與 Cache Storage `jg-baseball-push-deeplink-cache`；前端用 `src/utils/pushDeepLink.ts` 正規化、短時間重試 consume pending target，並保留推播設定診斷，避免只靠單一 hash、search、IndexedDB 或 `postMessage` deep link。
- 賽事提醒與舊 `/match-records?match_id=...` 通知點擊，必須正規化到 `/calendar?match_id=...`，讓「賽程與行事曆」開啟 `MatchDetailDialog`；新增比賽通知 URL 不要再直接指向 `/match-records`。

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
- 修改 migration 前讀 `docs/MIGRATIONS.md`，並用 `rg` 搜尋同名 table / function / policy 的所有後續 hotfix。
- Edge Function 不硬編碼 secret、service role key、cron authorization；使用環境變數或 DB setting。
- 修改 Edge Function 或外部 API 前讀 `docs/EDGE_FUNCTIONS.md`，確認所需 env、auth 模式與對應 skill。
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
- 新增 / 修改 / 刪除原始碼：同步新增或更新對應 unit test；檔案調整完成後必須實際跑最貼近的 `pnpm exec vitest run <target.test.ts>`，不可只口頭說明應該跑。刪除原始碼時同步移除或調整相關測試，確認沒有 stale import。
- UI 或整合風險高：`pnpm build`
- 裝備：`pnpm exec vitest run src/utils/equipmentInventory.test.ts src/utils/equipmentPricing.test.ts src/utils/equipmentRequestStatus.test.ts`
- 賽事同步：`pnpm exec vitest run src/utils/googleCalendarParser.test.ts src/services/matchesApi.test.ts`
- 賽事紀錄 / 媒體：`pnpm exec vitest run src/services/matchesApi.test.ts src/utils/matchFieldEditor.test.ts src/utils/liveMatchScoreboard.test.ts src/utils/matchAudioTranscription.test.ts src/utils/lineupPhotoParser.test.ts src/services/weatherApi.test.ts`
- 收費 / 付款：`pnpm exec vitest run src/utils/memberBilling.test.ts src/utils/monthlyPaymentPeriods.test.ts src/utils/monthlyFeeSettlement.test.ts src/utils/quarterlyFeeFamilies.test.ts src/utils/quarterlyFeeCompensation.test.ts src/utils/playerBalance.test.ts src/utils/feeManagementReminders.test.ts`
- 請假 / 點名：`pnpm exec vitest run src/utils/leaveRequests.test.ts src/utils/dashboardHome.test.ts`
- 訓練日期設定：`pnpm exec vitest run src/utils/trainingMonthDates.test.ts src/components/home/MyHomeTodayPanel.test.ts src/composables/useNotificationFeed.test.ts`
- 教練排班表：`pnpm exec vitest run src/utils/coachSchedules.test.ts src/views/HomeView.test.ts`
- 名單 / 使用者 / 組別：`pnpm exec vitest run src/utils/playerSync.test.ts src/stores/playerRoster.test.ts src/stores/teamGroups.test.ts src/utils/profileAccess.test.ts`
- 球員同步：`pnpm exec vitest run src/utils/playerSync.test.ts`
- 廠商名單：`pnpm exec vitest run src/utils/vendors.test.ts`
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
