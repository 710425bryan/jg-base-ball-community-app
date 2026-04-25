---
name: jg-baseball-equipment-management
description: "Equipment management workflow for jg-base-ball-community-app. Use when adding or changing 裝備管理、裝備加購、器材庫存、裝備交易、裝備付款、`/equipment`、`/equipment-addons`、`equipment_transactions`、`equipment_purchase_requests`、`equipment_payment_submissions`、或 equipments storage/push behavior."
---

# JG Baseball Equipment Management

## Overview

用這個 skill 處理裝備主檔、庫存交易、家長加購、審核領取與裝備付款回報。此功能是從另一個管理專案移植過來，但在本 repo 要使用目前的 `team_members`、`linked_team_member_ids`、`fees`、`MyPaymentsView`、權限與 RLS 架構。

## 讀取順序

1. 先讀 `AGENT.md`。
2. 讀 `src/types/equipment.ts`、`src/services/equipmentApi.ts`、`src/stores/equipment*.ts`。
3. 若改 UI，讀 `src/views/EquipmentView.vue`、`src/views/EquipmentAddonsView.vue` 與 `src/components/equipment/*`。
4. 若改付款或審核，讀 `src/views/MyPaymentsView.vue`、`src/views/FeesView.vue`、`src/components/equipment/MyEquipmentPaymentsPanel.vue`、`src/components/equipment/EquipmentPaymentSubmissionInbox.vue`。
5. 若改資料安全，讀 `supabase_equipment_management_migration.sql` 與既有 access control migration。
6. 若改通知，讀 `src/utils/pushNotifications.ts`、`supabase/functions/send-push-notification/index.ts`。

## 固定規則

- 後台裝備管理路由 `/equipment` 使用 `meta.feature = 'equipment'`。
- 家長加購路由 `/equipment-addons` 不加 `equipment` feature；一般家長靠登入與 `linked_team_member_ids` 存取自己的資料。
- 權限 action 使用本專案標準 `VIEW / CREATE / EDIT / DELETE`，不要使用來源專案的 `ADD`。
- 裝備流程不直接接來源專案的 `fee_records`、月結關帳或收支報表；本專案以 `equipment_payment_submissions` 接到 `/my-payments` 與 `/fees?tab=equipment`。
- 裝備圖片與請購處理照片使用 `equipments` storage bucket。
- 新增推播要提供穩定 `eventKey`；通知管理者用 feature/action，通知特定申請人時只能透過已授權的 `target_user_ids` 流程。
- 新增 Element Plus 按鈕不要使用 `size="small"`，保持手機觸控操作。
- 裝備頁面若變大，要拆到 components/stores/services/utils，不要集中成單一長檔。

## 驗證

- 工具邏輯：`pnpm exec vitest run src/utils/equipmentInventory.test.ts src/utils/equipmentPricing.test.ts src/utils/equipmentRequestStatus.test.ts`
- 型別檢查：`pnpm exec vue-tsc --noEmit`
- 完整建置：`pnpm build`
