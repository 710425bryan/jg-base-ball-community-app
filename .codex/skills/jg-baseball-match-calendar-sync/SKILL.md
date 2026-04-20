---
name: jg-baseball-match-calendar-sync
description: "Match calendar sync workflow for jg-base-ball-community-app. Use when changing Google Calendar or iCal parsing, match import or update rules, sync planning, or `google_calendar_event_id` fallback behavior. Trigger on requests about 賽事同步、Google 行事曆、iCal、比賽匯入、`src/utils/googleCalendarParser.ts`、`src/services/matchesApi.ts`、`google_calendar_event_id`、或 MatchRecords sync UI。"
---

# JG Baseball Match Calendar Sync

## Overview

用這個 skill 處理 Google Calendar 與 iCal 的賽事同步。把 parser、payload 生成、既有資料比對、與 schema 相容 fallback 視為同一組契約來維護。

## 讀取順序

1. 先讀 `AGENT.md`。
2. 讀 `src/utils/googleCalendarParser.ts` 與 `src/utils/googleCalendarParser.test.ts`。
3. 讀 `src/services/matchesApi.ts` 與 `src/services/matchesApi.test.ts`。
4. 再讀 `src/types/match.ts` 與實際同步 UI，例如 `MatchRecordsView`、`SyncCalendarDialog`。
5. 若牽涉 schema，補讀 `supabase_matches_google_calendar_sync_migration.sql` 與相關 migration。

## 不可破壞規則

- 保留 `matchesApi` 對 `google_calendar_event_id` 缺欄或 schema cache 未更新時的 fallback 行為。
- 先用 `google_calendar_event_id` 比對既有資料，再用日期 + 開始時間 + 標題 fallback 比對。
- 讓同步規劃維持在 `create`、`update`、`skip` 三種結果。
- 修改 payload 生成時，保留 lineup、缺席名單、note 與 Google Calendar 來源資訊。
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
- 需要時再跑 `pnpm exec vue-tsc --noEmit`。
