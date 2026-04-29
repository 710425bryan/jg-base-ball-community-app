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
- `src/views/MyPaymentsView.vue`
- `src/services/myPayments.ts`

資料流：

- 個人化首頁摘要走 `get_my_home_snapshot(p_today)`。
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

重要規則：

- 個人功能依 `profiles.linked_team_member_ids` 與 DB RPC 控制可見資料。
- 不要在前端自行推導可讀取的其他家庭或球員資料。

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
- 既有球員同步不得覆蓋 `is_primary_payer` 與 `is_half_price`。
- 新增球員時上述兩欄預設為 `false`。
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

## 10. 收費與付款

主要檔案：

- `src/views/FeesView.vue`
- `src/components/fees/FeeSettings.vue`
- `src/components/fees/SchoolTeamFees.vue`
- `src/components/fees/QuarterlyFees.vue`
- `src/components/fees/ProfilePaymentSubmissionInbox.vue`
- `src/services/myPayments.ts`
- `src/utils/monthlyFeeSettlement.ts`
- `src/utils/quarterlyFeeFamilies.ts`
- `src/utils/siblingGroups.ts`

主要資料：

- `fee_settings`
- `monthly_fees`
- `quarterly_fees`
- `profile_payment_submissions`

資料流：

- 後台費用頁管理月費、季費與付款回報審核。
- 個人付款回報由 `myPayments` RPC 建立。
- sibling / family grouping 與季費家庭金額計算在 utils。

重要規則：

- 修改付款或費用要檢查 sibling、primary payer、half price 相關規則。
- 裝備付款回報在 `/my-payments` 與 `/fees?tab=equipment` 整合，但不要混入一般月費資料模型。

## 11. 裝備管理與加購

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

## 12. 棒球能力與體能測驗

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

## 13. 節日主題

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

## 14. 推播與通知中心

主要檔案：

- `src/utils/pushNotifications.ts`
- `src/composables/useNotificationFeed.ts`
- `src/components/PushSettingsDialog.vue`
- `supabase/functions/send-push-notification/index.ts`
- `supabase/functions/_shared/push.ts`

主要資料：

- `web_push_subscriptions`
- `push_dispatch_events`
- `get_notification_feed(p_limit)`

資料流：

1. 前端以 `dispatchPushNotification()` 發送通知。
2. Edge Function 根據 `feature` + `action` 找可接收使用者。
3. `targetRoles` 或 `targetUserIds` 只能縮小收件範圍。
4. `eventKey` 進 `push_dispatch_events` 去重。
5. 過期 subscription 由 Edge Function 清理。
6. 通知中心透過 `get_notification_feed()` 匯整顯示。

重要規則：

- 不要把所有通知硬綁 `leave_requests`。
- 多入口可能重複觸發的事件一定要有穩定 `eventKey`。

## 15. PWA、版本與更新

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

## 16. 維護本文件

下列情況需要同步更新本檔：

- 新增或移除路由。
- 新增 feature/action 或改權限行為。
- 新增資料表、RPC、Edge Function、Storage bucket。
- 改公開頁資料來源。
- 改推播 event key 或收件規則。
- 改裝備、付款、請假、點名、球員同步等核心流程。
