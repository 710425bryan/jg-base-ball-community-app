---
name: jg-baseball-coach-leave
description: 教練本人與管理請假、排班移除稽核及教練請假 Outbox 通知的專案流程，與球員假單分開。
---

# 教練請假

## 讀取入口

先讀 `AGENTS.md`、`docs/PROJECT_LOGIC.md`、`docs/MIGRATIONS.md`。依任務定位：

- UI / service：`src/views/CoachLeaveRequestsView.vue`、`src/components/coach-leave/CoachLeaveRequestDialog.vue`、`CoachLeaveDateSelection.vue`、`src/services/coachLeaveRequestsApi.ts`、`src/types/coachLeaveRequest.ts`、`src/utils/coachLeaveRequests.ts`、`coachLeaveDateSelection.ts`。
- DB：`supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql`；新增四模式批次建立需追加 `20261002155846_coach_leave_batch_create_and_training_dates.sql`，不可覆寫已部署核心。
- 通知：`supabase/migrations/20261002150855_coach_leave_notification_outbox.sql`、`supabase/functions/process-coach-leave-notification-outbox/*`、`src/composables/useNotificationFeed.ts`。
- 跨到排班規則、候選或範本時，同步讀 `../jg-baseball-coach-schedules/SKILL.md`；角色設定或推播改動再讀其專案 skill。

## 身分與權限

- `/my-coach-leave-requests` 使用 `my_coach_leave_requests`，只限有效教練 profile 本人；`/coach-leave-requests` 使用 `coach_leave_requests`，依管理 permission 操作所有教練。
- 兩 feature 都有 VIEW / CREATE / EDIT / DELETE。本人 CRUD 預設給 COACH / HEAD_COACH，全隊管理 CRUD 預設只給 ADMIN，其他角色須透過角色設定開啟。ADMIN 非教練時不作本人假單 owner。
- 綁定 `profiles.id`，不使用 `team_members`、教練姓名或 linked member 推導所有權。球員假單仍走原本 `leave_requests`，教練假單不參與球員點名或收費。
- `SCHEDULINGCOACH`（排班教練）沿用共用 active／access window 教練資格；本人與管理假單仍須各自 feature/action，不因成為排班候選自動取得權限。通知的排班 VIEW 分支也採同一 helper，不能再另外硬編碼兩種教練而漏掉排班教練。
- 有排班 VIEW 的教練可接收原因被移除的請假通知，但不因此取得假單管理或私人原因讀取權限。

## RPC 與保存語意

- `list_coach_leave_requests(p_month,p_status,p_coach_profile_id,p_manage)` 回傳 `{leaves,coaches}`。本人只讀自己的紀錄、不回傳任意 profile 列表；管理 coaches 為有效教練。月份 null 表示不限制月份，支援通知 deep link 定位。
- 新增四種模式與我的球員假單一致：上課日期快選（預設）、單日、連續多日、固定週期；教練一次選一人，快選可追加月份與保留多選。`list_coach_leave_training_dates(p_month,p_manage)` 只回有效訓練項目的 key / label / dates，VIEW 授權；不回備註、不用 linked member 推導教練項目，未載入日期不可臆造快選來源。
- `create_coach_leave_requests(p_leaves,p_manage,p_batch_id)` 原子新增最多 365 筆同一教練假單，逐筆重用單筆保存規則；固定週期及快選展開單日，可選上午 / 下午，連續跨日限定全日。任一失敗全部 rollback 含指派、audit、Outbox；actor / batch UUID receipt 與正規化內容防重送，同內容回原 IDs、不同內容拒絕。表單送出失敗後保留內容與 UUID；使用者改內容時換 UUID，不能重試恢復已取消的假單。
- `save_coach_leave_request(p_leave,p_manage,p_request_id)` 新增 / 修改；`p_leave` 包含 ID、updated_at、管理用 coach_profile_id、日期、time_segment、reason。新增 client UUID 在重試期間保持固定以去重。修改不更換教練，過期版本拒絕；cancelled/已結束假單唯讀；進行中的多日假可取消，修改提交今天起範圍並保留原範圍 audit。
- `cancel_coach_leave_request(p_leave_id,p_updated_at,p_manage)` 使用 DELETE 權限，soft-cancel 並保留歷史；相同已成功取消的重試不重複事件。
- 台灣今天起可新增 / 修改 / 取消；多日限全日，單日可 full_day / morning / afternoon，13:00 分界採半開區間。原因選填最多 500 字，僅本人或有管理 VIEW 的使用者可讀。新的受保護表沒有 authenticated raw SELECT/DML，全部透過 RPC。
- Create/edit 在排班共用 advisory lock 的同一交易內實際刪除重疊的今日起正常指派，保留活動與其他教練，存 `private.coach_leave_audit` / `private.coach_schedule_assignment_changes` 並推進排班版本。取消 / 縮小範圍不還原，需管理者重新指派。
- 未知活動時間保守視為全日；排班 source 改期/延長也重查請假。排班顯示移除紀錄不包含原因，不能把 private audit 開放給一般排班 viewer。

## 通知與部署界線

- 每個成功異動同交易 Outbox key：`coach_leave:<UUID>:<revision>:created|updated|cancelled`。revision 新增 1、有效異動 +1，重試不重送。`coach_leave_payload` 只含身份、日期、區段、操作和 revision。
- 通知 title/body 包含教練、日期、區段、操作，不包含原因；取消明確寫「已取消請假，可重新安排排班」。
- Active ADMIN、`coach_leave_requests:VIEW` 使用者及具有 `coach_schedules:VIEW` 的教練為 audience。初始化、每次重試和 feed 共用資格判斷，權限被收回後不得派送；沒有 subscription 仍可顯示通知中心。
- 管理者 URL 是 `/coach-leave-requests?highlight_leave_id=...`，排班教練是 `/coach-schedules?month=YYYY-MM`。不可把本人或排班 VIEW當成管理原因權限。
- 先部署 core migration，再通知 migration、專屬 worker 與 cron；本地測試不代表 remote migration、推播或排程部署成功。
- SQL Editor 必須完整執行各檔的 BEGIN→COMMIT。通知 migration 會先檢查 core 表／RPC／payload；42703 缺 `coach_leave_payload` 先確認第一份已成功，不能只補欄位當成完整安裝。失敗交易先 rollback，再按順序執行未成功的檔案；已成功 migration 不整份重跑，尤其不能重新搬移通知 feed。

## 驗證

- 最貼近前端測試：`pnpm exec vitest run src/utils/coachLeaveRequests.test.ts src/utils/coachLeaveDateSelection.test.ts src/services/coachLeaveRequestsApi.test.ts src/views/CoachLeaveRequestsView.test.ts src/components/coach-leave/CoachLeaveRequestDialog.test.ts src/components/coach-leave/CoachLeaveDateSelection.test.ts`。
- DB：`pnpm test:coach-schedules:sql`，包含來源 / 合班、本人與管理權限、日期與半日重疊、實際移除與取消不還原、過期版本、重試、防 raw DML / reason 洩漏、Outbox / feed / 權限撤回。
- `pnpm typecheck`；高整合風險依 `AGENTS.md` 跑完整 check。隔離 PGlite 不驗證真正多連線競爭，正式上線前需 staging PostgreSQL 驗證鎖次序和來源變更競爭。
