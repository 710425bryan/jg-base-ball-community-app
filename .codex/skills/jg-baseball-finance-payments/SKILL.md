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
- 裝備加購申請只要到 `approved`（已核准）即可回報付款，不需要等到 `ready_for_pickup` 或 `picked_up`；調整裝備付款時要同步前端可勾選條件與 RPC 可付範圍。
- 裝備付款確認只代表已收款完成，不代表商品已備貨或已領取；不要把付款 `approved` 自動同步成申請 `picked_up`。
- 裝備付款退款 / 作廢收款要走 `refunded` 狀態；有付款單時需建立反向 `player_balance_transactions`，直接標記已收款且無付款單時只作廢交易收款狀態。不可直接刪 paid 交易；退款後才允許刪除測試請購或取消請購。
- 費用提醒進通知中心時要確認 `get_notification_feed()` 是否包含對應 source。

## 不可破壞規則

- 家長只能查看與使用自己 `profiles.linked_team_member_ids` 綁定球員的款項與餘額。
- `permissionsStore.can()` 只控制 UX；付款審核、餘額扣抵、可見資料必須由 RLS / RPC 檢查。
- 球員餘額不可扣成負數；家長自助使用餘額後仍需管理端審核才正式扣款。
- 社區球員固定月繳以 `team_members.fee_billing_mode = 'monthly_fixed'` 表示，角色仍是 `球員`。
- 球員計次月費以 `team_members.fee_billing_mode = 'monthly_per_session'` 表示，角色仍是 `球員`，但隊費進 `monthly_fees` 並採校隊同款計次公式。
- 校隊與球員計次月費只把落在該球員 program 訓練日期內的全日 / 上午假單算作請假扣減；下午假代表上午課程仍需收費，不扣計次月費。
- `monthly_fees.training_program` 保留月費當期 program snapshot；月費頁需支援球員搜尋、program 篩選 / 小計與 CSV program 欄位，row-level `total_sessions` 不可再用單一全域堂數套所有人。
- 固定月繳與球員計次月費都排除 `quarterly_fees` 與家庭季費分組。
- 球員 / 校隊不收費以 `team_members.fee_billing_mode = 'no_fee'` 表示；不產生新的月費、季費與比賽費，但既有帳款保留，裝備付款仍維持自費。
- 月繳付款回報開放期別要依 `monthly_fees.calculation_type` / 有效收費模式區分：校隊與球員計次月費只開放已結束月份，`monthly_fixed` 固定月繳球員每月 25 日起開放下月；前端 helper 與 DB trigger 必須同步。
- 季繳付款回報的開放期別以台灣日期為準，每季最後一個月 25 日起開放下一季；前端 helper 與 DB helper / trigger 必須同步，未開放的未來季不可新增付款回報，過去未繳季度可補繳。
- 季費補償的堂數不足只看當月週六數與 `/training-dates` 設定日期總數，補課日不限定週六。
- `is_primary_payer`、`is_half_price`、sibling / family grouping 會影響金額，改費用時要同步檢查。
- 手足主要繳費人退隊、離隊或關閉 / 畢業後，剩餘有效手足的新一期月費 / 季費試算不得沿用手足半價；主要繳費人恢復有效後，若 `sibling_ids` 與 `is_primary_payer` 仍保留，另一位有效手足可恢復手足減免。既有已保存帳款金額不自動覆寫，需由管理端重算或手動調整。
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
- 人工 sanity check：家長 linked member 可見性、管理端審核、餘額扣抵、固定月繳與球員計次月費排除季費、不收費排除隊費與比賽費、比賽費付款、裝備付款整合。
