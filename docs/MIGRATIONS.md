# Migrations

本文件整理根目錄 `supabase_*.sql` 的用途與讀取順序。AI 修改 DB schema、RLS、policy、RPC、cron、storage policy 前，先讀本檔，再用 `rg` 搜同名 table / function / policy。

## 讀取規則

1. 先找功能主 migration，再找後續 hotfix / repair / `zz*` migration。
2. 同名 `create or replace function` 以最後的 hotfix 或 repair 檔為準，不要只看最早的主 migration。
3. 修改核心表前先查：`rg "function_or_policy_name" -g "*.sql"`。
4. 新 DB 變更優先新增 migration，不直接覆寫既有已部署 migration。
5. `test_db.sql`、`check_db.ts`、`check_db2.ts` 是臨時驗證入口，不是正式 migration。

## 權限與安全基礎

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_access_control_rls_migration.sql` | `has_app_permission()`、`has_any_app_permission()`、`team_members_safe`、主要 RLS 初版 | 新增 feature/action 時先看這裡 |
| `supabase_access_control_policy_cleanup_migration.sql` | 重新整理多個核心表 policy | 若 policy 名稱重複，以後續檔案為準 |
| `supabase_profile_access_control_migration.sql` | profile access state / 登入可用性 | 影響 auth store 與登入限制 |
| `supabase_profiles_personal_settings_migration.sql` | 個人設定與大頭照欄位 / RPC | 搭配 profile settings |
| `supabase_profiles_personal_settings_function_fix_migration.sql` | 個人設定 function 修正 | 覆寫個人設定 RPC 時必讀 |
| `supabase_profiles_binding_last_seen_migration.sql` | linked member / last seen 相關補強 | 影響個人功能可見性 |

## 球員、使用者與 Team Groups

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_team_members_cache_meta_migration.sql` | 名單 cache meta 與 updated_at trigger | `playerRoster` store 依賴 |
| `supabase_team_members_joined_date_migration.sql` | 球員加入日期 | Google sync 不覆蓋既有值 |
| `supabase_team_members_inactive_graduated_migration.sql` | inactive / graduated 狀態 | 影響名單篩選 |
| `supabase_zz_team_members_grade_migration.sql` | 球員年級欄位、生日預設回填與年度刷新排程 | 出生日期 9/2 以後晚一屆；名單年級每年 6/19 由 `team-member-grade-yearly-refresh` 自動升級；Google sync 不覆蓋既有人工年級 |
| `supabase_primary_payer_migration.sql` | 主要繳費人旗標 | 影響費用計算 |
| `supabase_half_price_migration.sql` | 半價旗標 | 影響費用計算與同步保護 |
| `supabase_sibling_migration.sql` | sibling / family grouping | 影響季費家庭金額 |
| `supabase_team_group_settings_migration.sql` | team group 設定 | 搭配 `teamGroupsApi` |
| `supabase_team_group_settings_reorder_migration.sql` | team group 排序 RPC | 改排序時必讀 |
| `supabase_team_group_settings_create_rpc_hotfix.sql` | team group 建立 RPC hotfix | 覆寫建立流程 |
| `supabase_team_group_rename_migration.sql` | team group 改名 / 轉移 | 改名不可留下孤兒組別 |
| `supabase_team_group_non_player_cleanup_migration.sql` | 清理非球員組別資料 | 保持 eligible role 規則 |

## 公開頁、Dashboard 與個人功能

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_dashboard_snapshot_migration.sql` | 公開 / dashboard 摘要 | 公開頁只能回去敏感資料 |
| `supabase_dashboard_today_attendance_status_migration.sql` | 今日訓練點名狀態 | `HomeView` dashboard 區塊依賴 |
| `supabase_zzzzzzzzzz_dashboard_today_attendance_events_migration.sql` | 今日訓練點名狀態多筆點名單 | 覆寫 `get_dashboard_today_attendance_status()` 回傳 `todayEvents` |
| `supabase_my_home_snapshot_migration.sql` | 個人首頁 snapshot | linked member 安全邊界 |
| `supabase_zz_my_home_training_points_migration.sql` | 個人首頁特訓點數補強 | 覆寫 / 補齊 snapshot 點數 |
| `supabase_my_home_equipment_payment_ownership_migration.sql` | 個人首頁裝備付款歸屬修正 | 裝備付款摘要必讀 |
| `supabase_my_home_next_event_match_only_hotfix.sql` | 個人首頁 Next Up 僅顯示賽程 | 避免點名單搶佔 Next Up |
| `supabase_inactive_member_visibility_migration.sql` | 關閉 / 畢業成員可見性修正 | 覆寫 `list_my_payment_members()`、`list_my_leave_members()`、`create_my_leave_requests()` 與 `get_dashboard_today_attendance_status()`，排除退隊、離隊、關閉 / 畢業成員 |
| `supabase_my_leave_requests_migration.sql` | 我的假單 RPC | 家長端請假安全入口 |
| `supabase_zzzzzzzzzzzzzzzz_leave_time_segments_migration.sql` | 單日假單全日 / 上午 / 下午時段 | 新增 `leave_requests.leave_time_segment`，覆寫我的假單 RPC、賽事假單同步、比賽費同步與今日點名摘要的時段重疊判斷；賽事判斷會優先用 `matches.match_time`，再 fallback 到 `matches.note` 的集合時間 |
| `supabase_my_player_records_migration.sql` | 我的成績 RPC | `/my-records` 不直接讀後台 matches |
| `supabase_notification_feed_rpc_migration.sql` | 通知中心 RPC 初版 | 後續多個檔案覆寫 |
| `supabase_announcement_notifications_migration.sql` | 公告通知 feed 補強 | 覆寫 `get_notification_feed()` |

## 請假、點名與特訓

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_training_points_migration.sql` | 特訓、點數、禁報、特訓點名主 migration | `/training` 主線 |
| `supabase_zz_training_point_transaction_delete_migration.sql` | 點數流水帳刪除 RPC | 只允許受控刪除 |
| `supabase_zz_training_registration_notifications_migration.sql` | 特訓報名通知 event | 搭配 Edge Function |
| `supabase_zzz_training_registration_notification_diagnostics_migration.sql` | 特訓通知診斷 | 排查通知時讀 |
| `supabase_zzzzzzzz_training_auto_select_notifications_migration.sql` | 特訓自動錄取與單筆報名 / 錄取通知 | 覆寫 training RPC 與 `get_notification_feed()` |
| `supabase_zz_training_attendance_status_hotfix.sql` | 特訓點名狀態 hotfix | 影響禁報 / 出席 / 請假 |
| `supabase_zz_training_selection_publish_hotfix.sql` | 錄取名單發布 hotfix | 公布名單與通知前讀 |
| `supabase_zz_training_hotfix_verify.sql` | 特訓 hotfix 驗證 | 驗證用 SQL |
| `supabase_training_dates_migration.sql` | 每月訓練日期設定、換月預設日期排程與日期異動通知 | `/training-dates` 主線，覆寫 `get_notification_feed()` / `get_my_home_snapshot()`，新增 `training-month-date-defaults-daily` DB cron |
| `supabase_zzzzzzzzzzzzzzzzzz_training_program_scope_migration.sql` | 訓練項目設定與 program 分流 | 新增 `training_program_settings`、`training_month_date_settings.program_key`、`training_location_sessions.program_key`、`monthly_fees.training_program`，並新增 program-aware dates / locations RPC overload |
| `supabase_zzzzzzzzzzzzzzzzzzzz_team_member_training_program_hotfix.sql` | 球員中港 / 新泰身分欄位 hotfix | 新增 `team_members.training_program` 並讓 program 判斷優先使用該欄，`team_group` 回歸所屬群組（熊隊） |
| `supabase_zzzzzzzzzzzzzzzzzzzzz_training_program_label_rename_migration.sql` | 訓練項目顯示名稱調整 | 將預設 program label 更新為「中港總部」與「新泰總部」，不修改 program key 或舊 `team_group` fallback |
| `supabase_training_locations_migration.sql` | 場地與人員配置主 migration | `/training-locations` 主線 |
| `supabase_training_locations_assignment_schema_hotfix.sql` | 場地指派 schema hotfix | 修改 assignment 前讀 |
| `supabase_zzzzzzzzz_training_location_attendance_migration.sql` | 場地配置連動點名 | 覆寫場地列表 / 儲存 RPC，新增 `attendance_events.training_location_session_id` / `training_location_session_venue_id` |
| `supabase_zzzzzzzzzz_training_location_venue_settings_migration.sql` | 場地區塊訓練設定 | 新增 `training_location_session_venues` 的標題 / 日期 / 時間欄位，覆寫場地列表、儲存、通知、個人首頁與連動點名 RPC |
| `supabase_zzzzzzzzzzz_no_fee_roster_exclusions_migration.sql` | 不收費球員 roster 排除 | 覆寫場地 roster / 儲存 / 連動點名 RPC；新場地配置與新點名排除 `fee_billing_mode = no_fee`，舊點名紀錄保留 |
| `supabase_zzzzzzzzzzzzzzzzzz_training_location_leave_time_segment_migration.sql` | 場地請假時段判斷修正 | 覆寫場地 roster、管理列表、個人首頁本週場地與場地通知 target；場地時間缺失或使用預設上午時間時以上午區段判斷，下午假不標示 / 排除上午場地 |
| `supabase_zzzzzzzzzzzzzzzzzzz_training_location_roster_all_players_hotfix.sql` | 場地配置球員池全員可選 hotfix | 覆寫 program-aware roster RPC，保留 program 標籤與半日請假判斷，但不再用目前 program 限制可編排球員 |
| `supabase_coach_schedules_migration.sql` | 教練排班表 | 新增 `coach_schedule_events` / `coach_schedule_assignments`、`coach_schedules` 權限與 Dashboard / 管理頁 RPC；候選日需搭配 `/training-dates` 與場地配置 |
| `supabase_coach_schedules_schedulable_coaches_hotfix.sql` | 可排班教練清單 hotfix | 覆寫 `list_schedulable_coaches()`，放寬 role 空白 / 中文歷史值並維持 active access 檢查 |
| `supabase_coach_schedules_training_location_sync_hotfix.sql` | 教練排班場地同步 hotfix | 場地配置區塊更新時同步已儲存 `coach_schedule_events` 的來源日期 / 時間 / 標題 / 地點快照 |
| `supabase_training_sessions_location_assignment_hotfix.sql` | 特訓 session 場地指派 hotfix | 串 training session 時讀 |
| `supabase_training_admin_registrations_location_assignment_hotfix.sql` | 管理端報名與場地指派 hotfix | 教練管理流程讀 |

## 賽事、日曆、媒體與天氣

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_matches_google_calendar_sync_migration.sql` | `google_calendar_event_id` | 日曆同步 fallback 必讀 |
| `supabase_match_calendar_daily_sync_schedule.sql` | 賽事日曆每日同步排程 | cron / Edge Function 搭配 |
| `supabase_match_record_enhancements_migration.sql` | 比賽紀錄欄位補強 | 改 match record 欄位時讀 |
| `supabase_match_tournament_name_migration.sql` | 盃賽名稱欄位 | 統計與篩選使用 |
| `supabase_match_video_url_migration.sql` | 比賽影片欄位 | media UI 使用 |
| `supabase_match_reminder_notifications_migration.sql` | 賽事提醒通知 | 覆寫 `get_notification_feed()` 可能性 |
| `supabase_match_reminder_schedule_config_migration.sql` | 賽事提醒排程設定 | `system_settings.match_reminder_schedule_config`、每分鐘 cron checker |
| `supabase_match_reminder_health_migration.sql` | 賽事提醒排程健康檢查 | `get_match_reminder_health_status()`、`matches:HEALTH_ALERT` ADMIN targeted 通知、覆寫 `get_notification_feed()` |
| `supabase_match_leave_absences_migration.sql` | 未來賽事假單請假同步 | `preview_match_leave_absences()`、`get_match_leave_absences()`、`leave_requests` / `matches` trigger，只管理 `source = 'leave_request'` 的 `matches.absent_players`；半日假單規則以後續 `supabase_zzzzzzzzzzzzzzzz_leave_time_segments_migration.sql` 為準 |
| `supabase_location_geocoding_cache_migration.sql` | 地點 geocoding cache | `resolve-location` Edge Function 使用 |

## 收費、付款、餘額與比賽費

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_fees_migration.sql` | 費用基礎表 | 月費 / 季費主線 |
| `supabase_quarterly_fees_migration.sql` | 季費 | sibling / family grouping 相關 |
| `supabase_quarterly_fees_rls.sql` | 季費 RLS 修正 | 權限問題先查 |
| `supabase_fixed_monthly_billing_migration.sql` | 社區球員固定月繳 | `fee_billing_mode` 依賴 |
| `supabase_no_fee_billing_migration.sql` | 球員 / 校隊不收費模式 | `fee_billing_mode = no_fee`，覆寫付款 RPC、比賽費同步、首頁與收費提醒摘要 |
| `supabase_zzzzzzzzzzzzzzz_monthly_per_session_billing_migration.sql` | 球員計次月費模式 | `fee_billing_mode = monthly_per_session`，覆寫繳費模式 helper、`list_my_payment_members()` 與收費提醒摘要 |
| `supabase_profile_payment_submissions_migration.sql` | 個人付款回報 | `/my-payments` 主線 |
| `supabase_profile_payment_rpc_fix_migration.sql` | 個人付款 RPC 修正 | 覆寫付款 RPC |
| `supabase_profile_payment_review_member_id_ambiguity_fix_migration.sql` | 付款審核 member_id ambiguity 修正 | 審核流程必讀 |
| `supabase_zzzzzzzz_profile_payment_review_conflict_target_hotfix.sql` | 付款審核 conflict target 修正 | 多球員季繳覆寫後的 `member_id` ambiguity 修正 |
| `supabase_zzzzzzzzzzzzz_quarterly_payment_submission_member_id_ambiguity_hotfix.sql` | 多球員季繳付款送出 member_id ambiguity 修正 | 覆寫 `create_my_quarterly_payment_submission()`，修正 `RETURNS TABLE` 欄位與 items CTE 欄位撞名 |
| `supabase_profile_payment_submission_estimate_migration.sql` | 付款估算 RPC | 家長端送出前估算 |
| `supabase_profile_payment_submission_estimate_monthly_record_migration.sql` | 月費紀錄估算補強 | 固定月繳 / 月費估算必讀 |
| `supabase_zzzzzzzz_profile_payment_estimate_training_dates_migration.sql` | 付款估算訓練日期補強 | 月繳本月堂數改以 `/training-dates` 設定天數計算 |
| `supabase_zzzzzzzzzzzzzzzzz_monthly_fee_leave_time_segment_migration.sql` | 計次月費假單時段修正 | 月費試算 / 家長端付款估算只把訓練日期內的全日、上午假單列為請假扣減；下午假不扣計次月費 |
| `supabase_player_balance_transactions_migration.sql` | 球員餘額流水帳與付款 RPC 覆寫 | 餘額權威主線 |
| `supabase_inactive_member_visibility_migration.sql` | 關閉 / 畢業成員繳費名單修正 | `list_my_payment_members()` 不回傳退隊、離隊、關閉 / 畢業成員 |
| `supabase_quarterly_fee_compensation_migration.sql` | 季費堂數不足補償 | 產生待審核補償單，核准後寫入球員餘額 |
| `supabase_zzzzzzzzzzzz_quarterly_payment_open_period_migration.sql` | 季繳付款回報開放期別 | 每季最後一個月 25 日起開放下一季；覆寫付款估算 RPC，新增付款回報 trigger 防止未開放未來季寫入 |
| `supabase_zzzzzzzzzzzzzz_monthly_payment_open_period_migration.sql` | 月繳付款回報開放期別 | 計次月費只開放已結束月份；固定月繳球員每月 25 日起開放下月，並以 trigger 防止未開放月份寫入 |
| `supabase_match_fees_migration.sql` | 比賽費 items / submissions | 比賽費與餘額整合 |
| `supabase_fee_management_reminders_migration.sql` | 費用提醒與通知中心 | 覆寫 `get_notification_feed()` |

## 裝備

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_equipment_management_migration.sql` | 裝備主線 tables / RPC / policies | 最早主線，後續多個檔案覆寫 |
| `supabase_equipment_inventory_adjustments_migration.sql` | 庫存調整 | 庫存流水帳 |
| `supabase_equipment_manual_purchase_records_migration.sql` | 手動購買紀錄 / 付款 RPC 覆寫 | 裝備付款前讀 |
| `supabase_equipment_multiple_photos_migration.sql` | 多照片欄位 | storage / carousel 使用 |
| `supabase_equipment_admin_addons_migration.sql` | 管理端加購 | 後台代建申請 |
| `supabase_equipment_jersey_numbers_migration.sql` | 裝備背號 | 球衣類資料 |
| `supabase_equipment_notification_feed_migration.sql` | 裝備通知 feed | 覆寫 `get_notification_feed()` |
| `supabase_equipment_pending_request_payment_items_migration.sql` | 待付款申請項目 | `/my-payments` 裝備付款 |
| `supabase_equipment_payment_submission_uuid_fix_migration.sql` | 裝備付款 UUID 修正 | 付款紀錄關聯 |
| `supabase_equipment_purchase_request_create_inventory_guard_migration.sql` | 建立申請庫存 guard | 避免超賣 |
| `supabase_equipment_purchase_request_inventory_guard_migration.sql` | 審核申請庫存 guard | 避免超賣 |
| `supabase_equipment_transaction_delete_guard_migration.sql` | 裝備交易刪除 guard | 保護庫存一致 |
| `supabase_zzzzz_equipment_pickup_payment_status_migration.sql` | 領取 / 付款狀態補強 | 加購流程必讀 |
| `supabase_zzzzz_equipment_unpaid_reminder_body_migration.sql` | 未付款提醒文案 | 通知文案 |
| `supabase_zzzzzz_equipment_unpaid_reminder_link_migration.sql` | 未付款提醒連結 | click target |
| `supabase_zzzzzz_equipment_unpaid_payment_review_migration.sql` | 未付款審核補強 | 審核流程 |
| `supabase_zzzzzz_equipment_payment_submission_status_fix_migration.sql` | 裝備付款狀態 RPC 覆寫 | 裝備付款最新狀態 |
| `supabase_zzzzzz_equipment_inventory_snapshot_rpc_migration.sql` | 庫存 snapshot RPC | 家長端剩餘量顯示 |
| `supabase_zzzzzz_li_jinyi_equipment_payment_repair.sql` | 特定付款資料修復 | 資料修復，不當成通用 schema |
| `supabase_zzzzzzz_equipment_payment_payable_scope_fix_migration.sql` | 裝備付款可付範圍修正 | 早期付款 scope，後續仍有覆寫 |
| `supabase_zzzzzzzz_equipment_ready_for_pickup_payment_scope_migration.sql` | 裝備已備貨即可付款 | 覆寫裝備付款 scope，`ready_for_pickup` / `picked_up` 皆可付款 |
| `supabase_zzzzzzzzz_equipment_custom_order_migration.sql` | 裝備訂製品欄位 / snapshot RPC 覆寫 | 家長端等待提示 |
| `supabase_zzzzzzzzzz_equipment_approved_payment_scope_migration.sql` | 裝備已核准即可付款 | 覆寫裝備付款 scope，`approved` / `ready_for_pickup` / `picked_up` 皆可付款 |
| `supabase_zzzzzzzzzzz_equipment_payment_refund_migration.sql` | 裝備退款 / 作廢收款 | 新增 `refunded` 狀態、餘額反向流水與刪除 guard 放行 |
| `supabase_zzzzzzzzzzzz_equipment_create_request_inventory_guard_transaction_fix_migration.sql` | 建立申請庫存 guard 交易扣庫存修正 | 建立請購時，已轉成 `equipment_transactions` 的請購項目不可再被當保留庫存扣一次 |

## 廠商

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_vendor_management_migration.sql` | 廠商名單 tables / RLS / private storage policies | `/vendors` 主線；只預設 `ADMIN` 的 `vendors` 權限，交易類別刪除不跟著刪廠商 |

## 能力、體測、節日與推播

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_performance_data_migration.sql` | 能力 / 體測資料表與 RPC | performance 主線 |
| `supabase_performance_view_scope_migration.sql` | performance 可見範圍修正 | linked member 唯讀 |
| `supabase_holiday_theme_migration.sql` | 節日主題設定與通知 | public RPC / save RPC |
| `supabase_web_push_subscriptions_migration.sql` | Web Push subscription | 前端訂閱 / Edge Function |
| `supabase_web_push_subscription_claim_rpc_migration.sql` | subscription claim RPC | 多裝置 / 登入後認領 |
| `supabase_push_dispatch_events_migration.sql` | 通知事件去重 | 多個通知來源共用 |

## 維運與效能

| 檔案 | 用途 | 注意事項 |
| --- | --- | --- |
| `supabase_z_disk_io_optimization_migration.sql` | cache meta / notification feed / 效能補強 | 可能覆寫 function |
| `supabase_zzzz_disk_io_safety_cleanup_migration.sql` | disk IO 安全 cleanup | 維運類 |
| `test_db.sql` | 臨時驗證 SQL | 不當成正式 migration |
