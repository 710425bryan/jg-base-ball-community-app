---
name: jg-baseball-finance-payments
description: "Finance, fees, payment submissions, player balances, match fees, remittance ingestion, and finance reminder workflow for jg-base-ball-community-app. Use when changing /fees, /my-payments, src/components/fees/*, src/services/myPayments.ts, src/services/playerBalances.ts, src/services/matchFees.ts, feeManagementReminders, monthly_fees, quarterly_fees, profile_payment_submissions, match_fee_items, match_payment_submissions, player_balance_transactions, record-fee-remittance, or Google Form remittance scripts."
---

# JG Baseball Finance Payments

## Overview

用這個 skill 處理收費、付款回報、球員餘額、比賽費、匯款表單匯入與費用提醒。這個功能會影響家長端 `/my-payments`、後台 `/fees`、裝備付款整合、通知中心與多個付款 RPC。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「收費與付款」
3. `docs/FILE_MAP.md`
4. `docs/MIGRATIONS.md`
5. `src/views/FeesView.vue`
6. `src/views/MyPaymentsView.vue`
7. `src/services/myPayments.ts`
8. `src/services/playerBalances.ts`
9. `src/services/quarterlyFeeCompensations.ts`
10. `src/services/matchFees.ts`
11. `src/services/feeManagementReminders.ts`
12. `src/types/payments.ts`、`src/types/playerBalances.ts`、`src/types/quarterlyFeeCompensation.ts`、`src/types/matchFees.ts`、`src/types/feeManagementReminders.ts`
13. `src/utils/memberBilling.ts`、`src/utils/monthlyFeeSettlement.ts`、`src/utils/quarterlyFeeFamilies.ts`、`src/utils/quarterlyFeeCompensation.ts`、`src/utils/playerBalance.ts`、`src/utils/siblingGroups.ts`
14. 相關 migration：`supabase_fees_migration.sql`、`supabase_quarterly_fees_migration.sql`、`supabase_profile_payment_submissions_migration.sql`、`supabase_player_balance_transactions_migration.sql`、`supabase_fixed_monthly_billing_migration.sql`、`supabase_quarterly_fee_compensation_migration.sql`、`supabase_match_fees_migration.sql`、`supabase_fee_management_reminders_migration.sql`
15. 若改到匯款表單，再讀 `supabase/functions/record-fee-remittance/index.ts` 與 `scripts/google-form-remittance-apps-script.js`
16. 若改到裝備付款，再同時讀 `jg-baseball-equipment-management` skill

## 功能邊界

- 後台 `/fees` 管理月費、季費、比賽費、付款回報、裝備付款審核與球員餘額。
- 家長端 `/my-payments` 可合併一般繳費、裝備付款與比賽費付款回報。
- 球員餘額以 `player_balance_transactions` 流水帳推導，不直接覆寫權威餘額。
- 一般付款使用 `profile_payment_submissions` RPC。
- 季費堂數不足補償使用 `quarterly_fee_compensation_items`，只產生待審核單；核准後才寫入 `player_balance_transactions`。
- 比賽費使用 `match_fee_items`、`match_payment_submissions`、`match_payment_submission_items`。
- 裝備付款使用 `equipment_payment_submissions`，但在 `/fees?tab=equipment` 與 `/my-payments` 整合顯示。
- 裝備加購申請只要到 `ready_for_pickup`（備貨完成 / 可取貨）即可回報付款，不需要等到 `picked_up`；調整裝備付款時要同步前端可勾選條件與 RPC 可付範圍。
- 費用提醒進通知中心時要確認 `get_notification_feed()` 是否包含對應 source。

## 不可破壞規則

- 家長只能查看與使用自己 `profiles.linked_team_member_ids` 綁定球員的款項與餘額。
- `permissionsStore.can()` 只控制 UX；付款審核、餘額扣抵、可見資料必須由 RLS / RPC 檢查。
- 球員餘額不可扣成負數；家長自助使用餘額後仍需管理端審核才正式扣款。
- 社區球員固定月繳以 `team_members.fee_billing_mode = 'monthly_fixed'` 表示，角色仍是 `球員`。
- 固定月繳球員進 `monthly_fees`，排除 `quarterly_fees` 與家庭季費分組。
- 季費補償的堂數不足只看當月週六數與 `/training-dates` 設定日期總數，補課日不限定週六。
- `is_primary_payer`、`is_half_price`、sibling / family grouping 會影響金額，改費用時要同步檢查。
- 比賽費付款不得混入一般月費或裝備付款資料模型；只在 UI 與付款回報流程上整合。
- 匯款表單 Edge Function 不硬編碼 secret，使用 `FORM_REMITTANCE_SECRET` 或環境設定。

## 工作流程

1. 先判斷修改的是月費、季費、比賽費、餘額、付款回報、提醒或匯款匯入。
2. 對照 `docs/MIGRATIONS.md` 找是否有後續 hotfix 覆寫同名 RPC / policy。
3. 讀前端 service/type，再讀對應元件，避免只改 UI 而漏掉 normalize 或 RPC payload。
4. 若新增付款欄位，同步更新：RPC return shape、service normalize、type、表單、審核 inbox、付款摘要元件與通知文字。
5. 若新增付款來源，同步考慮 `/my-payments` 的合併付款、餘額分攤與審核後扣款。
6. 若改通知或提醒，同時檢查 `push_dispatch_events`、`get_notification_feed()`、Web Push target 與 event key。

## 驗證

- 基本檢查：`pnpm exec vue-tsc --noEmit`
- 費用純邏輯：`pnpm exec vitest run src/utils/memberBilling.test.ts src/utils/monthlyFeeSettlement.test.ts src/utils/quarterlyFeeFamilies.test.ts src/utils/quarterlyFeeCompensation.test.ts src/utils/playerBalance.test.ts src/utils/feeManagementReminders.test.ts`
- 比賽費或付款 UI 風險高時跑：`pnpm build`
- 人工 sanity check：家長 linked member 可見性、管理端審核、餘額扣抵、固定月繳排除季費、比賽費付款、裝備付款整合。
