# AI Skills Index

本檔用來說明此 repo 內可共用的 AI skills，方便提交到 GitHub 後由其他開發人員與 AI / Agent 一起使用。

## 位置

- skills 目錄：`.codex/skills/`
- 每個 skill 的主檔：`<skill-name>/SKILL.md`

## 使用原則

- 若使用 Codex，任務命中對應情境時，優先讀該 skill 的 `SKILL.md` 再開始修改。
- 若使用其他 AI 工具，這些 skill 不一定會自動觸發，但仍可把 `SKILL.md` 當成專案工作規範與提示模板。
- skill 內容屬於專案知識的一部分，應跟程式碼一起版本化維護。
- 若功能流程、資料流或安全規則變更，請同步更新對應 skill。
- 新增 route-level 頁面或新功能域時，必須建立或更新對應 skill；若決定併入既有 skill，要在相關文件或回報中說明原因。

## Skills

### `jg-baseball-project-workflow`

- 路徑：`.codex/skills/jg-baseball-project-workflow/SKILL.md`
- 用途：本專案通用工作入口，適合大多數 Vue / Supabase 功能修改。
- 典型情境：頁面調整、store / service / composable / utils 修改、migration、Edge Function、PWA 問題；`/my-records` 我的成績頁併入此通用 workflow，不另外新增 skill。

### `jg-baseball-auth-permissions`

- 路徑：`.codex/skills/jg-baseball-auth-permissions/SKILL.md`
- 用途：登入、角色、路由守衛、權限控制。
- 典型情境：新增受保護頁面、調整 `router meta`、按鈕顯示權限、敏感資料可見性；個人成績頁的全隊切換需確認 `players:VIEW` 與 RPC 安全邊界。

### `jg-baseball-player-sync`

- 路徑：`.codex/skills/jg-baseball-player-sync/SKILL.md`
- 用途：球員同步、Google Form / Sheet 匯入、去重與收費旗標保護。
- 典型情境：調整 roster sync、修改 `team_members` 匯入邏輯、保留 `is_primary_payer` / `is_half_price` / `fee_billing_mode`。

### `jg-baseball-push-notifications`

- 路徑：`.codex/skills/jg-baseball-push-notifications/SKILL.md`
- 用途：推播入口、收件對象權限、事件去重。
- 典型情境：新增通知事件、調整 `eventKey`、修改 `send-push-notification` 與 `push_dispatch_events` 流程。

### `jg-baseball-match-calendar-sync`

- 路徑：`.codex/skills/jg-baseball-match-calendar-sync/SKILL.md`
- 用途：Google Calendar / iCal 賽事同步與 parser 規則。
- 典型情境：調整 `google_calendar_event_id` fallback、修改比賽匯入、更新 sync UI。

### `jg-baseball-training`

- 路徑：`.codex/skills/jg-baseball-training/SKILL.md`
- 用途：特訓報名、球員點數、教練錄取、特訓點名與禁報流程。
- 典型情境：修改 `/training`、`training_session_settings`、`training_registrations`、`player_point_transactions`、`training_no_show_blocks`、特訓快速發放點數、或 `attendance_events.training_session_id` 串接。

### `jg-baseball-equipment-management`

- 路徑：`.codex/skills/jg-baseball-equipment-management/SKILL.md`
- 用途：裝備管理、家長加購、請購審核、領取、裝備付款回報。
- 典型情境：修改 `/equipment`、`/equipment-addons`、`equipment_transactions`、`equipment_purchase_requests`、`equipment_payment_submissions`、裝備 storage 或相關推播。

### `jg-baseball-performance-data`

- 路徑：`.codex/skills/jg-baseball-performance-data/SKILL.md`
- 用途：棒球能力數據、體能測驗數據、趨勢頁、手動 CRUD 與家長/球員唯讀檢視。
- 典型情境：修改 `/baseball-ability`、`/physical-tests`、`baseball_ability_records`、`physical_test_records`、`get_baseball_ability_records`、`get_physical_test_records`、或 `baseball_ability` / `physical_tests` 權限。

### `jg-baseball-holiday-theme`

- 路徑：`.codex/skills/jg-baseball-holiday-theme/SKILL.md`
- 用途：節日主題設定、全站動畫、首頁/後台節日 hero、橫幅與節日推播。
- 典型情境：修改 `/holiday-theme-settings`、`holiday_theme_config`、`get_public_holiday_theme_config()`、`save_holiday_theme_config(jsonb)`、`notify-holiday-theme`、或 `holiday_theme_settings` / `holiday_theme` 權限。

## 維護建議

- 新增 skill 前，先確認能否併入既有 skill，避免過度切碎。
- skill 名稱保持穩定，避免頻繁 rename 造成引用混亂。
- 若只是一次性小調整，不一定要建新 skill；但新增 route-level 頁面、新 feature key、或新的資料/RPC 流程時，預設要有對應 skill 或明確併入既有 skill。
## Security Boundary Update

- 前端 `permissionsStore.can()` 與路由守衛不能取代 DB 權限；skill 若牽涉敏感資料，必須檢查 RLS / RPC 是否同步到位。
- 公開頁面預設只能讀公開安全摘要，不能直接查 `profiles`、`team_members`、`leave_requests`、`announcements`、`attendance_*`、`matches` 等 raw table。
- email 登入前檢查必須走 `can_request_magic_link()`；不要再匿名 `select profiles`.
- `team_members_safe` 現在是去敏感欄位的預設讀路徑；若實作需要完整個資，必須明確確認 `players:EDIT` 與 DB policy。
- 之後若 skill 指引有提到權限或敏感資料讀取，請把 DB helper / policy 名稱一起寫清楚，例如 `has_app_permission()`、`has_any_app_permission()`、`get_public_landing_snapshot()`。
