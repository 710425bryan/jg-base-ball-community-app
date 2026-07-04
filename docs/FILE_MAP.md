# File Map

本文件是 `jg-base-ball-community-app` 的重要檔案地圖。Codex / AI 要找修改入口時，先用這份文件定位，再讀實際程式碼。

閱讀順序建議：

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md`
3. 本檔
4. 任務對應 `.codex/skills/*/SKILL.md`

## 1. 專案入口與全域設定

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `src/main.ts` | Vue app 初始化 | 掛 Pinia、Router、Vue Query、Element Plus |
| `src/App.vue` | Auth 初始化與全站效果入口 | 初始化前顯示 loading；掛 `HolidayThemeSiteEffects` |
| `src/router/index.ts` | 路由、登入 guard、feature guard | 保留 `createWebHashHistory()` 與 chunk reload fallback |
| `src/services/supabase.ts` | Supabase client | 保留手機休眠 token refresh 保護 |
| `vite.config.ts` | Vite / PWA / version plugin | 一般功能開發不改 version 行為 |
| `public/push-sw.js` | Web Push service worker click / payload handler | click target 必須寫 IndexedDB + Cache Storage pending target，保留 iOS PWA deep link fallback |
| `src/style.css` | 全域 CSS 與共用 UI class | `AppPageHeader`、page title、dialog 手機滿版規則在這裡 |

## 2. AI 與文件

| 檔案 | 用途 |
| --- | --- |
| `AGENTS.md` | AI / Codex 必讀入口規則 |
| `.geminirules` | Gemini / Antigravity 相容入口，指向 `AGENTS.md` |
| `AI_SKILLS.md` | repo 內 Codex skills 索引 |
| `.codex/skills/*/SKILL.md` | 任務型 workflow |
| `docs/PROJECT_LOGIC.md` | 功能邏輯與資料流 |
| `docs/FILE_MAP.md` | 重要檔案地圖 |
| `docs/MIGRATIONS.md` | migration、hotfix、repair 索引 |
| `docs/EDGE_FUNCTIONS.md` | Edge Functions、外部服務與環境變數索引 |
| `docs/EQUIPMENT_REFUND_FLOW.md` | 裝備退款 / 作廢收款流程 |

規則：新增 route-level 頁面時，要同步更新本檔 Views、Services / Types / Utils 對照、`docs/PROJECT_LOGIC.md` 功能邏輯，以及對應 `.codex/skills/<feature>/SKILL.md`；若沒有對應 skill，需建立或說明併入既有 skill 的理由。

## 3. Layout 與共用元件

| 檔案 | 用途 |
| --- | --- |
| `src/layouts/PublicLayout.vue` | 公開頁 header / footer / login 入口 |
| `src/layouts/MainLayout.vue` | 登入後導覽、通知中心、手機選單、底部導覽 |
| `src/components/LoginModal.vue` | magic link / OTP 登入 UI |
| `src/components/PushSettingsDialog.vue` | Web Push 訂閱設定 |
| `src/components/RolePermissionsManager.vue` | 角色與 feature/action 權限管理 |
| `src/components/ViewModeSwitch.vue` | 檢視模式切換 |
| `src/components/common/AppPageHeader.vue` | 登入後功能頁 page title 標準元件 |
| `src/components/common/AppLoadingState.vue` | 頁面級 / 大區塊 loading 標準元件，文字用 `text` 傳入 |
| `src/components/common/PreviewableImage.vue` | 可預覽圖片 |
| `src/components/equipment/EquipmentPhotoCarousel.vue` | 裝備多照片輪播 / 左右滑動 |

## 4. Stores

| 檔案 | 用途 | 常見搭配 |
| --- | --- | --- |
| `src/stores/auth.ts` | Session、profile、登入登出、last seen | `src/services/supabase.ts`、`src/stores/permissions.ts` |
| `src/stores/permissions.ts` | 角色權限讀取與 `can()` | `app_role_permissions` |
| `src/stores/playerRoster.ts` | 球員名單 session 內快取與版本檢查 | `src/services/playerRosterApi.ts`、`get_team_members_cache_meta()` |
| `src/stores/teamGroups.ts` | team group 設定、排序與共用選項 | `src/services/teamGroupsApi.ts`、`src/utils/teamGroups.ts` |
| `src/stores/matches.ts` | 賽事資料狀態 | `src/services/matchesApi.ts` |
| `src/stores/equipment.ts` | 裝備主檔、交易、庫存狀態 | `src/services/equipmentApi.ts` |
| `src/stores/equipmentRequests.ts` | 裝備加購申請 / 審核狀態 | `src/services/equipmentApi.ts` |
| `src/stores/equipmentPayments.ts` | 裝備付款項目與審核狀態 | `src/services/equipmentApi.ts` |
| `src/stores/vendors.ts` | 廠商名單與交易類別狀態 | `src/services/vendorsApi.ts` |
| `src/stores/performance.ts` | 能力 / 體測資料狀態 | `src/services/performanceApi.ts` |

## 5. Services

| 檔案 | 用途 | 後端依賴 |
| --- | --- | --- |
| `src/services/publicLanding.ts` | 公開首頁摘要 | `get_public_landing_snapshot()` |
| `src/services/dashboardAttendance.ts` | 後台大廳今日訓練點名狀態，含今日多筆點名單 | `get_dashboard_today_attendance_status()` |
| `src/services/myHome.ts` | 個人化首頁摘要 | `get_my_home_snapshot()` |
| `src/services/myLeaveRequests.ts` | 我的假單 RPC | `list_my_leave_members()` 等 |
| `src/services/myPayments.ts` | 我的繳費 RPC | `profile_payment_submissions` 相關 RPC |
| `src/services/playerBalances.ts` | 球員餘額 RPC | `player_balance_transactions`、餘額查詢 / 調整 |
| `src/services/quarterlyFeeCompensations.ts` | 季費堂數不足補償 RPC | `quarterly_fee_compensation_items`、`player_balance_transactions` |
| `src/services/myPlayerRecords.ts` | 我的成績 RPC | `list_my_player_record_members()`、`get_my_player_match_records()` |
| `src/services/playerRosterApi.ts` | 球員名單查詢與 cache meta RPC | `team_members` / `team_members_safe` / `get_team_members_cache_meta()` |
| `src/services/teamGroupsApi.ts` | team group 設定 RPC | `team_group_settings` 相關 RPC |
| `src/services/matchesApi.ts` | 賽事 CRUD | `matches` |
| `src/services/matchLeaveAbsences.ts` | 未來賽事假單同步請假預覽 / 詳情讀取 | `preview_match_leave_absences()`、`get_match_leave_absences()` |
| `src/services/matchReminderNotifications.ts` | 未來賽事手動通知與提醒排程設定 RPC | `send-match-reminders` Edge Function、`system_settings.match_reminder_schedule_config` |
| `src/services/matchCalendarSync.ts` | Google Calendar 手動同步預覽 | `sync-match-calendar` Edge Function、瀏覽器 proxy fallback |
| `src/services/matchAudioApi.ts` | 比賽語音轉紀錄 Edge Function 呼叫 | `transcribe-match-audio` |
| `src/services/matchFees.ts` | 比賽費付款與審核 RPC | `match_fee_items` / `match_payment_submissions` |
| `src/services/weatherApi.ts` | 賽事 / 首頁天氣預報與地點解析 | `resolve-location`、Open-Meteo |
| `src/services/trainingApi.ts` | 特訓報名、點數、特訓點名 RPC 與單筆報名 / 錄取通知呼叫 | `training_*` / `player_point_transactions` / `attendance_events.training_session_id` |
| `src/services/trainingProgramsApi.ts` | 訓練項目設定 RPC | `training_program_settings` |
| `src/services/trainingDatesApi.ts` | 每月訓練日期設定與日期異動通知呼叫 | `training_month_date_settings` / `get_training_month_dates()` / `save_training_month_dates()` / `send-training-date-notifications` |
| `src/services/trainingLocationsApi.ts` | 場地與人員配置、連動點名 RPC | `training_location_*` / `training_venues` / `attendance_events.training_location_session_id` / `training_location_session_venue_id` |
| `src/services/coachSchedulesApi.ts` | 教練排班候選、Dashboard 摘要與指派儲存 RPC | `coach_schedule_events` / `coach_schedule_assignments` / `list_coach_schedule_*` |
| `src/services/equipmentApi.ts` | 裝備、加購、付款、庫存 API | 裝備 tables / RPC / `equipments` bucket |
| `src/services/vendorsApi.ts` | 廠商名單、交易類別與照片 signed URL API | `vendors` / `vendor_trade_categories` / `vendors` bucket |
| `src/services/performanceApi.ts` | 棒球能力 / 體測 API | performance tables / RPC |
| `src/services/feeManagementReminders.ts` | 費用管理提醒 RPC | `get_fee_management_reminders()` |
| `src/services/supabase.ts` | Supabase client | env vars |

## 6. Composables

| 檔案 | 用途 |
| --- | --- |
| `src/composables/useVersionCheck.ts` | 版本輪詢與更新列 |
| `src/composables/useNotificationFeed.ts` | 通知中心資料 controller |
| `src/composables/useHolidayTheme.ts` | 節日主題公開設定、v2 config normalize |

## 7. Utils

| 檔案 | 用途 |
| --- | --- |
| `src/utils/appUpdate.ts` | app shell refresh 與目前路徑處理 |
| `src/utils/playerSync.ts` | Google Form / Sheet 球員同步、dedupe、保護欄位 |
| `src/utils/pushNotifications.ts` | 前端推播派送、event key helper |
| `src/utils/pushDeepLink.ts` | Web Push 點擊 target 正規化、IndexedDB / Cache Storage pending target、iOS PWA deep link fallback 與診斷 |
| `src/utils/trainingRegistrationNotification.ts` | 特訓報名開始 / 截止前提醒與單筆報名 / 錄取通知文案、URL、event key |
| `src/utils/trainingLocationNotification.ts` | 場地通知文案、URL、event key、收件分組 |
| `src/utils/coachSchedules.ts` | 教練排班來源 label、月份 normalize、候選 / 已儲存事件合併與排序 |
| `src/utils/googleCalendarParser.ts` | Google Calendar / iCal parser 與同步規劃 |
| `src/utils/matchCalendarCopy.ts` | Google Calendar / 賽事複製文字 |
| `src/utils/matchReminderNotification.ts` | 賽事提醒文案、URL、event key |
| `src/utils/matchReminderSchedule.ts` | 賽事提醒排程設定 normalize / validation / 到期規則 |
| `src/utils/matchLeaveAbsences.ts` | 手動請假列與假單同步請假列合併、來源辨識 |
| `src/utils/matchFieldEditor.ts` | 陣容守位 normalize、拖曳與隱藏名單 |
| `src/utils/lineupPhotoParser.ts` | 陣容照片壓縮 / data URL 前處理 |
| `src/utils/liveMatchScoreboard.ts` | 即時比賽記分板狀態 |
| `src/utils/matchAudioTranscription.ts` | 語音轉比賽紀錄 normalize / unresolved players |
| `src/utils/matchAudioDraftStore.ts` | 語音草稿 IndexedDB 儲存 |
| `src/utils/equipmentInventory.ts` | 裝備庫存計算 |
| `src/utils/equipmentPricing.ts` | 裝備價格計算 |
| `src/utils/equipmentRequestStatus.ts` | 裝備申請狀態規則 |
| `src/utils/vendors.ts` | 廠商搜尋、交易類別分組與照片 path normalize |
| `src/utils/memberBilling.ts` | 球員有效繳費模式、固定月繳、球員計次月費與月費計算 helper |
| `src/utils/monthlyPaymentPeriods.ts` | 月繳付款回報開放期別，計次月費與固定月繳 25 日規則 |
| `src/utils/monthlyFeeSettlement.ts` | 月費結算 |
| `src/utils/quarterlyFeeFamilies.ts` | 季費家庭分組與金額 |
| `src/utils/quarterlyPaymentSubmissions.ts` | 季費付款回報期別開放、項目 normalize 與多球員季費驗證 |
| `src/utils/quarterlyFeeCompensation.ts` | 季費堂數不足補償堂數與金額試算 |
| `src/utils/playerBalance.ts` | 球員餘額扣抵金額與顯示文字 |
| `src/utils/paymentMethods.ts` | 付款方式與顯示文字 |
| `src/utils/feeManagementReminders.ts` | 費用提醒摘要純邏輯 |
| `src/utils/siblingGroups.ts` | 手足 / 家庭分組 |
| `src/utils/teamGroups.ts` | team group normalize、排序與樣式 |
| `src/utils/performanceConfig.ts` | 能力 / 體測欄位與圖表設定 |
| `src/utils/holidayMotionLayout.ts` | 節日動畫版位 |
| `src/utils/profileAccess.ts` | profile 可登入狀態判斷 |
| `src/utils/supabaseRpc.ts` | RPC missing fallback helper |
| `src/utils/csvExport.ts` | CSV 匯出 |
| `src/utils/imageCompressor.ts` | 圖片壓縮 |
| `src/utils/externalUrl.ts` | 外部連結正規化 |
| `src/utils/passkeySupport.ts` | passkey 支援度檢查 |
| `src/utils/leaveRequests.ts` | 假單工具邏輯 |
| `src/utils/training.ts` | 特訓狀態 label、報名可送出 / 禁用原因、錄取名單 normalize |
| `src/utils/dashboardHome.ts` | 後台首頁摘要與 hero match 邏輯 |
| `src/utils/myHomeSnapshot.ts` | 個人首頁 snapshot todo / 今日摘要組裝 |

## 8. Views

| 路由 / 功能 | View | 權限 / 備註 |
| --- | --- | --- |
| `/` | `src/views/LandingView.vue` | 公開首頁 |
| `/push-entry` | `src/views/PushEntryView.vue` | 公開推播入口 |
| `/dashboard` | `src/views/HomeView.vue` | 登入即可 |
| `/calendar` | `src/views/CalendarView.vue` | 登入即可 |
| `/profile` | `src/views/ProfileSettingsView.vue` | 個人設定 |
| `/my-records` | `src/views/MyPlayerRecordsView.vue` | 個人成績，登入 + linked member / `players:VIEW` RPC |
| `/my-payments` | `src/views/MyPaymentsView.vue` | 個人繳費與裝備付款 |
| `/equipment-addons` | `src/views/EquipmentAddonsView.vue` | 登入 + linked member / RLS |
| `/my-leave-requests` | `src/views/MyLeaveRequestsView.vue` | 個人假單 |
| `/leave-requests` | `src/views/LeaveRequestsView.vue` | `leave_requests:VIEW` |
| `/players` | `src/views/PlayersView.vue` | `players:VIEW` |
| `/users` | `src/views/UsersView.vue` | `users:VIEW` |
| `/join-inquiries` | `src/views/JoinInquiriesView.vue` | `join_inquiries:VIEW` |
| `/announcements` | `src/views/AnnouncementsView.vue` | `announcements:VIEW` |
| `/holiday-theme-settings` | `src/views/HolidayThemeSettingsView.vue` | `holiday_theme_settings:VIEW` |
| `/attendance` | `src/views/AttendanceListView.vue` | `attendance:VIEW` |
| `/attendance/:id` | `src/views/RollCallView.vue` | `attendance:VIEW` |
| `/training` | `src/views/TrainingView.vue` | `training` + linked member exception |
| `/training-program-settings` | `src/views/TrainingProgramSettingsView.vue` | `training_dates:VIEW` |
| `/training-dates` | `src/views/TrainingDatesView.vue` | `training_dates:VIEW` |
| `/training-locations` | `src/views/TrainingLocationsView.vue` | `training_locations:VIEW` |
| `/coach-schedules` | `src/views/CoachSchedulesView.vue` | `coach_schedules:VIEW` |
| `/match-records` | `src/views/MatchRecordsView.vue` | `matches:VIEW` |
| `/fees` | `src/views/FeesView.vue` | `fees:VIEW` |
| `/equipment` | `src/views/EquipmentView.vue` | `equipment:VIEW` |
| `/vendors` | `src/views/VendorsView.vue` | `vendors:VIEW` |
| `/baseball-ability` | `src/views/BaseballAbilityView.vue` | `baseball_ability` + linked member exception |
| `/baseball-ability/:memberId` | `src/views/BaseballAbilityDetailView.vue` | `baseball_ability` + linked member exception |
| `/physical-tests` | `src/views/PhysicalTestsView.vue` | `physical_tests` + linked member exception |
| `/physical-tests/:memberId` | `src/views/PhysicalTestsDetailView.vue` | `physical_tests` + linked member exception |

## 9. Feature Components

### Equipment

| 檔案 | 用途 |
| --- | --- |
| `src/components/equipment/EquipmentFormDialog.vue` | 裝備主檔新增 / 編輯 |
| `src/components/equipment/EquipmentPhotoCarousel.vue` | 裝備照片與處理照片輪播 |
| `src/components/equipment/EquipmentHistoryDialog.vue` | 裝備交易 / 庫存 / 申請歷史 |
| `src/components/equipment/EquipmentInventoryAdjustmentDialog.vue` | 庫存調整 |
| `src/components/equipment/EquipmentPaymentSubmissionInbox.vue` | 管理端裝備付款審核 |
| `src/components/equipment/EquipmentRequestActionDialog.vue` | 加購申請操作 |
| `src/components/equipment/EquipmentRequestReviewPanel.vue` | 加購審核面板 |
| `src/components/equipment/EquipmentTransactionDialog.vue` | 裝備交易紀錄 |
| `src/components/equipment/MyEquipmentPaymentsPanel.vue` | 個人裝備付款 |

### Vendors

| 檔案 | 用途 |
| --- | --- |
| `src/components/vendors/VendorFormDialog.vue` | 廠商新增 / 編輯表單、交易類別 allow-create、多照片上傳 |
| `src/components/vendors/VendorPhotoGallery.vue` | 廠商照片 signed URL 輪播顯示 |

### Fees

| 檔案 | 用途 |
| --- | --- |
| `src/components/fees/FeeSettings.vue` | 計次月費費率、社區球員固定月繳金額與季費補償預設設定 |
| `src/components/fees/SchoolTeamFees.vue` | 月費管理，包含校隊計次、球員計次月費與社區球員固定月繳 |
| `src/components/fees/QuarterlyFees.vue` | 季費管理，排除固定月繳、球員計次月費與不收費球員 |
| `src/components/fees/QuarterlyFeeCompensationPanel.vue` | 季費堂數不足補償試算、待審核與核准 |
| `src/components/fees/ProfilePaymentSubmissionInbox.vue` | 個人付款回報審核 |
| `src/components/fees/PlayerBalanceManager.vue` | 球員餘額管理與流水帳 |
| `src/components/fees/MatchFeeManagementPanel.vue` | 比賽費項目管理與付款狀態 |
| `src/components/fees/MatchPaymentSubmissionInbox.vue` | 比賽費付款回報審核 |
| `src/components/fees/MyMatchFeesPanel.vue` | 個人比賽費付款面板 |
| `src/components/fees/FeeManagementReminderPanel.vue` | 費用管理提醒 |

### Payments

| 檔案 | 用途 |
| --- | --- |
| `src/components/payments/PaymentAccountInfoCard.vue` | 付款帳戶資訊卡 |
| `src/components/payments/PaymentSubmissionSummary.vue` | 付款回報金額 / 餘額扣抵摘要 |

### Match Records

| 檔案 | 用途 |
| --- | --- |
| `src/components/match-records/MatchFormDialog.vue` | 比賽新增 / 編輯 |
| `src/components/match-records/MatchDetailDialog.vue` | 比賽詳情 |
| `src/components/match-records/SyncCalendarDialog.vue` | Google Calendar / iCal 同步 |
| `src/components/match-records/MatchLineupTab.vue` | 陣容 |
| `src/components/match-records/MatchFieldEditor.vue` | 視覺化守位編輯 |
| `src/components/match-records/MatchAttendanceStatsTab.vue` | 出席統計 |
| `src/components/match-records/MatchTournamentStatsTab.vue` | 盃賽統計 |
| `src/components/match-records/MatchLiveController.vue` | 即時比賽控制 |
| `src/components/match-records/MatchAudioRecorder.vue` | 比賽語音錄製與轉紀錄 |
| `src/components/match-records/VisualField.vue` | 視覺化球場 |
| `src/components/match-records/MatchesGrid.vue` | 賽事卡片列表 |
| `src/components/match-records/MatchesTable.vue` | 賽事表格 |
| `src/components/match-records/MatchReminderScheduleDialog.vue` | 賽事提醒排程設定 |

### Performance

| 檔案 | 用途 |
| --- | --- |
| `src/components/performance/PerformanceRecordsPage.vue` | 能力 / 體測列表共用頁 |
| `src/components/performance/PerformanceMemberDetailPage.vue` | 球員詳情 |
| `src/components/performance/PerformanceRecordFormDialog.vue` | 新增 / 編輯紀錄 |
| `src/components/performance/PerformanceTrendChart.vue` | 趨勢圖 |

### Holiday Theme / Home

| 檔案 | 用途 |
| --- | --- |
| `src/components/home/HomeHolidayHeroOverlay.vue` | 首頁節日 hero overlay |
| `src/components/home/MyHomeTodayPanel.vue` | 個人首頁今日摘要與特訓點數卡 |
| `src/components/layout/HolidayThemeRibbon.vue` | 全站節日橫幅 |
| `src/components/layout/HolidayThemeSiteEffects.vue` | 全站節日動畫 |
| `src/components/settings/HolidayThemePreviewStage.vue` | 後台節日預覽 |

### Players

| 檔案 | 用途 |
| --- | --- |
| `src/components/players/TeamGroupSettingsDialog.vue` | team group 新增、改名、排序與刪除轉移 |

## 10. Types

| 檔案 | 用途 |
| --- | --- |
| `src/types/dashboard.ts` | Dashboard / notification feed 型別 |
| `src/types/equipment.ts` | 裝備管理型別 |
| `src/types/vendor.ts` | 廠商名單與交易類別型別 |
| `src/types/leaveRequests.ts` | 我的假單型別 |
| `src/types/match.ts` | 賽事型別 |
| `src/types/matchFees.ts` | 比賽費與付款回報型別 |
| `src/types/myHome.ts` | 個人首頁 snapshot 型別 |
| `src/types/payments.ts` | 個人付款型別 |
| `src/types/playerBalances.ts` | 球員餘額型別 |
| `src/types/quarterlyFeeCompensation.ts` | 季費堂數不足補償型別 |
| `src/types/performance.ts` | 能力 / 體測型別 |
| `src/types/publicLanding.ts` | 公開首頁 snapshot 型別 |
| `src/types/teamGroup.ts` | team group 設定型別 |
| `src/types/training.ts` | 特訓報名、點數、管理審核型別 |
| `src/types/trainingLocation.ts` | 場地與人員配置型別 |
| `src/types/coachSchedule.ts` | 教練排班、教練指派與 Dashboard 排班型別 |
| `src/types/feeManagementReminders.ts` | 費用提醒型別 |

## 11. Supabase Migrations

| 類型 | 重要檔案 |
| --- | --- |
| 權限 / RLS | `supabase_access_control_rls_migration.sql`、`supabase_access_control_policy_cleanup_migration.sql` |
| Profile access | `supabase_profile_access_control_migration.sql`、`supabase_profiles_personal_settings_migration.sql` |
| 公開首頁 / Dashboard | `supabase_dashboard_snapshot_migration.sql`、`supabase_my_home_snapshot_migration.sql`、`supabase_zz_my_home_training_points_migration.sql` |
| 假單 | `supabase_my_leave_requests_migration.sql`、`supabase_match_leave_absences_migration.sql`、`supabase_zzzzzzzzzzzzzzzz_leave_time_segments_migration.sql` |
| 個人成績 | `supabase_my_player_records_migration.sql` |
| 收費 / 付款 | `supabase_fees_migration.sql`、`supabase_quarterly_fees_migration.sql`、`supabase_profile_payment_submissions_migration.sql`、`supabase_player_balance_transactions_migration.sql`、`supabase_fixed_monthly_billing_migration.sql`、`supabase_zzzzzzzzzzzzzzz_monthly_per_session_billing_migration.sql`、`supabase_zzzzzzzzzzzzzzzzz_monthly_fee_leave_time_segment_migration.sql`、`supabase_quarterly_fee_compensation_migration.sql`、`supabase_match_fees_migration.sql`、`supabase_fee_management_reminders_migration.sql`、`supabase_zzzzzzzzzzzz_quarterly_payment_open_period_migration.sql`、`supabase_zzzzzzzzzzzzzz_monthly_payment_open_period_migration.sql` |
| 裝備 | `supabase_equipment_management_migration.sql`、`supabase_equipment_inventory_adjustments_migration.sql`、`supabase_equipment_manual_purchase_records_migration.sql`、`supabase_equipment_multiple_photos_migration.sql`、`supabase_zzzzzz_equipment_inventory_snapshot_rpc_migration.sql`、`supabase_zzzzzzzz_equipment_ready_for_pickup_payment_scope_migration.sql`、`supabase_zzzzzzzzz_equipment_custom_order_migration.sql`、`supabase_zzzzzzzzzz_equipment_approved_payment_scope_migration.sql`、`supabase_zzzzzzzzzzz_equipment_payment_refund_migration.sql`、`supabase_zzzzzzzzzzzz_equipment_create_request_inventory_guard_transaction_fix_migration.sql` |
| 廠商 | `supabase_vendor_management_migration.sql` |
| 能力 / 體測 | `supabase_performance_data_migration.sql`、`supabase_performance_view_scope_migration.sql` |
| 特訓 / 點數 | `supabase_training_points_migration.sql`、`supabase_zz_training_point_transaction_delete_migration.sql`、`supabase_zz_training_registration_notifications_migration.sql`、`supabase_zzzzzzzz_training_auto_select_notifications_migration.sql` |
| 訓練項目 / 訓練日期設定 / 換月預設排程 | `supabase_training_dates_migration.sql`、`supabase_zzzzzzzzzzzzzzzzzz_training_program_scope_migration.sql` |
| 場地與人員配置 | `supabase_training_locations_migration.sql`、`supabase_zzzzzzzzz_training_location_attendance_migration.sql`、`supabase_zzzzzzzzzz_training_location_venue_settings_migration.sql`、`supabase_zzzzzzzzzzzzzzzzzz_training_location_leave_time_segment_migration.sql` |
| 教練排班表 | `supabase_coach_schedules_migration.sql`、`supabase_coach_schedules_schedulable_coaches_hotfix.sql`、`supabase_coach_schedules_training_location_sync_hotfix.sql` |
| 賽事同步 | `supabase_matches_google_calendar_sync_migration.sql`、`supabase_match_calendar_daily_sync_schedule.sql`、`supabase_match_leave_absences_migration.sql` |
| 推播 | `supabase_web_push_subscriptions_migration.sql`、`supabase_push_dispatch_events_migration.sql`、`supabase_match_reminder_notifications_migration.sql`、`supabase_match_reminder_schedule_config_migration.sql` |
| 節日主題 | `supabase_holiday_theme_migration.sql` |

完整 migration / hotfix / repair 索引請讀 `docs/MIGRATIONS.md`。注意：同一 function / policy 可能在後續 migration 被覆寫。修改 DB 規則前要用 `rg` 查所有同名 function / policy。

## 12. Supabase Edge Functions

| 檔案 | 用途 |
| --- | --- |
| `supabase/functions/send-push-notification/index.ts` | Web Push 派送 |
| `supabase/functions/_shared/push.ts` | 推播共用權限與 subscription helper |
| `supabase/functions/notify-holiday-theme/index.ts` | 節日主題通知 |
| `supabase/functions/notify-holiday-theme/logic.ts` | 節日通知邏輯 |
| `supabase/functions/send-match-reminders/index.ts` | 賽事提醒與未來賽事手動通知 |
| `supabase/functions/send-training-registration-notifications/index.ts` | 特訓報名開始 / 截止前提醒通知 |
| `supabase/functions/send-training-registration-status-notifications/index.ts` | 單筆特訓報名完成 / 錄取通知 |
| `supabase/functions/send-training-selection-notifications/index.ts` | 特訓錄取名單公布通知 |
| `supabase/functions/send-training-date-notifications/index.ts` | 訓練日期異動通知 |
| `supabase/functions/send-training-location-notifications/index.ts` | 訓練場地通知 |
| `supabase/functions/sync-match-calendar/index.ts` | 賽事日曆同步 |
| `supabase/functions/leave-webhook/index.ts` | 請假 webhook |
| `supabase/functions/record-fee-remittance/index.ts` | 繳費匯款紀錄 |
| `supabase/functions/parse-lineup/index.ts` | 陣容解析 |
| `supabase/functions/transcribe-match-audio/index.ts` | 比賽語音轉文字與結構化紀錄 |
| `supabase/functions/resolve-location/index.ts` | 地點 geocoding |
| `supabase/functions/resolve-location/logic.ts` | 地點解析純邏輯 |

完整 Edge Function / env 索引請讀 `docs/EDGE_FUNCTIONS.md`。

## 13. Scripts

| 檔案 | 用途 |
| --- | --- |
| `scripts/validate-access-control.mjs` | 權限設定驗證 |
| `scripts/fix-quarterly-fee-family-amounts.mjs` | 修復季費家庭金額 |
| `scripts/fix-quarterly-fee-sibling-links.mjs` | 修復 sibling link |
| `scripts/generate-icons.js` | PWA icon 產生 |
| `scripts/bump_fonts.cjs` | 字型資產處理 |
| `scripts/google-form-remittance-apps-script.js` | Google Form 匯款 Apps Script |

## 14. 測試入口

常用測試檔：

- `src/stores/auth.test.ts`
- `src/services/matchesApi.test.ts`
- `src/services/weatherApi.test.ts`
- `src/services/publicLanding.test.ts`
- `src/utils/playerSync.test.ts`
- `src/stores/playerRoster.test.ts`
- `src/stores/teamGroups.test.ts`
- `src/utils/pushNotifications.test.ts`
- `src/utils/googleCalendarParser.test.ts`
- `src/utils/matchFieldEditor.test.ts`
- `src/utils/liveMatchScoreboard.test.ts`
- `src/utils/matchAudioTranscription.test.ts`
- `src/utils/lineupPhotoParser.test.ts`
- `src/utils/leaveRequests.test.ts`
- `src/utils/memberBilling.test.ts`
- `src/utils/monthlyPaymentPeriods.test.ts`
- `src/utils/monthlyFeeSettlement.test.ts`
- `src/utils/quarterlyFeeFamilies.test.ts`
- `src/utils/quarterlyPaymentSubmissions.test.ts`
- `src/utils/playerBalance.test.ts`
- `src/utils/feeManagementReminders.test.ts`
- `src/utils/equipmentInventory.test.ts`
- `src/utils/equipmentPricing.test.ts`
- `src/utils/equipmentRequestStatus.test.ts`
- `src/utils/vendors.test.ts`
- `src/composables/useHolidayTheme.test.ts`
- `src/views/HolidayThemeSettingsView.test.ts`
- `supabase/functions/notify-holiday-theme/logic.test.ts`
- `supabase/functions/resolve-location/logic.test.ts`

驗證指令以 `AGENTS.md` 的驗證矩陣為準。

## 15. 快速定位規則

- 改頁面 UI：先找 `src/views/<Feature>View.vue`，再看對應 `src/components/<feature>/*`。
- 改資料讀寫：先找 `src/services/*Api.ts` 或該功能 service，再看 store。
- 改跨頁狀態：看 `src/stores/*`。
- 改純邏輯或同步規則：看 `src/utils/*` 與同名 test。
- 改權限：看 `src/router/index.ts`、`src/stores/permissions.ts`、`RolePermissionsManager.vue`、migration。
- 改 DB 安全：先讀 `docs/MIGRATIONS.md`，再 `rg` function / policy 名稱，確認後續 migration 沒有覆寫。
- 改 Edge Function：先讀 `docs/EDGE_FUNCTIONS.md`，確認 env、auth 與對應 skill。
- 改推播：看 `src/utils/pushNotifications.ts`、`send-push-notification`、`_shared/push.ts`。
- 改排程通知：看對應 Edge Function、`push_dispatch_events` event key、`get_notification_feed()` 是否同步顯示。
- 改公開頁資料：優先找 public RPC，不要直接查 raw table。
