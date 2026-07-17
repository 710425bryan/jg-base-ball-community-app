---
name: jg-baseball-equipment-management
description: "Equipment management workflow for jg-base-ball-community-app. Use when adding or changing 裝備管理、裝備加購、器材庫存、裝備交易、裝備付款、`/equipment`、`/equipment-addons`、`/equipment-purchases`、`equipment_transactions`、`equipment_purchase_requests`、`equipment_payment_submissions`、或 equipments storage/push behavior."
---

# JG Baseball Equipment Management

## Overview

用這個 skill 處理裝備主檔、庫存交易、家長加購、審核備貨 / 領取與裝備付款回報。此功能是從另一個管理專案移植過來，但在本 repo 要使用目前的 `team_members`、`linked_team_member_ids`、`fees`、`MyPaymentsView`、權限與 RLS 架構。

## 讀取順序

1. 先讀 `AGENTS.md`。
2. 讀 `src/types/equipment.ts`、`src/services/equipmentApi.ts`、`src/stores/equipment*.ts`。
3. 若改 UI，讀 `src/views/EquipmentView.vue`、`src/views/EquipmentAddonsView.vue` 與 `src/components/equipment/*`。
4. 若改付款或審核，讀 `src/views/MyPaymentsView.vue`、`src/views/EquipmentPurchasesView.vue`、`src/components/equipment/MyEquipmentPaymentsPanel.vue` 與管理端主從明細元件。
5. 若改資料安全，讀 `supabase_equipment_management_migration.sql` 與既有 access control migration。
6. 若改通知，讀 `src/utils/pushNotifications.ts`、`supabase/functions/send-push-notification/index.ts`。

## 固定規則

- 後台裝備管理路由 `/equipment` 使用 `meta.feature = 'equipment'`。
- 後台裝備請購／付款路由 `/equipment-purchases` 使用 `meta.feature = 'fees'`；前端操作依 `fees:EDIT / DELETE`，既有 DB `fees OR equipment` 權限不因 UI 搬移而收緊。
- 家長加購路由 `/equipment-addons` 不加 `equipment` feature；一般家長靠登入與 `linked_team_member_ids` 存取自己的資料。
- 權限 action 使用本專案標準 `VIEW / CREATE / EDIT / DELETE`，不要使用來源專案的 `ADD`。
- 裝備流程不直接接來源專案的 `fee_records`、月結關帳或收支報表；本專案以 `equipment_payment_submissions` 接到 `/my-payments` 與 `/equipment-purchases`，舊 `/fees?tab=equipment` 保留相容轉向。
- 管理台金額分狀態顯示：交易用 `total_amount`、付款單用 `amount`、請購用 `unit_price_snapshot × quantity`；不得跨請購與付款生命週期加總。
- `/equipment-purchases` 主清單使用前端分頁，每頁固定顯示 10 筆；切換頁面後需保留目前狀態與篩選條件，並將 `MainLayout` 頁面捲動到新頁第一筆資料，不可捲回 route 頂端或新增清單內部捲軸。點選或關閉主清單明細只改 selection，不得把目前頁碼重設為第一頁；切換管理類型、狀態或篩選條件時才回第一頁，資料異動後頁碼需收斂到最後有效頁。
- `/equipment-purchases` 的請購數量統計放在請購狀態說明正下方並預設展開，仍可由管理者收合；只使用目前狀態與篩選後的全部請購結果，不受主清單分頁限制。依裝備、尺寸、背號彙整 `equipment_purchase_request_items.quantity`，同一請購的同規格品項只計一筆請購單數。付款單與付款交易不得混入統計，避免跨請購／付款生命週期重複計數。
- `/equipment-purchases` 延續舊 `/fees` 裝備頁籤的語意色與完整說明：付款尚未付款用 sky、付款待審用 emerald、已收款可退款用 orange；請購待審用 amber、處理中用 blue、歷史用 slate。區塊外框使用對應 `*-100` 淡色階，主清單選取列跟隨該筆狀態，不得一律套品牌橘；尚未付款主動作用 sky-700、付款待審用 emerald-600、退款用 orange 淡色警示、備貨用 blue-600、領取用 emerald-600。狀態按鈕、目前狀態說明、摘要、主清單外框／底色與清單 badge 必須一致；主清單使用淡色狀態容器包住白色資料卡，並保留文字，不能只靠顏色辨識。
- `/equipment-purchases` 請購明細的「刪除請購」是獨立 Danger 按鈕，不收進更多選單；只對 `fees:DELETE` 顯示並保留二次確認。待審核的「退回請購」仍屬次要流程，可留在更多選單。
- 加購申請到 `approved`（已核准）後即可進行裝備付款回報；`ready_for_pickup` 與 `picked_up` 只代表備貨 / 領取進度，不可作為付款入口前置條件。
- 裝備圖片與請購處理照片使用 `equipments` storage bucket；多圖清單為 `image_urls`、`ready_image_urls`、`pickup_image_urls`，並保留單圖欄位作為首圖相容。
- 裝備主檔的 `is_custom_order` 用來標記訂製品；家長端必須顯示需等待備貨提示，但不得因此改變加購審核、庫存或 `approved` 後即可付款的可付範圍。
- 裝備付款狀態與商品履約狀態分離；付款確認只代表已收款完成，不可自動把申請寫成 `picked_up`。
- 已確認收款後若要刪除測試請購或取消請購，必須先走退款 / 作廢收款：有付款單時付款單與交易標記 `refunded`，球員餘額扣抵加回、溢繳轉入反向扣回；直接標記已收款且無付款單時作廢交易收款狀態，之後才可刪除交易回補庫存。
- 新增推播要提供穩定 `eventKey`；通知管理者用 feature/action，通知特定申請人時只能透過已授權的 `target_user_ids` 流程。
- 新增 Element Plus 按鈕不要使用 `size="small"`，保持手機觸控操作。
- 裝備頁面若變大，要拆到 components/stores/services/utils，不要集中成單一長檔。

## 驗證

- 工具邏輯：`pnpm exec vitest run src/utils/equipmentInventory.test.ts src/utils/equipmentPricing.test.ts src/utils/equipmentRequestStatus.test.ts`
- 型別檢查：`pnpm exec vue-tsc --noEmit`
- 完整建置：`pnpm build`
