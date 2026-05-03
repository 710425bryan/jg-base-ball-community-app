---
name: jg-baseball-training
description: "Training registration and player points workflow for jg-base-ball-community-app. Use when changing 特訓報名、球員點數、/training、training_session_settings、training_registrations、player_point_transactions、training_no_show_blocks、特訓點名、禁報、或 attendance_events.training_session_id 串接。"
---

# JG Baseball Training Workflow

## Overview

用這個 skill 處理特訓報名、球員點數、教練錄取、特訓點名與禁報流程。這個功能橫跨 `/training`、`matches.match_level = '特訓課'`、training tables、點名 tables 與 `training` feature/action 權限。

## 必讀檔案

1. `AGENT.md`
2. `docs/PROJECT_LOGIC.md` 的「特訓報名與球員點數」
3. `docs/FILE_MAP.md`
4. `src/views/TrainingView.vue`
5. `src/services/trainingApi.ts`
6. `src/types/training.ts`
7. `src/utils/training.ts`
8. `src/utils/trainingRegistrationNotification.ts`
9. `supabase_training_points_migration.sql`
10. 若改到報名開始通知，再讀 `supabase/functions/send-training-registration-notifications/index.ts`、`src/composables/useNotificationFeed.ts`
11. 若改到點名或缺席禁報，再讀 `src/views/RollCallView.vue`、`src/views/AttendanceListView.vue`

## 功能邊界

- 特訓活動主體沿用 `matches`，以 `match_level = '特訓課'` 識別。
- 報名設定存在 `training_session_settings`。
- 報名紀錄存在 `training_registrations`。
- 點數流水帳存在 `player_point_transactions`，不可直接更新餘額欄位。
- 禁報紀錄存在 `training_no_show_blocks`。
- 特訓點名透過 `attendance_events.training_session_id` 串接。
- 報名開始通知以 `push_dispatch_events` 去重，通知中心 source 為 `training`。

## 權限規則

- `training:VIEW` 可讓管理者或 linked member 進入 `/training` 查看允許資料。
- 教練管理與點數管理只給具備 `training:CREATE`、`training:EDIT`、`training:DELETE` 任一管理權限者。
- 一般成員、家長或只有 `training:VIEW` 的使用者，只能看到個人報名、點數與錄取狀態，不可看到教練管理或點數發放工具。
- 前端顯示控制只是 UX；資料安全必須由 RLS / policy / security definer RPC 驗證。

## 報名流程

- 個人報名只呼叫 `create_training_registration(p_session_id, p_member_id, p_note)`。
- 取消報名只呼叫 `cancel_training_registration(p_registration_id)`。
- DB 端必須檢查 linked member、報名時間窗、手動狀態、點數與禁報狀態。
- 已取消、未錄取、已扣點等狀態不得顯示不合適的取消操作。
- 錄取名單公布前，一般使用者不可看到名單；公布後只能看到非敏感欄位。
- 報名開始時間到達且狀態為 `open` 時，排程 Edge Function 送出特訓課通知；通知必須同時進通知中心與 Web Push。
- 特訓通知 event key 使用 `training_registration_open:<session_id>:<registration_start_at>`，避免排程每 5 分鐘重複派送。

## 教練管理流程

- 報名設定新增 / 更新走 `upsert_training_session_settings(...)`。
- 沒有特訓資料時，教練可用 `create_training_match_with_settings(...)` 建立 `matches` + `training_session_settings`。
- 新增特訓課預設上課時間為 `09:00 - 11:00`，地點為 `中港國小`。
- 上課時間輸入使用 Element Plus 時間範圍元件，送出仍存成 `matches.match_time` 字串。
- 錄取、候補、未錄取走 `review_training_registration(...)`。
- 公布名單走 `publish_training_selection(...)`。

## 點數管理流程

- 手動發放或調整點數只呼叫 `grant_player_points(uuid[], integer, text)`。
- 前端可提供大量發放操作：全隊、角色、組別快速選取，以及常用點數 / 原因 preset。
- 快速操作只負責填入 `member_ids`、`delta`、`reason`，不可繞過 RPC 直接寫 `player_point_transactions`。
- 負數調整必須避免讓可用點數低於已保留點數，這個檢查在 DB RPC 中維持。
- 點數餘額由 `get_player_point_balance()` 與 `get_player_reserved_training_points()` 推導，不新增前端自算權威餘額。

## 點名與禁報

- 特訓點名單由 `create_training_attendance_event(p_session_id)` 建立，只帶入已錄取球員。
- 點名狀態套用到 `apply_training_attendance_result(p_event_id, p_member_id, p_status)`。
- 後端缺席狀態會建立下一場特訓禁報；改為 `出席` 或 `請假` 時解除同一次 active block。
- `/attendance/:id` 點名 Detail（`RollCallView`）不可顯示或提供 `缺席` 操作；若未來需要套用缺席 / 禁報，必須另設明確管理流程，不可直接把 `缺席` 按鈕放回 Detail。
- 自動化 `process_training_session_automation(p_today)` 會正式扣點、釋放過期禁報、結案過去特訓。

## UI 規則

- `/training` 使用 `AppPageHeader`。
- 特訓報名留在個人入口；不要在桌機主團隊 nav 重複放一個入口。
- 管理 tab 不顯示給一般成員。
- 大量發放點數時，畫面需清楚顯示已選人數，避免誤發。
- 表單使用 Element Plus 元件；時間、日期、數字欄位用對應元件，不用純文字輸入取代。

## 驗證

- 基本檢查：`pnpm exec vue-tsc --noEmit`
- 改 `src/utils/training.ts` 時跑：`pnpm exec vitest run src/utils/training.test.ts`
- 改 migration / RPC 時，至少人工檢查對應 grant、RLS、policy、function 回傳欄位與前端 service/type 是否一致。
- 改點名串接時，人工 sanity check：建立特訓點名單、點名缺席建立禁報、出席 / 請假解除禁報。

## 文件同步

- 修改 `/training` route、feature/action、資料表、RPC、點名串接、點數規則時，同步更新 `AGENT.md`、`docs/PROJECT_LOGIC.md`、`docs/FILE_MAP.md` 與 `AI_SKILLS.md`。
- 若新增另一個 route-level 頁面，依專案規則建立或更新對應 skill。
