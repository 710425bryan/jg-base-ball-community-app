---
name: jg-baseball-vendors
description: "Vendor management workflow for jg-base-ball-community-app. Use when adding or changing 廠商名單、採購廠商、交易類別、`/vendors`、`vendors`、`vendor_trade_categories`、`src/services/vendorsApi.ts`、`src/stores/vendors.ts`、`src/components/vendors/*`、或 vendors storage/permission behavior."
---

# JG Baseball Vendors

## Overview

用這個 skill 處理後台廠商名單、交易類別保存、廠商照片與 `vendors` 權限。此功能獨立於裝備與收費：可以記錄採購資訊，但不建立付款、庫存、請購或費用關聯。

## 讀取順序

1. 先讀 `AGENTS.md`。
2. 讀 `src/types/vendor.ts`、`src/utils/vendors.ts`、`src/services/vendorsApi.ts`、`src/stores/vendors.ts`。
3. 若改 UI，讀 `src/views/VendorsView.vue` 與 `src/components/vendors/*`。
4. 若改路由或可見性，讀 `src/router/index.ts`、`src/layouts/MainLayout.vue`、`src/components/RolePermissionsManager.vue`。
5. 若改 DB 或 storage，讀 `supabase_vendor_management_migration.sql` 與 `docs/MIGRATIONS.md`。

## 固定規則

- 後台路由 `/vendors` 使用 `meta.feature = 'vendors'`。
- 權限 action 使用 `VIEW / CREATE / EDIT / DELETE`；不要沿用 `equipment`、`fees` 或其他 feature 權限。
- migration 只預設建立 `ADMIN` 的 `vendors` 權限列，其他角色由「角色與權限設定」手動開啟。
- `vendors` 表的 `name` 與 `trade_category` 必填；`purchase_price_note` 是自由文字，不做金額計算或排序。
- `vendor_trade_categories.name` 是唯一選項來源；新增或編輯廠商時先確保類別存在，刪除廠商不刪類別。
- 廠商照片使用 private `vendors` bucket；資料表只保存 storage path，前端顯示要透過 signed URL，不保存公開 URL。上傳前使用 `compressImage(file, 1600, 1200, 0.82, 900_000)` 壓縮。
- 列表預設表格檢視，也可切換卡片檢視；兩種檢視都要依交易類別分組。列表使用 Supabase range 分頁，進頁只抓第一頁，捲動接近底部時才載入下一頁。
- 搜尋應涵蓋廠商名稱、交易類別、聯絡人、電話、採購價、地址與官網。
- 官網外連必須先用 `normalizeExternalUrl()`，無效網址不產生 link。
- 前端按鈕權限只是 UX；資料安全要靠 `vendors` / `vendor_trade_categories` RLS 與 storage policy。

## 驗證

- 工具邏輯：`pnpm exec vitest run src/utils/vendors.test.ts`
- 型別檢查：`pnpm exec vue-tsc --noEmit`
- 完整建置：`pnpm build`
- Diff 檢查：`git diff --check`
