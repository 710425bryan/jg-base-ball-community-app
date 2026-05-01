# Project Logic

本文件整理 `jg-base-ball-community-app` 目前的功能邏輯與資料流，提供 Codex / AI 在開始改功能前快速建立上下文。

閱讀順序建議：

1. 先讀 `AGENT.md`。
2. 要理解整體功能資料流時讀本檔。
3. 要定位檔案時讀 `docs/FILE_MAP.md`。
4. 真正修改前再讀對應 `.codex/skills/*/SKILL.md` 與任務相關程式碼。

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
- `/match-records`：`matches`
- `/fees`：`fees`
- `/equipment`：`equipment`
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
- 入隊申請寫入 `join_inquiries`，公開 insert 由 DB policy 控制。
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

- 個人化首頁摘要走 `get_my_home_snapshot(p_today)`。
- 後台大廳的「今日訓練點名狀態」走 `get_dashboard_today_attendance_status(p_today)`，只給具備 `leave_requests:VIEW` 的角色顯示。
- 我的假單：
  - `list_my_leave_members()`
  - `list_my_leave_requests(p_member_id)`
  - `create_my_leave_requests(p_member_id, p_records)`
  - `delete_my_leave_request(p_leave_request_id)`
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
- `src/services/playerRosterApi.ts`
- `src/utils/playerSync.ts`
- `src/utils/profileAccess.ts`

主要資料：

- `team_members`
- `team_members_safe`
- `profiles`
- `app_roles`
- `app_role_permissions`

資料流：

- 球員名單管理讀寫 `team_members`。
- 展示型名單或非敏感選項優先使用 `team_members_safe` 或安全 RPC。
- 球員名單顯示使用 session 內記憶體快取；進頁先呼叫 `get_team_members_cache_meta()` 比對 `row_count` / `latest_changed_at`，有差異才重新抓完整名單。
- `get_team_members_cache_meta()` 只回傳版本資訊，不回傳球員個資，且需通過 `players:VIEW`。
- 使用者新增 / 更新 / 刪除走 admin RPC，例如 `admin_insert_profile()`、`admin_update_profile()`、`admin_delete_user()`。
- 角色權限 UI 讀寫 `app_roles`、`app_role_permissions`。

同步規則：

- Google Form / Sheet 同步使用 `src/utils/playerSync.ts`。
- 既有球員同步不得覆蓋 `is_primary_payer`、`is_half_price` 與 `fee_billing_mode`。
- 新增球員時主要繳費人 / 半價預設為 `false`，收費模式預設 `role_default`。
- dedupe key 空白時不可把多筆資料合併成同一人。

## 8. 請假與點名

主要檔案：

- `src/views/LeaveRequestsView.vue`
- `src/views/AttendanceListView.vue`
- `src/views/RollCallView.vue`
- `src/utils/leaveRequests.ts`

主要資料：

- `leave_requests`
- `attendance_events`
- `attendance_records`
- `team_members`

資料流：

- 後台請假管理讀寫 `leave_requests`。
- 點名事件使用 `attendance_events`。
- 單場點名紀錄使用 `attendance_records`。
- 點名頁會參照球員名單與當日請假資料。

重要規則：

- 改請假或點名要檢查通知中心、推播、今日缺席、費用統計是否受影響。
- 後台頁面顯示權限不能取代 DB policy。

## 9. 賽事與比賽紀錄

主要檔案：

- `src/views/CalendarView.vue`
- `src/views/MatchRecordsView.vue`
- `src/services/matchesApi.ts`
- `src/stores/matches.ts`
- `src/types/match.ts`
- `src/utils/googleCalendarParser.ts`
- `src/components/match-records/*`

主要資料：

- `matches`
- `attendance_records`
- `team_members_safe`
- Storage bucket：`matches-photos`

資料流：

- `matchesApi` 封裝 `matches` CRUD。
- Google Calendar / iCal parser 負責把外部日曆轉成 match payload。
- 同步規劃維持 `create`、`update`、`skip` 三種結果。
- 比賽紀錄元件處理陣容、照片、出席統計、賽事細節與 live controller。

重要規則：

- 保留 `google_calendar_event_id` 欄位缺失時的 fallback。
- 同步比對先用 `google_calendar_event_id`，再用日期 + 時間 + 標題 fallback。

## 10. 特訓報名與球員點數

主要檔案：

- `src/views/TrainingView.vue`
- `src/services/trainingApi.ts`
- `src/types/training.ts`
- `src/utils/training.ts`
- `src/utils/trainingRegistrationNotification.ts`
- `src/views/RollCallView.vue`
- `supabase/functions/send-training-registration-notifications/index.ts`

主要資料：

- `matches`：`match_level = '特訓課'` 作為特訓活動主體
- `training_session_settings`
- `training_registrations`
- `player_point_transactions`
- `training_no_show_blocks`
- `attendance_events.training_session_id`
- `push_dispatch_events`：特訓報名開始通知去重與通知中心來源

資料流：

- 家長 / 球員透過 `/training` 依 linked member 查看點數、可報名特訓與自己的報名狀態。
- 教練在 `/training` 設定特訓報名時間窗、手動開關、名額與扣點數，並審核錄取 / 候補 / 未錄取；教練管理與點數管理只給 `training:CREATE / EDIT / DELETE` 任一管理權限者。
- 沒有特訓資料時，教練可在報名設定內新增特訓課與 settings；新增特訓課預設上課時間 `09:00 - 11:00`、地點 `中港國小`，上課時間使用 Element Plus 時間範圍元件，送出仍存成 `matches.match_time` 字串。
- 報名開始時間到達且 `manual_status = 'open'` 時，`send-training-registration-notifications` 會建立 `training_registration_open:*` 事件，讓系統通知中心與 Web Push 同步收到「特訓課開放報名」通知。
- 報名 RPC 會在 DB 端檢查 linked member、點數、禁報狀態、手動狀態與報名時間窗。
- 錄取時保留點數；`process_training_session_automation()` 在上課當天對已錄取名單扣點，並用 idempotency key 避免重複扣。
- 點數管理支援快速發放：可一鍵選全隊、角色、組別，套用常用點數 / 原因 preset；真正寫入仍統一呼叫 `grant_player_points(uuid[], integer, text)`，以交易紀錄追加方式建立流水帳。
- 特訓點名單由 `create_training_attendance_event()` 建立，只列錄取球員；`缺席` 會建立下一場特訓禁報，改成出席 / 請假會解除該次禁報。

重要規則：

- 個人端不直接寫入 training raw table，新增 / 取消報名走 security definer RPC。
- 一般成員或家長即使有 `training:VIEW`，也只看到個人報名 / 點數檢視，不可看到教練管理或點數發放工具。
- 錄取名單公布後，登入使用者只能看到非敏感名單欄位。
- 點數流水帳不可任意更新；加點、扣點、調整都新增 `player_point_transactions`。
- 特訓報名開始通知必須有穩定 event key，避免排程重試造成通知中心與 Web Push 重複顯示。

## 11. 收費與付款

主要檔案：

- `src/views/FeesView.vue`
- `src/components/fees/FeeSettings.vue`
- `src/components/fees/SchoolTeamFees.vue`
- `src/components/fees/QuarterlyFees.vue`
- `src/components/fees/ProfilePaymentSubmissionInbox.vue`
- `src/components/fees/PlayerBalanceManager.vue`
- `src/services/myPayments.ts`
- `src/services/playerBalances.ts`
- `src/utils/memberBilling.ts`
- `src/utils/monthlyFeeSettlement.ts`
- `src/utils/quarterlyFeeFamilies.ts`
- `src/utils/playerBalance.ts`
- `src/utils/siblingGroups.ts`

主要資料：

- `fee_settings`
- `monthly_fees`
- `quarterly_fees`
- `profile_payment_submissions`
- `player_balance_transactions`

資料流：

- 後台費用頁管理月費、季費與付款回報審核。
- `team_members.fee_billing_mode = 'monthly_fixed'` 代表社區球員固定月繳：角色仍為 `球員`，但有效繳費模式為月繳；月費表採固定金額減手動扣減，季費表與家庭季費分組排除該球員。
- 固定月繳預設金額存在 `fee_settings.monthly_fixed_fee`，正式月費紀錄會在 `monthly_fees.calculation_type` / `monthly_fees.fixed_monthly_fee` 保留當月計算方式與金額快照。
- 個人付款回報由 `myPayments` RPC 建立，可選用球員餘額；一般繳費與裝備付款都在管理端確認時才正式扣餘額。
- 球員餘額以 `player_balance_transactions` 流水帳計算，管理員可手動調整，付款審核時可把溢繳轉入餘額。
- sibling / family grouping 與季費家庭金額計算在 utils。

重要規則：

- 餘額屬於 `team_members`，不可扣成負數；家長只能看與使用自己綁定球員的餘額。
- 修改付款或費用要檢查 sibling、primary payer、half price 與固定月繳排除規則。
- 裝備付款回報在 `/my-payments` 與 `/fees?tab=equipment` 整合，但不要混入一般月費資料模型。

## 12. 裝備管理與加購

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
3. 備貨完成：`ready_for_pickup`。
4. 領取裝備：`picked_up`，並產生 `purchase` transaction。
5. 家長在 `/my-payments` 回報裝備付款。
6. 管理端在 `/fees?tab=equipment` 審核付款回報：`approved` 或 `rejected`。

重要規則：

- `/equipment` 需要 `equipment:VIEW`。
- `/equipment-addons` 只要求登入，資料安全靠 `linked_team_member_ids` 與 DB RLS。
- 裝備圖片與處理照片可多張上傳，使用 `equipments` bucket，前端顯示需支援左右滑動。
- 不要把來源專案的 `fee_records` 或月結模型搬進本專案。

## 13. 棒球能力與體能測驗

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

## 14. 節日主題

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

## 15. 推播與通知中心

主要檔案：

- `src/utils/pushNotifications.ts`
- `src/utils/pushDeepLink.ts`
- `src/composables/useNotificationFeed.ts`
- `src/components/PushSettingsDialog.vue`
- `public/push-sw.js`
- `supabase/functions/send-push-notification/index.ts`
- `supabase/functions/send-training-registration-notifications/index.ts`
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
7. 排程型通知如賽事提醒、特訓報名開始，使用專屬 Edge Function 建立 `push_dispatch_events` 並派送 Web Push。
8. 使用者點擊 Web Push 時，`public/push-sw.js` 同步啟動 client 導向，並把 target 寫入 IndexedDB `jg-baseball-push-deeplink/pendingTargets/latest` 與 Cache Storage `jg-baseball-push-deeplink-cache`；前端用 `pushDeepLink.ts` 正規化、短時間重試 consume pending target 後交給 router，推播設定可查看最後一次 click 診斷。

重要規則：

- 不要把所有通知硬綁 `leave_requests`。
- 多入口可能重複觸發的事件一定要有穩定 `eventKey`。
- 賽事提醒 URL 統一使用 `/calendar?match_id=<id>`；舊 `/match-records?match_id=<id>` 必須正規化到 `/calendar`，由 `CalendarView` 開啟 `MatchDetailDialog`。
- 推播 click target 不可只靠 hash route、search param、IndexedDB 或 `postMessage`，避免 iOS PWA 關閉啟動時只開 root 或持久化延遲造成導向遺失。

## 16. PWA、版本與更新

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

## 17. 維護本文件

下列情況需要同步更新本檔：

- 新增或移除路由。
- 新增 feature/action 或改權限行為。
- 新增資料表、RPC、Edge Function、Storage bucket。
- 改公開頁資料來源。
- 改推播 event key 或收件規則。
- 改裝備、付款、請假、點名、球員同步等核心流程。
