---
name: jg-baseball-leave-attendance
description: "Leave request, attendance event, roll call, dashboard attendance summary, training attendance link, and leave webhook workflow for jg-base-ball-community-app. Use when changing /my-leave-requests, /leave-requests, /attendance, /attendance/:id, MyLeaveRequestsView, LeaveRequestsView, AttendanceListView, RollCallView, leaveRequests utils, myLeaveRequests service, attendance_events, attendance_records, leave_requests, leave-webhook, get_dashboard_today_attendance_status, or training attendance no-show behavior."
---

# JG Baseball Leave Attendance

## Overview

用這個 skill 處理家長 / 球員請假、後台請假管理、點名事件、單場點名、今日點名摘要、請假 webhook，以及特訓點名與禁報的交界。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「請假與點名」
3. `docs/FILE_MAP.md`
4. `src/views/MyLeaveRequestsView.vue`
5. `src/views/LeaveRequestsView.vue`
6. `src/views/AttendanceListView.vue`
7. `src/views/RollCallView.vue`
8. `src/services/myLeaveRequests.ts`
9. `src/services/dashboardAttendance.ts`
10. `src/utils/leaveRequests.ts`
11. `src/types/leaveRequests.ts`
12. `supabase_my_leave_requests_migration.sql`
13. `supabase_match_leave_absences_migration.sql`
14. `supabase_dashboard_today_attendance_status_migration.sql`
15. `supabase/functions/leave-webhook/index.ts`
16. 若改到特訓點名或禁報，再讀 `jg-baseball-training` skill
17. 若改到推播或通知中心，再讀 `jg-baseball-push-notifications` skill

## 功能邊界

- 家長 / 球員自己的請假走 `myLeaveRequests` RPC，不直接寫 raw table。
- 後台請假管理在 `/leave-requests`，feature key 為 `leave_requests`。
- `leave_requests.leave_time_segment` 是請假時段權威欄位：`full_day` / `morning` / `afternoon`。新增假單預設 `full_day`；半日只套用單日請假。比賽、比賽費、點名預設若有事件時間要用時段重疊判斷，時間不明視為全日；比賽時間優先取 `matches.match_time`，再 fallback 到 `matches.note` 的集合時間 / 比賽時間 / 開打時間。
- 月費計次請假扣減以訓練日期為基準，只有 `full_day` / `morning` 會扣一堂；`afternoon` 不扣計次月費。
- 點名事件使用 `attendance_events`，單場紀錄使用 `attendance_records`。
- `/attendance/:id` 顯示單場點名 detail。
- 今日訓練點名狀態走 `get_dashboard_today_attendance_status()`，需支援同一天多筆點名單，只給 `leave_requests:VIEW` 使用者顯示。
- `leave-webhook` 可接 Google Form / 外部請假來源，並可能建立推播事件。
- 今日 / 未來賽事會依 `leave_requests` trigger 同步 `matches.absent_players` 中 `source = 'leave_request'` 的請假列；手動請假列不受假單刪除影響。

## 不可破壞規則

- `/attendance/:id` 的 Detail UI 不可顯示或提供 `缺席` 操作；只保留 `出席`、`請假` 等允許操作。
- 若需要處理既有缺席資料或特訓禁報，必須走明確管理流程，不把 `缺席` 按鈕直接放回 Detail。
- 家長端只能為自己的 linked member 建立 / 刪除請假。
- 後台頁面顯示權限不能取代 DB RLS / policy。
- 改請假日期、假別、點名狀態時，要檢查通知中心、推播、今日摘要、費用統計、未來賽事假單同步與特訓禁報是否受影響。
- 點名與請假統計涉及 `team_group` 時，要讀 `jg-baseball-roster-users-team-groups` skill。

## 工作流程

1. 判斷修改點是我的請假、後台請假、點名列表、點名 detail、webhook、dashboard 摘要或特訓點名。
2. 先確認路由權限與 RPC/RLS 安全邊界，再改 UI。
3. 若改請假資料 shape，同步更新 `src/types/leaveRequests.ts`、service normalize 與相關表單。
4. 若改點名狀態，同步確認 `AttendanceListView`、`RollCallView`、特訓點名 RPC 與費用/摘要的使用方式。
5. 若改 webhook，確認 secret、payload normalize、member match、event key 與推播收件權限。

## 驗證

- 基本檢查：`pnpm exec vue-tsc --noEmit`
- 請假工具：`pnpm exec vitest run src/utils/leaveRequests.test.ts`
- 若改 dashboard 摘要：`pnpm exec vitest run src/utils/dashboardHome.test.ts`
- 人工 sanity check：家長 linked member 請假、後台新增/刪除、點名 detail 無缺席按鈕、今日摘要權限、特訓點名禁報交界。
