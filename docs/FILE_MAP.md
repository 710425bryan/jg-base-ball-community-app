# File Map

本文件是 `jg-base-ball-community-app` 的重要檔案地圖。Codex / AI 要找修改入口時，先用這份文件定位，再讀實際程式碼。

閱讀順序建議：

1. `AGENT.md`
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
| `src/style.css` | 全域 CSS 與共用 UI class | page title、dialog 手機滿版規則在這裡 |

## 2. AI 與文件

| 檔案 | 用途 |
| --- | --- |
| `AGENT.md` | AI / Codex 必讀入口規則 |
| `AGENTS.md` | 指向 `AGENT.md` 的相容入口 |
| `AI_SKILLS.md` | repo 內 Codex skills 索引 |
| `.codex/skills/*/SKILL.md` | 任務型 workflow |
| `docs/PROJECT_LOGIC.md` | 功能邏輯與資料流 |
| `docs/FILE_MAP.md` | 重要檔案地圖 |

## 3. Layout 與共用元件

| 檔案 | 用途 |
| --- | --- |
| `src/layouts/PublicLayout.vue` | 公開頁 header / footer / login 入口 |
| `src/layouts/MainLayout.vue` | 登入後導覽、通知中心、手機選單、底部導覽 |
| `src/components/LoginModal.vue` | magic link / OTP 登入 UI |
| `src/components/PushSettingsDialog.vue` | Web Push 訂閱設定 |
| `src/components/RolePermissionsManager.vue` | 角色與 feature/action 權限管理 |
| `src/components/ViewModeSwitch.vue` | 檢視模式切換 |
| `src/components/common/PreviewableImage.vue` | 可預覽圖片 |
| `src/components/equipment/EquipmentPhotoCarousel.vue` | 裝備多照片輪播 / 左右滑動 |

## 4. Stores

| 檔案 | 用途 | 常見搭配 |
| --- | --- | --- |
| `src/stores/auth.ts` | Session、profile、登入登出、last seen | `src/services/supabase.ts`、`src/stores/permissions.ts` |
| `src/stores/permissions.ts` | 角色權限讀取與 `can()` | `app_role_permissions` |
| `src/stores/playerRoster.ts` | 球員名單 session 內快取與版本檢查 | `src/services/playerRosterApi.ts`、`get_team_members_cache_meta()` |
| `src/stores/matches.ts` | 賽事資料狀態 | `src/services/matchesApi.ts` |
| `src/stores/equipment.ts` | 裝備主檔、交易、庫存狀態 | `src/services/equipmentApi.ts` |
| `src/stores/equipmentRequests.ts` | 裝備加購申請 / 審核狀態 | `src/services/equipmentApi.ts` |
| `src/stores/equipmentPayments.ts` | 裝備付款項目與審核狀態 | `src/services/equipmentApi.ts` |
| `src/stores/performance.ts` | 能力 / 體測資料狀態 | `src/services/performanceApi.ts` |

## 5. Services

| 檔案 | 用途 | 後端依賴 |
| --- | --- | --- |
| `src/services/publicLanding.ts` | 公開首頁摘要 | `get_public_landing_snapshot()` |
| `src/services/myHome.ts` | 個人化首頁摘要 | `get_my_home_snapshot()` |
| `src/services/myLeaveRequests.ts` | 我的假單 RPC | `list_my_leave_members()` 等 |
| `src/services/myPayments.ts` | 我的繳費 RPC | `profile_payment_submissions` 相關 RPC |
| `src/services/playerRosterApi.ts` | 球員名單查詢與 cache meta RPC | `team_members` / `team_members_safe` / `get_team_members_cache_meta()` |
| `src/services/matchesApi.ts` | 賽事 CRUD | `matches` |
| `src/services/equipmentApi.ts` | 裝備、加購、付款、庫存 API | 裝備 tables / RPC / `equipments` bucket |
| `src/services/performanceApi.ts` | 棒球能力 / 體測 API | performance tables / RPC |
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
| `src/utils/googleCalendarParser.ts` | Google Calendar / iCal parser 與同步規劃 |
| `src/utils/equipmentInventory.ts` | 裝備庫存計算 |
| `src/utils/equipmentPricing.ts` | 裝備價格計算 |
| `src/utils/equipmentRequestStatus.ts` | 裝備申請狀態規則 |
| `src/utils/monthlyFeeSettlement.ts` | 月費結算 |
| `src/utils/quarterlyFeeFamilies.ts` | 季費家庭分組與金額 |
| `src/utils/siblingGroups.ts` | 手足 / 家庭分組 |
| `src/utils/performanceConfig.ts` | 能力 / 體測欄位與圖表設定 |
| `src/utils/holidayMotionLayout.ts` | 節日動畫版位 |
| `src/utils/profileAccess.ts` | profile 可登入狀態判斷 |
| `src/utils/supabaseRpc.ts` | RPC missing fallback helper |
| `src/utils/csvExport.ts` | CSV 匯出 |
| `src/utils/imageCompressor.ts` | 圖片壓縮 |
| `src/utils/leaveRequests.ts` | 假單工具邏輯 |
| `src/utils/dashboardHome.ts` | 後台首頁摘要與 hero match 邏輯 |

## 8. Views

| 路由 / 功能 | View | 權限 / 備註 |
| --- | --- | --- |
| `/` | `src/views/LandingView.vue` | 公開首頁 |
| `/push-entry` | `src/views/PushEntryView.vue` | 公開推播入口 |
| `/dashboard` | `src/views/HomeView.vue` | 登入即可 |
| `/calendar` | `src/views/CalendarView.vue` | 登入即可 |
| `/profile` | `src/views/ProfileSettingsView.vue` | 個人設定 |
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
| `/match-records` | `src/views/MatchRecordsView.vue` | `matches:VIEW` |
| `/fees` | `src/views/FeesView.vue` | `fees:VIEW` |
| `/equipment` | `src/views/EquipmentView.vue` | `equipment:VIEW` |
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

### Fees

| 檔案 | 用途 |
| --- | --- |
| `src/components/fees/FeeSettings.vue` | 收費設定 |
| `src/components/fees/SchoolTeamFees.vue` | 校隊月費 / 費用管理 |
| `src/components/fees/QuarterlyFees.vue` | 季費管理 |
| `src/components/fees/ProfilePaymentSubmissionInbox.vue` | 個人付款回報審核 |

### Match Records

| 檔案 | 用途 |
| --- | --- |
| `src/components/match-records/MatchFormDialog.vue` | 比賽新增 / 編輯 |
| `src/components/match-records/MatchDetailDialog.vue` | 比賽詳情 |
| `src/components/match-records/SyncCalendarDialog.vue` | Google Calendar / iCal 同步 |
| `src/components/match-records/MatchLineupTab.vue` | 陣容 |
| `src/components/match-records/MatchAttendanceStatsTab.vue` | 出席統計 |
| `src/components/match-records/MatchTournamentStatsTab.vue` | 盃賽統計 |
| `src/components/match-records/MatchLiveController.vue` | 即時比賽控制 |
| `src/components/match-records/VisualField.vue` | 視覺化球場 |
| `src/components/match-records/MatchesGrid.vue` | 賽事卡片列表 |
| `src/components/match-records/MatchesTable.vue` | 賽事表格 |

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
| `src/components/home/MyHomeTodayPanel.vue` | 個人首頁今日摘要 |
| `src/components/layout/HolidayThemeRibbon.vue` | 全站節日橫幅 |
| `src/components/layout/HolidayThemeSiteEffects.vue` | 全站節日動畫 |
| `src/components/settings/HolidayThemePreviewStage.vue` | 後台節日預覽 |

## 10. Types

| 檔案 | 用途 |
| --- | --- |
| `src/types/dashboard.ts` | Dashboard / notification feed 型別 |
| `src/types/equipment.ts` | 裝備管理型別 |
| `src/types/leaveRequests.ts` | 我的假單型別 |
| `src/types/match.ts` | 賽事型別 |
| `src/types/myHome.ts` | 個人首頁 snapshot 型別 |
| `src/types/payments.ts` | 個人付款型別 |
| `src/types/performance.ts` | 能力 / 體測型別 |
| `src/types/publicLanding.ts` | 公開首頁 snapshot 型別 |

## 11. Supabase Migrations

| 類型 | 重要檔案 |
| --- | --- |
| 權限 / RLS | `supabase_access_control_rls_migration.sql`、`supabase_access_control_policy_cleanup_migration.sql` |
| Profile access | `supabase_profile_access_control_migration.sql`、`supabase_profiles_personal_settings_migration.sql` |
| 公開首頁 / Dashboard | `supabase_dashboard_snapshot_migration.sql`、`supabase_my_home_snapshot_migration.sql` |
| 假單 | `supabase_my_leave_requests_migration.sql` |
| 收費 / 付款 | `supabase_fees_migration.sql`、`supabase_quarterly_fees_migration.sql`、`supabase_profile_payment_submissions_migration.sql` |
| 裝備 | `supabase_equipment_management_migration.sql`、`supabase_equipment_inventory_adjustments_migration.sql`、`supabase_equipment_manual_purchase_records_migration.sql`、`supabase_equipment_multiple_photos_migration.sql` |
| 能力 / 體測 | `supabase_performance_data_migration.sql`、`supabase_performance_view_scope_migration.sql` |
| 賽事同步 | `supabase_matches_google_calendar_sync_migration.sql`、`supabase_match_calendar_daily_sync_schedule.sql` |
| 推播 | `supabase_web_push_subscriptions_migration.sql`、`supabase_push_dispatch_events_migration.sql`、`supabase_match_reminder_notifications_migration.sql` |
| 節日主題 | `supabase_holiday_theme_migration.sql` |

注意：同一 function / policy 可能在後續 migration 被覆寫。修改 DB 規則前要用 `rg` 查所有同名 function / policy。

## 12. Supabase Edge Functions

| 檔案 | 用途 |
| --- | --- |
| `supabase/functions/send-push-notification/index.ts` | Web Push 派送 |
| `supabase/functions/_shared/push.ts` | 推播共用權限與 subscription helper |
| `supabase/functions/notify-holiday-theme/index.ts` | 節日主題通知 |
| `supabase/functions/notify-holiday-theme/logic.ts` | 節日通知邏輯 |
| `supabase/functions/send-match-reminders/index.ts` | 賽事提醒 |
| `supabase/functions/sync-match-calendar/index.ts` | 賽事日曆同步 |
| `supabase/functions/leave-webhook/index.ts` | 請假 webhook |
| `supabase/functions/record-fee-remittance/index.ts` | 繳費匯款紀錄 |
| `supabase/functions/parse-lineup/index.ts` | 陣容解析 |

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
- `src/services/publicLanding.test.ts`
- `src/utils/playerSync.test.ts`
- `src/utils/pushNotifications.test.ts`
- `src/utils/googleCalendarParser.test.ts`
- `src/utils/equipmentInventory.test.ts`
- `src/utils/equipmentPricing.test.ts`
- `src/utils/equipmentRequestStatus.test.ts`
- `src/composables/useHolidayTheme.test.ts`
- `src/views/HolidayThemeSettingsView.test.ts`
- `supabase/functions/notify-holiday-theme/logic.test.ts`

驗證指令以 `AGENT.md` 的驗證矩陣為準。

## 15. 快速定位規則

- 改頁面 UI：先找 `src/views/<Feature>View.vue`，再看對應 `src/components/<feature>/*`。
- 改資料讀寫：先找 `src/services/*Api.ts` 或該功能 service，再看 store。
- 改跨頁狀態：看 `src/stores/*`。
- 改純邏輯或同步規則：看 `src/utils/*` 與同名 test。
- 改權限：看 `src/router/index.ts`、`src/stores/permissions.ts`、`RolePermissionsManager.vue`、migration。
- 改 DB 安全：先 `rg` function / policy 名稱，確認後續 migration 沒有覆寫。
- 改推播：看 `src/utils/pushNotifications.ts`、`send-push-notification`、`_shared/push.ts`。
- 改公開頁資料：優先找 public RPC，不要直接查 raw table。
