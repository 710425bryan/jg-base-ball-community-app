# Project Logic

本文件整理 `jg-base-ball-community-app` 目前的功能邏輯與資料流，提供 Codex / AI 在開始改功能前快速建立上下文。

閱讀順序建議：

1. 先讀 `AGENTS.md`。
2. 要理解整體功能資料流時讀本檔。
3. 要定位檔案時讀 `docs/FILE_MAP.md`。
4. 涉及 DB 時讀 `docs/MIGRATIONS.md`；涉及 Edge Function / env 時讀 `docs/EDGE_FUNCTIONS.md`。
5. 真正修改前再讀對應 `.codex/skills/*/SKILL.md` 與任務相關程式碼。

## 1. 系統總覽

- 前端：Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus + Tailwind CSS。
- 後端：Supabase Auth、Database、Storage、Edge Functions。
- 使用者角色：`ADMIN`、`MANAGER`、`HEAD_COACH`、`COACH`、`MEMBER`、`PARENT` 等。
- 權限模型：前端以 `permissionsStore.can(feature, action)` 控制 UX；資料安全以 DB RLS / policy / RPC / Edge Function 驗證為準。
- 主要安全原則：公開頁讀公開安全 RPC，非敏感球員資料優先讀 `team_members_safe`，完整個資只在已確認 DB 權限時讀 `team_members`。

## 2. App 啟動流程

1. `src/main.ts` 建立 Vue app，掛載 Pinia、Router、Vue Query、Element Plus。
2. `src/App.vue` 呼叫 `authStore.ensureInitialized()` 初始化 auth。
3. `src/services/supabase.ts` 建立 Supabase client，並在 document visibility change 時控制 token auto refresh。
4. Router 使用 `createWebHashHistory()`，用於舊版 WebView 相容。
5. `MainLayout` / `PublicLayout` 掛版本更新提示與節日主題橫幅。

UI 約定：

- 登入後 route-level 功能頁第一層標題使用 `src/components/common/AppPageHeader.vue`。
- 每個功能頁 title 都提供 Element Plus 小型 inline icon；badge 用 `title-suffix`，返回按鈕用 `before`，右側操作用 `actions`。
- Page title 的字級、間距、icon 規格集中在 `src/style.css`；公開 landing、Dashboard hero、section title、card title、dialog title 不套用此限制。
- 頁面級或大區塊 loading 使用 `src/components/common/AppLoadingState.vue`，維持同一個橘色 loading icon + 灰色文字樣式，只更換顯示文案。

## 3. 路由與權限

公開路由：

- `/`：公開首頁，使用 `PublicLayout` + `LandingView`。
- `/push-entry`：公開推播入口。

登入後但不需額外 feature 的路由：

- `/dashboard`
- `/calendar`
- `/profile`
- `/my-records`
- `/my-payments`
- `/equipment-addons`
- `/my-leave-requests`

需要 `meta.feature` 的後台路由：

- `/leave-requests`：`leave_requests`
- `/players`：`players`
- `/users`：`users`
- `/join-inquiries`：`join_inquiries`
- `/announcements`：`announcements`
- `/holiday-theme-settings`：`holiday_theme_settings`
- `/attendance`、`/attendance/:id`：`attendance`
- `/training`：`training`，linked member 可看個人報名與點數，管理工具需 `CREATE / EDIT / DELETE`
- `/training-dates`：`training_dates`
- `/training-locations`：`training_locations`
- `/match-records`：`matches`
- `/fees`：`fees`
- `/equipment`：`equipment`
- `/vendors`：`vendors`
- `/baseball-ability`、`/baseball-ability/:memberId`：`baseball_ability`
- `/physical-tests`、`/physical-tests/:memberId`：`physical_tests`

特殊邏輯：

- `baseball_ability` / `physical_tests` 允許 linked member 唯讀自己綁定的球員資料。
- 無權限進入 feature 路由時導回 `/dashboard`。
- `dashboard`、`calendar` 目前登入即可看。

## 4. Auth 與 Profile

主要檔案：

- `src/stores/auth.ts`
- `src/stores/permissions.ts`
- `src/services/supabase.ts`

資料流：

1. Auth store 取得 session。
2. 讀取 `profiles` 取得目前使用者 profile。
3. 以 profile role 讀取 `app_role_permissions`。
4. 若 profile access state 不允許登入，立即 sign out。
5. 登入前 email 檢查走 `can_request_magic_link()` RPC。
6. `touch_profile_last_seen()` 用於更新最後上線時間。

重要規則：

- 不要在匿名情境直查 `profiles`。
- 不要把前端 permission check 當成資料安全。
- 修改 role / feature / action 時，要同步 DB、前端、文件與 skill。

## 5. 公開首頁與入隊

主要檔案：

- `src/views/LandingView.vue`
- `src/services/publicLanding.ts`
- `src/types/publicLanding.ts`

資料流：

- 公開摘要走 `get_public_landing_snapshot(p_today)`。
- 入隊申請寫入 `join_inquiries`，包含家長聯絡電話與可選填 Line ID；公開 insert 由 DB policy 控制。
- 節日主題公開設定走 `get_public_holiday_theme_config()`。

重要規則：

- 公開頁不可直接查 `profiles`、`team_members`、`leave_requests`、`matches` 等受保護 raw table。
- 公開資料只回必要且去敏感化欄位。

## 6. 個人首頁、請假與繳費

主要檔案：

- `src/views/HomeView.vue`
- `src/services/myHome.ts`
- `src/views/MyLeaveRequestsView.vue`
- `src/services/myLeaveRequests.ts`
- `src/views/MyPlayerRecordsView.vue`
- `src/services/myPlayerRecords.ts`
- `src/views/MyPaymentsView.vue`
- `src/services/myPayments.ts`

資料流：

- 個人化首頁摘要走 `get_my_home_snapshot(p_today)`，`MyHomeTodayPanel` 的 Next Up 僅顯示下一筆 `matches` 賽程，點名狀態固定留在「今日訓練點名狀態」區塊；點數欄位優先由 snapshot 的 `members[*]` 帶入，若線上 RPC 尚未更新則由 `list_my_training_members()` 補齊，只呈現自己的 linked member。
- 後台大廳的「今日訓練點名狀態」走 `get_dashboard_today_attendance_status(p_today)`，會列出今日所有點名單，只給具備 `leave_requests:VIEW` 的角色顯示。
- 我的假單：
  - `list_my_leave_members()`
  - `list_my_leave_requests(p_member_id)`
  - `create_my_leave_requests(p_member_id, p_records)`
  - `delete_my_leave_request(p_leave_request_id)`
  - 可新增假單的成員只包含有效 linked member；退隊、離隊、關閉 / 畢業成員不回傳，也不能透過 RPC 新增假單。
- 我的繳費：
  - `list_my_payment_members()`
  - `get_my_payment_records(p_member_id)`
  - `list_my_payment_submissions(p_member_id)`
  - `create_my_payment_submission(...)`
  - `get_my_payment_submission_estimate(...)`
- 我的成績：
  - `list_my_player_record_members()`
  - `get_my_player_match_records(p_member_id)`
  - 一般使用者只看 `profiles.linked_team_member_ids` 綁定球員；具 `players:VIEW` 者可切換全隊球員，但進頁預設仍選關聯球員。
  - 打擊 / 投球彙總沿用 `src/utils/matchRecordStats.ts`，以姓名 exact match 為主，打投成績可用背號 fallback。

重要規則：

- 個人功能依 `profiles.linked_team_member_ids` 與 DB RPC 控制可見資料。
- 不要在前端自行推導可讀取的其他家庭或球員資料。
- `/my-records` 的比賽詳情使用 readonly dialog；個人頁不得露出編輯 / 刪除比賽入口。

## 7. 球員、使用者與角色權限

主要檔案：

- `src/views/PlayersView.vue`
- `src/views/UsersView.vue`
- `src/components/RolePermissionsManager.vue`
- `src/stores/playerRoster.ts`
- `src/stores/teamGroups.ts`
- `src/services/playerRosterApi.ts`
- `src/services/teamGroupsApi.ts`
- `src/utils/playerSync.ts`
- `src/utils/profileAccess.ts`
- `src/utils/teamGroups.ts`
- `src/components/players/TeamGroupSettingsDialog.vue`

主要資料：

- `team_members`
- `team_members_safe`
- `profiles`
- `app_roles`
- `app_role_permissions`
- `team_group_settings`

資料流：

- 球員名單管理讀寫 `team_members`。
- 展示型名單或非敏感選項優先使用 `team_members_safe` 或安全 RPC。
- `status in ('退隊', '離隊')` 或 `is_inactive_or_graduated = true` 的成員視為非有效名單；比賽資料下載、後台大廳統計 / 今日請假名單、個人首頁、個人假單新增、後續繳費成員選單都不可再顯示或納入新一期計算。
- 球員名單顯示使用 session 內記憶體快取；進頁先呼叫 `get_team_members_cache_meta()` 比對 `row_count` / `latest_changed_at`，有差異才重新抓完整名單。
- `get_team_members_cache_meta()` 只回傳版本資訊，不回傳球員個資，且需通過 `players:VIEW`。
- 使用者新增 / 更新 / 刪除走 admin RPC，例如 `admin_insert_profile()`、`admin_update_profile()`、`admin_delete_user()`。
- 角色權限 UI 讀寫 `app_roles`、`app_role_permissions`。
- `team_members.joined_date` 記錄球員加入時間；既有名單無歷史資料時回填 `2026-02-01`，新建資料預設為台灣當天日期。
- team group 設定使用 `teamGroups` store 與 `teamGroupsApi`；新增、改名、排序、刪除轉移都要同步影響 `PlayersView`、`TrainingView`、`TrainingLocationsView`、`LeaveRequestsView`、`RollCallView` 的組別選項。
- 非 eligible role 不應保留 team group；刪除組別時要有轉移或清理策略。

同步規則：

- Google Form / Sheet 同步使用 `src/utils/playerSync.ts`。
- 既有球員同步不得覆蓋 `is_primary_payer`、`is_half_price` 與 `fee_billing_mode`。
- Google Form / Sheet 未提供加入時間來源時，不覆蓋既有 `joined_date`；新增球員交由 DB 預設台灣當天日期。
- 新增球員時主要繳費人 / 半價預設為 `false`，收費模式預設 `role_default`。
- dedupe key 空白時不可把多筆資料合併成同一人。

## 8. 請假與點名

主要檔案：

- `src/views/LeaveRequestsView.vue`
- `src/views/AttendanceListView.vue`
- `src/views/RollCallView.vue`
- `src/services/myLeaveRequests.ts`
- `src/services/dashboardAttendance.ts`
- `src/utils/leaveRequests.ts`
- `supabase/functions/leave-webhook/index.ts`

主要資料：

- `leave_requests`
- `attendance_events`
- `attendance_records`
- `team_members`

資料流：

- 後台請假管理讀寫 `leave_requests`。
- 後台新增假單的成員選單只列有效成員；退隊、離隊、關閉 / 畢業成員的既有假單可保留查詢，但不可再新增。
- 點名事件使用 `attendance_events`。
- 單場點名紀錄使用 `attendance_records`。
- 點名頁會參照球員名單與當日請假資料。
- 場地配置點名單透過 `attendance_events.training_location_session_id` / `training_location_session_venue_id` 連回場地配置；每個場地區塊各自一張點名單，名單只取該場地最新 assignments。
- 外部請假 webhook 會處理 member match、建立假單與通知，必須檢查 secret、payload normalize 與推播 target。
- 今日訓練點名摘要走 `get_dashboard_today_attendance_status()`，會回傳今日所有點名單與請假名單，只顯示給 `leave_requests:VIEW`。

重要規則：

- `/attendance/:id` 點名 Detail（`RollCallView`）不可顯示或提供 `缺席` 操作；Detail UI 只保留 `出席`、`請假` 等允許操作，既有缺席資料或禁報流程需另設明確管理流程。
- 改請假或點名要檢查通知中心、推播、今日缺席、費用統計是否受影響。
- 後台頁面顯示權限不能取代 DB policy。

## 9. 賽事與比賽紀錄

主要檔案：

- `src/views/CalendarView.vue`
- `src/views/MatchRecordsView.vue`
- `src/services/matchesApi.ts`
- `src/services/matchAudioApi.ts`
- `src/services/weatherApi.ts`
- `src/stores/matches.ts`
- `src/types/match.ts`
- `src/utils/googleCalendarParser.ts`
- `src/utils/matchRecordStats.ts`
- `src/utils/matchFieldEditor.ts`
- `src/utils/liveMatchScoreboard.ts`
- `src/utils/lineupPhotoParser.ts`
- `src/utils/matchAudioTranscription.ts`
- `src/utils/matchAudioDraftStore.ts`
- `src/utils/matchReminderNotification.ts`
- `src/components/match-records/*`
- `supabase/functions/parse-lineup/index.ts`
- `supabase/functions/transcribe-match-audio/index.ts`
- `supabase/functions/resolve-location/*`
- `supabase/functions/send-match-reminders/index.ts`

主要資料：

- `matches`
- `attendance_records`
- `team_members_safe`
- `location_geocoding_cache`
- Storage bucket：`matches-photos`

資料流：

- `matchesApi` 封裝 `matches` CRUD。
- Google Calendar / iCal parser 負責把外部日曆轉成 match payload；手動同步預覽優先走 `sync-match-calendar` Edge Function dry-run，瀏覽器第三方 CORS proxy 只作 fallback。
- 同步規劃維持 `create`、`update`、`skip` 三種結果。
- 比賽紀錄元件處理陣容、照片、出席統計、賽事細節與 live controller。
- `/calendar?match_id=...` 會開啟 `MatchDetailDialog`；推播與通知的比賽詳情 URL 統一導向這條路徑。
- 陣容照片解析會先在前端壓縮 / 轉 data URL，再呼叫 `parse-lineup`，AI 結果需要 normalize 與 unresolved flow。
- 比賽語音轉紀錄使用 IndexedDB 保存草稿與音檔 chunks，再呼叫 `transcribe-match-audio` 產生結構化事件。
- 天氣預報優先透過 `resolve-location` 解析場地座標，外部 API 失敗時回到前端 fallback。

重要規則：

- 保留 `google_calendar_event_id` 欄位缺失時的 fallback。
- 同步比對先用 `google_calendar_event_id`，再用日期 + 時間 + 標題 fallback。
- `parse-lineup` 與 `transcribe-match-audio` 使用 service role 時，必須先驗證 bearer user，再用 user scoped client 檢查 `matches:CREATE` 或 `matches:EDIT`。
- AI 不可把沒有在照片 / 語音中明確出現的球員硬塞進陣容或紀錄。

## 10. 特訓報名與球員點數

主要檔案：

- `src/views/TrainingView.vue`
- `src/services/trainingApi.ts`
- `src/types/training.ts`
- `src/utils/training.ts`
- `src/utils/trainingRegistrationNotification.ts`
- `src/views/RollCallView.vue`
- `supabase/functions/send-training-registration-notifications/index.ts`
- `supabase/functions/send-training-registration-status-notifications/index.ts`

主要資料：

- `matches`：`match_level = '特訓課'` 作為特訓活動主體
- `training_session_settings`
- `training_registrations`
- `player_point_transactions`
- `training_no_show_blocks`
- `attendance_events.training_session_id`
- `push_dispatch_events`：特訓報名開始 / 截止前一天、單筆報名 / 錄取狀態通知去重與通知中心來源

資料流：

- 家長 / 球員透過 `/training` 依 linked member 查看點數、點數紀錄、可報名特訓與自己的報名狀態；即使是管理者，在「我要報名」區塊也只顯示目前選取成員的點數紀錄。
- 教練在 `/training` 設定特訓報名時間窗、手動開關、自動錄取、名額與扣點數，並審核錄取 / 候補 / 未錄取；教練管理與點數管理只給 `training:CREATE / EDIT / DELETE` 任一管理權限者。
- 沒有特訓資料時，教練可在報名設定內新增特訓課與 settings；新增特訓課預設上課時間 `09:00 - 12:00`、地點 `中港國小`，上課時間使用 Element Plus 時間範圍元件，送出仍存成 `matches.match_time` 字串；`auto_select_enabled` 預設關閉，只影響開啟後的新報名。
- 報名開始時間到達且 `manual_status = 'open'` 時，`send-training-registration-notifications` 會建立 `training_registration_open:*` 事件，讓系統通知中心與 Web Push 同步收到「特訓課開放報名」通知；報名截止前 24 小時內若 `selected_count < capacity`（或不限名額），會建立 `training_registration_deadline:*` 事件再提醒一次。單筆報名成功後，前端呼叫 `send-training-registration-status-notifications`：`submitted` 通知 active `training:EDIT` 管理者，`selected` 只通知報名使用者，事件用 `target_user_id` / `target_member_ids` 限定通知中心可見範圍。教練在報名審核按下「公布名單」後，前端會呼叫 `send-training-selection-notifications`，建立 `training_selection_published:*` 事件並發送「特訓課錄取名單已公布」通知。
- 報名 RPC 會在 DB 端檢查 linked member、點數、禁報狀態、手動狀態與報名時間窗；若自動錄取開啟且名額未滿，直接建立 `selected` + `reserved`，滿額則保留 `applied` 待審。
- 錄取時保留點數；`process_training_session_automation()` 在上課當天對已錄取名單扣點，並用 idempotency key 避免重複扣。
- 點數管理支援快速發放：可一鍵選全隊、角色、組別，套用常用點數 / 原因 preset；真正寫入仍統一呼叫 `grant_player_points(uuid[], integer, text)`，以交易紀錄追加方式建立流水帳。
- 點數流水帳可由 `training:DELETE` 權限者刪除手動建立的誤發紀錄；刪除統一走 `delete_player_point_transactions(uuid[])`，系統扣點 / 關聯報名 / idempotency 紀錄不可刪，且刪除後餘額不得低於已保留點數。
- 特訓點名單由 `create_training_attendance_event()` 建立，只列錄取球員；後端缺席狀態會建立下一場特訓禁報，改成出席 / 請假會解除該次禁報，但 `/attendance/:id` Detail UI 不顯示或提供 `缺席` 操作。

重要規則：

- 個人端不直接寫入 training raw table，新增 / 取消報名走 security definer RPC。
- 一般成員或家長即使有 `training:VIEW`，也只看到個人報名 / 點數檢視，不可看到教練管理或點數發放工具。
- 錄取名單公布後，登入使用者只能看到非敏感名單欄位。
- 點數流水帳不可任意更新；加點、扣點、調整都新增 `player_point_transactions`，誤發刪除需走受權限與餘額檢查保護的 RPC。
- 特訓報名開始 / 截止前提醒與單筆報名 / 錄取通知都必須有穩定 event key；個別通知需帶 `target_user_id`，避免通知中心洩漏給非目標使用者。

## 11. 訓練日期設定

主要檔案：

- `src/views/TrainingDatesView.vue`
- `src/services/trainingDatesApi.ts`
- `src/utils/trainingMonthDates.ts`
- `src/utils/trainingDateNotification.ts`
- `supabase/functions/send-training-date-notifications/index.ts`

主要資料：

- `training_month_date_settings`
- `push_dispatch_events.target_user_id` / `target_member_ids`

資料流：

- 管理者在 `/training-dates` 選擇月份並勾選該月訓練日期；未設定月份預設為該月所有星期六。
- 個人首頁透過 `get_my_home_snapshot()` 的 `training_month_dates` 或 `get_training_month_dates()` fallback，一次顯示當月份全部訓練日期。
- `save_training_month_dates()` 只儲存日期與備註，不建立場地、不指派球員，也不取代 `/training-locations`。
- `training-month-date-defaults-daily` DB cron 於台灣時間每日 00:05 呼叫 `ensure_training_month_date_setting()`；換月後會自動建立當月預設週六設定，若該月已有設定則不覆蓋，且此自動建立流程不發通知。
- 日期新增或取消時，前端呼叫 `send-training-date-notifications`，通知綁定有效球員 / 校隊的有效使用者。

重要規則：

- `training_dates` feature/actions 為 `VIEW / EDIT`，預設只建立 `ADMIN` 權限。
- `get_training_month_dates()` 可供登入後個人首頁讀取非敏感日期；後台路由與儲存仍需 `training_dates` 權限。
- 訓練日期通知必須寫入 `push_dispatch_events.target_user_id` / `target_member_ids`，通知中心只能顯示自己的日期異動通知。

## 12. 場地與人員配置

主要檔案：

- `src/views/TrainingLocationsView.vue`
- `src/services/trainingLocationsApi.ts`
- `src/types/trainingLocation.ts`
- `src/utils/trainingLocationNotification.ts`
- `supabase/functions/send-training-location-notifications/index.ts`

主要資料：

- `training_venues`
- `training_location_sessions`
- `training_location_session_venues`
- `training_location_assignments`
- `attendance_events.training_location_session_id`
- `attendance_events.training_location_session_venue_id`
- `push_dispatch_events.target_user_id` / `target_member_ids`

資料流：

- 教練在 `/training-locations` 建立某天訓練配置，可設定多場地區塊；每個場地區塊可個別保存訓練標題、日期、開始 / 結束時間與備註，必要時可由前端同步共用設定。球員可用全隊、角色或 `team_group` 快速帶入，再拖曳或勾選微調。
- `save_training_location_session()` 會重建該訓練的場地與指派；DB 以 `(session_id, member_id)` 確保同一球員只在一個場地。
- `create_training_location_venue_attendance_event()` 會為單一場地區塊建立或重用一張點名單，並由 `sync_training_location_attendance_records()` 自動同步該場地最新配置球員。
- 個人首頁透過 `get_my_home_snapshot()` 的 `training_locations` 或 `list_my_week_training_locations()` fallback 顯示 linked member 本週場地；標題、日期與時間以場地區塊設定優先，未設定才回退 session 共用值，已請假時標示但不通知。
- `send-training-location-notifications` 每日台灣時間 20:10 檢查隔天已發布配置，也可由設定頁手動觸發；通知標題、日期與時間以場地區塊設定優先，同一使用者綁多名且同訓練資訊的球員時合併成一則通知。

重要規則：

- `training_locations` feature/actions 為 `VIEW / CREATE / EDIT / DELETE`，預設只建立 `ADMIN` 權限。
- 個人端只能看到自己的 linked member；管理端也只透過 security definer RPC 讀寫，不直接查 raw table。
- 建立場地配置點名單需 `training_locations:EDIT` + `attendance:CREATE`；點名頁查看與出席 / 請假操作仍依 `attendance` 權限。多場地配置需分別從各場地區塊建立 / 開啟點名單。
- 場地通知必須排除 `leave_requests.start_date <= training_date <= end_date` 的球員，且通知中心只能顯示 `target_user_id = auth.uid()` 的場地通知。

## 13. 收費與付款

主要檔案：

- `src/views/FeesView.vue`
- `src/components/fees/FeeSettings.vue`
- `src/components/fees/SchoolTeamFees.vue`
- `src/components/fees/QuarterlyFees.vue`
- `src/components/fees/QuarterlyFeeCompensationPanel.vue`
- `src/components/fees/ProfilePaymentSubmissionInbox.vue`
- `src/components/fees/PlayerBalanceManager.vue`
- `src/components/fees/MatchFeeManagementPanel.vue`
- `src/components/fees/MatchPaymentSubmissionInbox.vue`
- `src/components/fees/MyMatchFeesPanel.vue`
- `src/components/fees/FeeManagementReminderPanel.vue`
- `src/services/myPayments.ts`
- `src/services/playerBalances.ts`
- `src/services/quarterlyFeeCompensations.ts`
- `src/services/matchFees.ts`
- `src/services/feeManagementReminders.ts`
- `src/utils/memberBilling.ts`
- `src/utils/monthlyFeeSettlement.ts`
- `src/utils/quarterlyFeeFamilies.ts`
- `src/utils/quarterlyFeeCompensation.ts`
- `src/utils/playerBalance.ts`
- `src/utils/siblingGroups.ts`
- `supabase/functions/record-fee-remittance/index.ts`
- `scripts/google-form-remittance-apps-script.js`

主要資料：

- `fee_settings`
- `monthly_fees`
- `quarterly_fees`
- `quarterly_fee_compensation_items`
- `profile_payment_submissions`
- `player_balance_transactions`
- `match_fee_items`
- `match_payment_submissions`
- `match_payment_submission_items`

資料流：

- 後台費用頁管理月費、季費與付款回報審核。
- `team_members.fee_billing_mode = 'monthly_fixed'` 代表社區球員固定月繳：角色仍為 `球員`，但有效繳費模式為月繳；月費表採固定金額減手動扣減，季費表與家庭季費分組排除該球員。
- `team_members.fee_billing_mode = 'no_fee'` 代表球員 / 校隊不收費：不產生新的月費、季費與比賽費；切換前既有帳款與付款回報保留，裝備加購付款仍維持自費。
- 校隊計次月費的本月堂數由 `/training-dates` 的訓練日期設定天數自動帶入，月費頁不可手動改堂數；請假扣減只依所選月份統計假單日期，以球員 + 日期去重，不合併點名紀錄。
- 固定月繳預設金額存在 `fee_settings.monthly_fixed_fee`，正式月費紀錄會在 `monthly_fees.calculation_type` / `monthly_fees.fixed_monthly_fee` 保留當月計算方式與金額快照。
- 季費堂數不足補償依當月週六數與 `/training-dates` 訓練日期設定總天數計算；週五、週日或其他補課日都算一堂，設定天數達當月週六數即不補償。補償預設每日折抵為一般 500 元、半價 / 手足折扣 250 元，可在收費設定調整。系統只產生 `quarterly_fee_compensation_items` 待審核單，管理員核准後才以 `quarterly_compensation` source 寫入 `player_balance_transactions`。
- 個人付款回報由 `myPayments` RPC 建立，可選用球員餘額；一般繳費與裝備付款都在管理端確認時才正式扣餘額。
- 球員餘額以 `player_balance_transactions` 流水帳計算，管理員可手動調整，付款審核時可把溢繳轉入餘額。
- sibling / family grouping 與季費家庭金額計算在 utils。
- 比賽費由 `matches.match_fee_amount` 產生 `match_fee_items`，家長可在 `/my-payments` 合併回報，管理端在 `/fees` 審核。
- 費用提醒由 `get_fee_management_reminders()` 與 `get_notification_feed()` 整合進通知中心。
- Google Form 匯款資料走 `record-fee-remittance`，以 secret 驗證並建立付款 / 通知資料。

重要規則：

- 餘額屬於 `team_members`，不可扣成負數；家長只能看與使用自己綁定球員的餘額。
- 修改付款或費用要檢查 sibling、primary payer、half price、固定月繳與不收費排除規則。
- `list_my_payment_members()` 與前端 `/my-payments` 會排除退隊、離隊、關閉 / 畢業成員；月費、季費與費用設定頁也只用有效成員建立後續繳費名單。
- 裝備付款回報在 `/my-payments` 與 `/fees?tab=equipment` 整合，但不要混入一般月費資料模型。
- 比賽費付款回報在 UI 上可與一般付款合併，但資料模型仍使用 `match_payment_submissions`。

## 14. 裝備管理與加購

主要檔案：

- `src/views/EquipmentView.vue`
- `src/views/EquipmentAddonsView.vue`
- `src/types/equipment.ts`
- `src/services/equipmentApi.ts`
- `src/stores/equipment.ts`
- `src/stores/equipmentRequests.ts`
- `src/stores/equipmentPayments.ts`
- `src/components/equipment/*`
- `src/utils/equipmentInventory.ts`
- `src/utils/equipmentPricing.ts`
- `src/utils/equipmentRequestStatus.ts`

主要資料：

- `equipment`
- `equipment_transactions`
- `equipment_inventory_adjustments`
- `equipment_purchase_requests`
- `equipment_purchase_request_items`
- `equipment_payment_submissions`
- `equipment_payment_submission_items`
- Storage bucket：`equipments`
- 裝備主檔保留 `image_url` 作為首圖相容欄位，實際多圖清單使用 `image_urls`。
- 加購備貨 / 領取處理照片保留 `ready_image_url`、`pickup_image_url` 作為首圖相容欄位，實際多圖清單使用 `ready_image_urls`、`pickup_image_urls`。

流程：

1. 家長 / 管理端建立加購申請：`pending`。
2. 管理端審核：`approved` 或 `rejected`。
3. 備貨完成 / 可取貨：`ready_for_pickup`，此時即可在 `/my-payments` 回報裝備付款。
4. 領取裝備：`picked_up`，只代表實際取貨完成，不再作為付款回報前置條件。
5. 家長在 `/my-payments` 回報裝備付款，資料走 `equipment_payment_submissions`。
6. 管理端在 `/fees?tab=equipment` 審核付款回報：`approved` 或 `rejected`。

重要規則：

- `/equipment` 需要 `equipment:VIEW`。
- `/equipment-addons` 只要求登入，資料安全靠 `linked_team_member_ids` 與 DB RLS。
- 裝備付款可付範圍包含管理員新增購買項目，以及加購申請狀態為 `ready_for_pickup` 或 `picked_up` 且付款狀態仍為 `unpaid` 的 purchase transaction；前端可勾選狀態與 RPC 檢查必須一致。
- 裝備剩餘量顯示優先走 `list_equipments_with_inventory_snapshot()`，只回傳匿名化聚合庫存快照，避免一般會員因 RLS 看不到其他人的交易 / 已保留申請而高估可用量。
- 裝備圖片與處理照片可多張上傳，使用 `equipments` bucket，前端顯示需支援左右滑動。
- 不要把來源專案的 `fee_records` 或月結模型搬進本專案。

## 15. 廠商名單

主要檔案：

- `src/views/VendorsView.vue`
- `src/components/vendors/VendorFormDialog.vue`
- `src/components/vendors/VendorPhotoGallery.vue`
- `src/types/vendor.ts`
- `src/services/vendorsApi.ts`
- `src/stores/vendors.ts`
- `src/utils/vendors.ts`

主要資料：

- `vendors`
- `vendor_trade_categories`
- Storage bucket：`vendors`，private

資料流：

- 後台在 `/vendors` 管理採購相關廠商，feature key 為 `vendors`，actions 為 `VIEW / CREATE / EDIT / DELETE`。
- 列表預設表格檢視，也可切換卡片檢視；兩種檢視都依 `trade_category` 分組。列表使用 Supabase range 分頁，進頁載入第一頁，捲動接近底部才載入下一頁。
- 搜尋會比對廠商名稱、交易類別、聯絡人、電話、採購價備註、地址與官網；交易類別 filter 可縮小到單一類別，並重新從第一頁抓取。
- 新增 / 編輯廠商時會先確保 `vendor_trade_categories.name` 存在；使用者自行輸入的類別會保留為之後可選選項，刪除廠商不刪類別。
- 廠商照片可多張上傳，前端使用 `compressImage(file, 1600, 1200, 0.82, 900_000)` 壓縮後寫入 private `vendors` bucket；資料表保存 storage path，讀取列表時由 `vendorsApi` 產生短效 signed URL。

重要規則：

- 廠商名單獨立於裝備與收費，不複製 `equipment` 或 `fees` 權限。
- migration 只預設建立 `ADMIN` 的 `vendors` 權限列；其他角色由「角色與權限設定」手動開啟。
- 前端新增、編輯、刪除按鈕只做 UX 控制；`vendors`、`vendor_trade_categories` 與 `vendors` bucket 都必須由 RLS / storage policy 檢查 `vendors:*` 權限。
- 官網連結顯示前必須用 `normalizeExternalUrl()`；無效網址不產生外連。
- 採購價目前是自由文字 `purchase_price_note`，不參與金額計算、付款或排序。

## 16. 棒球能力與體能測驗

主要檔案：

- `src/views/BaseballAbilityView.vue`
- `src/views/BaseballAbilityDetailView.vue`
- `src/views/PhysicalTestsView.vue`
- `src/views/PhysicalTestsDetailView.vue`
- `src/components/performance/*`
- `src/services/performanceApi.ts`
- `src/stores/performance.ts`
- `src/types/performance.ts`
- `src/utils/performanceConfig.ts`

主要資料：

- `baseball_ability_records`
- `physical_test_records`
- `get_performance_member_options()`
- `get_baseball_ability_records()`
- `get_physical_test_records()`

權限：

- feature key：`baseball_ability`、`physical_tests`。
- actions：`VIEW / CREATE / EDIT / DELETE`。
- linked member 可唯讀自己的綁定球員。
- 有任一維護 action 的角色才可讀全隊與做 CRUD。

重要規則：

- RPC 不得回傳敏感欄位。
- 新增欄位需同步 table、RPC return shape、types、表單、列表、詳情頁與圖表設定。

## 17. 節日主題

主要檔案：

- `src/composables/useHolidayTheme.ts`
- `src/utils/holidayMotionLayout.ts`
- `src/views/HolidayThemeSettingsView.vue`
- `src/components/settings/HolidayThemePreviewStage.vue`
- `src/components/layout/HolidayThemeRibbon.vue`
- `src/components/layout/HolidayThemeSiteEffects.vue`
- `supabase/functions/notify-holiday-theme/*`

主要資料：

- `system_settings.key = 'holiday_theme_config'`
- `get_public_holiday_theme_config()`
- `save_holiday_theme_config(jsonb)`
- `get_holiday_theme_player_options()`

規則：

- payload 使用 v2 多活動格式，保留 legacy single-theme config 轉換。
- 公開頁只能走 public RPC。
- 後台儲存需 DB 檢查 `holiday_theme_settings:EDIT`。
- 自動通知 event key：`holiday_theme:auto:<activityId>:<scheduleStartAt>`。
- 手動補送 event key：`holiday_theme:manual:<activityId>:<requestKey>`。
- 節日通知 feature/action：`holiday_theme:VIEW`。

## 18. 推播與通知中心

主要檔案：

- `src/utils/pushNotifications.ts`
- `src/utils/pushDeepLink.ts`
- `src/composables/useNotificationFeed.ts`
- `src/components/PushSettingsDialog.vue`
- `public/push-sw.js`
- `supabase/functions/send-push-notification/index.ts`
- `supabase/functions/send-training-registration-notifications/index.ts`
- `supabase/functions/send-training-registration-status-notifications/index.ts`
- `supabase/functions/send-training-date-notifications/index.ts`
- `supabase/functions/send-training-location-notifications/index.ts`
- `supabase/functions/_shared/push.ts`

主要資料：

- `web_push_subscriptions`
- `push_dispatch_events`
- `get_notification_feed(p_limit, p_include_fee_reminders)`

資料流：

1. 前端以 `dispatchPushNotification()` 發送通知。
2. Edge Function 根據 `feature` + `action` 找可接收使用者。
3. `targetRoles` 或 `targetUserIds` 只能縮小收件範圍。
4. `eventKey` 進 `push_dispatch_events` 去重。
5. 過期 subscription 由 Edge Function 清理。
6. 通知中心透過 `get_notification_feed()` 匯整顯示。
7. 排程型通知如賽事提醒、特訓報名開始 / 截止前提醒、訓練日期異動、場地通知，使用專屬 Edge Function 建立 `push_dispatch_events` 並派送 Web Push；單筆特訓報名 / 錄取通知也使用專屬 Edge Function 寫入 targeted `push_dispatch_events`。
8. 使用者點擊 Web Push 時，`public/push-sw.js` 同步啟動 client 導向，並把 target 寫入 IndexedDB `jg-baseball-push-deeplink/pendingTargets/latest` 與 Cache Storage `jg-baseball-push-deeplink-cache`；前端用 `pushDeepLink.ts` 正規化、短時間重試 consume pending target 後交給 router，推播設定可查看最後一次 click 診斷。

重要規則：

- 不要把所有通知硬綁 `leave_requests`。
- 多入口可能重複觸發的事件一定要有穩定 `eventKey`。
- 賽事提醒 URL 統一使用 `/calendar?match_id=<id>`；舊 `/match-records?match_id=<id>` 必須正規化到 `/calendar`，由 `CalendarView` 開啟 `MatchDetailDialog`。
- 推播 click target 不可只靠 hash route、search param、IndexedDB 或 `postMessage`，避免 iOS PWA 關閉啟動時只開 root 或持久化延遲造成導向遺失。

## 19. PWA、版本與更新

主要檔案：

- `vite.config.ts`
- `public/version.json`
- `src/composables/useVersionCheck.ts`
- `src/utils/appUpdate.ts`
- `src/layouts/PublicLayout.vue`
- `src/layouts/MainLayout.vue`

資料流：

- Vite plugin 維護 `public/version.json`。
- `useVersionCheck()` 輪詢 `/version.json`。
- 發現新版本後顯示更新列，使用者點擊後刷新 app shell。
- Router dynamic import chunk load error 也會觸發 refresh。

重要規則：

- 一般功能開發不手動改 `public/version.json`。
- 修改 router / PWA / build 時要確認更新列與 chunk error recovery。

## 20. 維護本文件

下列情況需要同步更新本檔：

- 新增或移除路由。
- 新增 feature/action 或改權限行為。
- 新增資料表、RPC、Edge Function、Storage bucket。
- 新增 migration hotfix 或外部服務 env。
- 改公開頁資料來源。
- 改推播 event key 或收件規則。
- 改裝備、付款、請假、點名、球員同步等核心流程。
