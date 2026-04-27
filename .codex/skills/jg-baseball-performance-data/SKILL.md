---
name: jg-baseball-performance-data
description: "棒球能力與體能測驗數據 workflow for jg-base-ball-community-app. Use when changing `/baseball-ability`, `/physical-tests`, performance data tables/RPC/RLS, trend views, manual CRUD forms, or permissions `baseball_ability` / `physical_tests`."
---

# JG Baseball Performance Data

## Overview

用這個 skill 處理棒球能力數據與體能測驗數據。這兩個模組是分開 feature 權限，但共用同一套資料流：DB RLS / RPC 是安全邊界，前端只做入口與操作按鈕控制。

## 讀取順序

1. 先讀 `AGENT.md`。
2. 讀 `src/router/index.ts`、`src/layouts/MainLayout.vue`、`src/components/RolePermissionsManager.vue`。
3. 讀 `src/services/performanceApi.ts`、`src/stores/performance.ts`、`src/types/performance.ts`、`src/utils/performanceConfig.ts`。
4. 若改 DB，讀 `supabase_performance_data_migration.sql` 並確認 RLS / RPC 與前端 feature key 一致。

## 權限與路由

- 棒球能力數據：
  - 路由：`/baseball-ability`、`/baseball-ability/:memberId`
  - feature key：`baseball_ability`
  - 資料表：`baseball_ability_records`
  - RPC：`get_baseball_ability_records`
- 體能測驗數據：
  - 路由：`/physical-tests`、`/physical-tests/:memberId`
  - feature key：`physical_tests`
  - 資料表：`physical_test_records`
  - RPC：`get_physical_test_records`
- 成員選項 RPC：`get_performance_member_options`
- actions 固定為 `VIEW / CREATE / EDIT / DELETE`。

## 安全規則

- 有對應 `VIEW` 權限的角色可讀該模組全部資料。
- 沒有 `VIEW` 權限但 `profiles.linked_team_member_ids` 有綁定球員者，只能唯讀自己的綁定球員資料。
- `INSERT / UPDATE / DELETE` 只能由對應 feature 的 `CREATE / EDIT / DELETE` 權限執行；家長/球員自我檢視不可寫入。
- RPC 與前端不得回傳或顯示 `national_id`、`guardian_phone`、`contact_line_id`。
- 若新增欄位，需同步更新 table、RPC return shape、`src/types/performance.ts`、表單、列表與詳情頁指標設定。

## 驗證

- 跑 `pnpm exec vue-tsc --noEmit`。
- 跑 `pnpm build`。
- 至少檢查四種情境：ADMIN CRUD、只有 linked member 的唯讀使用者、無權限無 linked member 的導回、兩個 feature 權限互不互通。
