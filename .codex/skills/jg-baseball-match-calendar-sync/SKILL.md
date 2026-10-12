---
name: jg-baseball-match-calendar-sync
description: "Match calendar sync workflow for jg-base-ball-community-app. Use when changing Google Calendar or iCal parsing, match import or update rules, sync planning, or `google_calendar_event_id` fallback behavior. Trigger on requests about 賽事同步、Google 行事曆、iCal、比賽匯入、`src/utils/googleCalendarParser.ts`、`src/services/matchesApi.ts`、`google_calendar_event_id`、或 MatchRecords sync UI。"
---

# JG Baseball Match Calendar Sync

## Overview

用這個 skill 處理 Google Calendar 與 iCal 的賽事同步。把 parser、payload 生成、既有資料比對、與 schema 相容 fallback 視為同一組契約來維護。

## 讀取順序

1. 先讀 `AGENTS.md`。
2. 讀 `src/utils/googleCalendarParser.ts` 與 `src/utils/googleCalendarParser.test.ts`。
3. 讀 `src/services/matchesApi.ts` 與 `src/services/matchesApi.test.ts`。
4. 再讀 `src/types/match.ts` 與實際同步 UI，例如 `MatchRecordsView`、`SyncCalendarDialog`。
5. 若牽涉 schema，補讀 `supabase_matches_google_calendar_sync_migration.sql` 與相關 migration。

## 不可破壞規則

- 保留 `matchesApi` 對 `google_calendar_event_id` 缺欄或 schema cache 未更新時的 fallback 行為。
- 先用 `google_calendar_event_id` 比對既有資料，再用日期 + 開始時間 + 標題 fallback 比對。
- 同步重新建立已刪除賽事時可能取得新的 `matches.id`；`supabase_zzz_coach_schedule_match_source_integrity_migration.sql` 必須在刪除舊賽事時同步清掉舊 UUID 的教練排班，不可改用日期或標題合併新舊排班。
- 讓同步規劃維持在 `create`、`update`、`skip` 三種結果。
- 已取消賽事（`cancelled_at` 有值）只要由 UID 或既有 fallback 比對到，就回傳不阻擋其他項目的 `skip`，payload 為空並提示保留原紀錄；即使外部日期、地點或球員改變，也不可 update、重建 ID 或恢復賽事。手動與自動同步共用此 planner，發布時須同步更新前端與 `sync-match-calendar` Edge Function。
- 寫入時仍須原子檢查 `cancelled_at IS NULL`，防止規劃完成後才取消的競態；手動同步透過 store/API 傳 `requireActive: true`，不可因舊 schema 快取或 optional-column fallback 移除條件。缺欄必須失敗，不可無條件更新。手動零列更新須重讀確認取消才略過；排程零列更新計入 `skipped_count`，不得轉為新增，其他正常項目繼續同步。
- 只有使用者經 `restore_match()` 明確恢復後，才重新以原 UID／fallback 納入正常同步；沿用同一 match ID，不在同步器清除取消。測試需包含取消→恢復→正常更新→再次取消略過。
- 修改 payload 生成時，保留 lineup、缺席名單、note 與 Google Calendar 來源資訊。
- 不收費（`no_fee`）球員 / 校隊仍參與姓名及背號比對，並保留於參賽名單與 lineup；比賽費排除由 DB 負責，不得在 parser 因收費模式移除參賽者。修改共用 parser 後，前端與匯入它的 `sync-match-calendar` Edge Function 需於發布時同步更新。
- 需要 schema 變更時，新增 migration，不要重寫舊 migration。

## 工作流程

1. 先解析 iCal 文字或 URL，確認 event 基本欄位齊全。
2. 用 `createMatchRecordInput()` 產出穩定 payload。
3. 用 `planCalendarSync()` 對既有賽事做 create/update/skip 規劃。
4. 改動 matching 或 parsing 規則前，先想清楚 rerun 後是否仍能正確 skip。
5. 改到欄位對應或 fallback 時，先補測試再改實作。

## 驗證

- 跑 `pnpm exec vitest run src/utils/googleCalendarParser.test.ts`。
- 跑 `pnpm exec vitest run src/services/matchesApi.test.ts`。
- 改到同步寫入時，跑 `src/components/match-records/SyncCalendarDialog.test.ts`、`src/stores/matches.test.ts`、`supabase/functions/sync-match-calendar/index.test.ts`；包含規劃後取消、重試仍受保護、正常項目繼續與真正錯誤不被吞掉。
- 需要時再跑 `pnpm exec vue-tsc --noEmit`。
