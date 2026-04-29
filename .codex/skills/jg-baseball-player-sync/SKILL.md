---
name: jg-baseball-player-sync
description: "Player roster sync workflow for jg-base-ball-community-app. Use when changing Google Form or Google Sheet player sync, roster imports, deduplication, fee flag handling, or member upsert behavior. Trigger on requests about 球員同步、Google 表單、Google Sheet、名單匯入、`src/utils/playerSync.ts`、`team_members`、`is_primary_payer`、`is_half_price`、或 sync dedupe 規則。"
---

# JG Baseball Player Sync

## Overview

用這個 skill 處理球員名單同步與匯入規則。把「保留人工維護欄位」與「同步去重」視為不可破壞的核心契約。

## 讀取順序

1. 先讀 `AGENT.md`。
2. 讀 `src/utils/playerSync.ts` 與 `src/utils/playerSync.test.ts`。
3. 再讀實際發起同步的 `view`、`service`、`script` 或 Edge Function。
4. 若任務牽涉 schema，補讀相關 `supabase_*_migration.sql`。

## 不可破壞規則

- Google 同步不得覆蓋既有成員的 `team_members.is_primary_payer` 與 `team_members.is_half_price`。
- 只有在新增全新成員時，才把上述兩個欄位預設為 `false`。
- 對重複同步列做去重時，保留最後一筆資料，並統計重複數。
- dedupe key 為空白時，不要把多筆資料錯誤合併成同一個人。
- 球員名單顯示有 `src/stores/playerRoster.ts` 的 session 內快取；Google 同步、新增、編輯、刪除成功後要 force refresh，不能只沿用快取。
- `get_team_members_cache_meta()` 依 `team_members.updated_at` 判斷名單是否變更；調整寫入流程時要確保更新會推進 `updated_at`。

## 工作流程

1. 先找出穩定的同步鍵，再決定 dedupe 規則。
2. 優先沿用 `dedupePlayerSyncRows()`，不要在呼叫端重寫另一套去重邏輯。
3. 組裝 upsert 或 insert payload 時，依是否為既有成員套用 `getProtectedFeeFlagsPayloadForGoogleFormSync(isExistingMember)`。
4. 若同步來源帶來更多欄位，先確認它們是不是應該覆蓋資料庫現值。
5. 若 schema 需要調整，新增 migration，不要直接改寫舊 migration。

## 驗證

- 跑 `pnpm exec vitest run src/utils/playerSync.test.ts`。
- 需要時再補 `pnpm exec vue-tsc --noEmit`。
- 若同步入口有資料庫寫入，確認既有成員的兩個保護欄位沒有被意外重設。
## 2026-04 Security Update

- Google 表單 / Sheet 同步寫入仍直接落在 `team_members`，因此 DB 端必須由 `players` feature 的 RLS 控制。
- 同步流程可以寫完整欄位，但展示流程預設應優先讀 `team_members_safe`；只有編輯或敏感資料維護流程才查 `team_members`。
- 若同步需求新增敏感欄位，請一起確認 `team_members_safe` 是否需要排除，避免公開或低權限頁面誤讀到個資。
