---
name: jg-baseball-finance-payments
description: "Finance, fees, payment submissions, player balances, match fees, equipment payment administration, remittance ingestion, and finance reminder workflow for jg-base-ball-community-app. Use when changing /fees, /equipment-purchases, /my-payments, src/components/fees/*, src/services/myPayments.ts, src/services/playerBalances.ts, src/services/matchFees.ts, feeManagementReminders, feePaymentReminders, monthly_fees, quarterly_fees, profile_payment_submissions, match_fee_items, match_payment_submissions, equipment_payment_submissions, player_balance_transactions, record-fee-remittance, or Google Form remittance scripts."
---

# JG Baseball Finance Payments

## Overview

用這個 skill 處理收費、付款回報、球員餘額、比賽費、匯款表單匯入、費用提醒與手動催繳通知。這個功能會影響家長端 `/my-payments`、後台 `/fees`、裝備付款整合、通知中心與多個付款 RPC。

## 必讀檔案

1. `AGENTS.md`
2. `docs/PROJECT_LOGIC.md` 的「收費與付款」
3. `docs/FILE_MAP.md`
4. `docs/MIGRATIONS.md`
5. `src/views/FeesView.vue`
6. `src/views/EquipmentPurchasesView.vue`、`src/views/MyPaymentsView.vue`
7. `src/services/myPayments.ts`
8. `src/services/playerBalances.ts`
9. `src/services/quarterlyFeeCompensations.ts`
10. `src/services/matchFees.ts`
11. `src/services/feeManagementReminders.ts`、`src/services/feePaymentReminders.ts`
12. `src/types/payments.ts`、`src/types/playerBalances.ts`、`src/types/quarterlyFeeCompensation.ts`、`src/types/matchFees.ts`、`src/types/feeManagementReminders.ts`、`src/types/feePaymentReminders.ts`
13. `src/utils/memberBilling.ts`、`src/utils/monthlyFeeSettlement.ts`、`src/utils/quarterlyFeeFamilies.ts`、`src/utils/quarterlyFeeCompensation.ts`、`src/utils/playerBalance.ts`、`src/utils/matchFeePaymentAvailability.ts`、`src/utils/siblingGroups.ts`、`src/utils/feePaymentReminders.ts`
14. 相關 migration：`supabase_fees_migration.sql`、`supabase_quarterly_fees_migration.sql`、`supabase_profile_payment_submissions_migration.sql`、`supabase_player_balance_transactions_migration.sql`、`supabase_fixed_monthly_billing_migration.sql`、`supabase_quarterly_fee_compensation_migration.sql`、`supabase_match_fees_migration.sql`、`supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_match_fee_payment_open_state_migration.sql`、`supabase_fee_management_reminders_migration.sql`、`supabase_fee_payment_reminders_migration.sql`
15. 若改到匯款表單，再讀 `supabase/functions/record-fee-remittance/index.ts` 與 `scripts/google-form-remittance-apps-script.js`
16. 若改到裝備付款，再同時讀 `jg-baseball-equipment-management` skill

## 功能邊界

- 後台 `/fees` 管理月費、季費、比賽費、一般付款回報與球員餘額；裝備請購／付款改由 `/equipment-purchases` 管理。
- 家長端 `/my-payments` 可合併一般繳費、裝備付款與比賽費付款回報。
- 球員餘額以 `player_balance_transactions` 流水帳推導，不直接覆寫權威餘額。
- 一般付款使用 `profile_payment_submissions` RPC。
- 季費堂數不足補償使用 `quarterly_fee_compensation_items`，只產生待審核單；核准後才寫入 `player_balance_transactions`。
- 比賽費使用 `match_fee_items`、`match_payment_submissions`、`match_payment_submission_items`。
- 比賽費先產生供管理端核對，預設不提供家長付款；只有 `fees:EDIT` 可透過 `set_match_fee_payment_open_state()` 開放 / 關閉，`fees:DELETE` 才可透過 `delete_cancelled_match_fee_group()` 刪除安全的全取消群組。
- 裝備付款使用 `equipment_payment_submissions`，在 `/equipment-purchases` 與 `/my-payments` 整合顯示；舊 `/fees?tab=equipment` 只作相容轉向。
- `/equipment-purchases` 前端入口使用 `fees:VIEW`，異動與刪除分別使用 `fees:EDIT / DELETE`；既有 DB `fees OR equipment` 權限保持不變。
- 裝備加購申請只要到 `approved`（已核准）即可回報付款，不需要等到 `ready_for_pickup` 或 `picked_up`；調整裝備付款時要同步前端可勾選條件與 RPC 可付範圍。
- 裝備付款確認只代表已收款完成，不代表商品已備貨或已領取；不要把付款 `approved` 自動同步成申請 `picked_up`。
- 裝備付款退款 / 作廢收款要走 `refunded` 狀態；有付款單時需建立反向 `player_balance_transactions`，直接標記已收款且無付款單時只作廢交易收款狀態。不可直接刪 paid 交易；退款後才允許刪除測試請購或取消請購。
- 費用提醒進通知中心時要確認 `get_notification_feed()` 是否包含對應 source。
- 手動催繳通知只處理已存檔月費與季費未繳；不含比賽費或裝備款，不做 cron / 自動排程。正式 preview / send 使用既有 `fees:EDIT` 或 `ADMIN`，月費結算若有待「一鍵存檔」變更需先提醒並阻擋預覽 / 測試 / 發送；測試通知只給 `ADMIN` 且只通知目前登入者，文案使用目前管理員綁定球員的未繳帳款組成。

## 不可破壞規則

- 家長只能查看與使用自己 `profiles.linked_team_member_ids` 綁定球員的款項與餘額。
- `permissionsStore.can()` 只控制 UX；付款審核、餘額扣抵、可見資料必須由 RLS / RPC 檢查。
- 球員餘額不可扣成負數；家長自助使用餘額後仍需管理端審核才正式扣款。
- 社區球員固定月繳以 `team_members.fee_billing_mode = 'monthly_fixed'` 表示，角色仍是 `球員`。
- 新泰校隊固定月繳以 `role = 校隊` 且 raw `team_members.training_program = 'junior_high_school_team'` 判斷，不改 `role`，不從 `team_group` fallback 猜身分；新建月費使用既有 `monthly_fixed` snapshot，金額取 `fee_settings.monthly_fixed_fee`。
- 球員計次月費以 `team_members.fee_billing_mode = 'monthly_per_session'` 表示，角色仍是 `球員`，但隊費進 `monthly_fees` 並採校隊同款計次公式。
- 中港校隊與球員計次月費只把落在該球員 program 訓練日期內的全日 / 上午假單算作請假扣減；下午假代表上午課程仍需收費，不扣計次月費。新泰校隊固定月繳不參與堂數、請假或單堂費率計算。
- `monthly_fees.training_program` 保留月費當期 program snapshot；月費頁需支援球員搜尋、program 篩選 / 小計與 CSV program 欄位，row-level `total_sessions` 不可再用單一全域堂數套所有人。
- 固定月繳、新泰校隊月繳與球員計次月費都排除 `quarterly_fees` 與家庭季費分組。
- 球員 / 校隊不收費以 `team_members.fee_billing_mode = 'no_fee'` 表示；不產生新的月費、季費與比賽費，但既有帳款保留，裝備付款仍維持自費。
- 月繳付款回報開放期別要依 `monthly_fees.calculation_type` / 有效收費模式區分：中港校隊與球員計次月費只開放已結束月份，社區固定月繳與新泰校隊月繳每月 25 日起開放下月；前端 helper 與 DB trigger 必須同步，既有 `monthly_fees` 帳款不自動回寫或重算。
- 季繳付款回報的開放期別以台灣日期為準，每季最後一個月 25 日起開放下一季；前端 helper 與 DB helper / trigger 必須同步，未開放的未來季不可新增付款回報，過去未繳季度可補繳。
- 個人首頁 `get_my_home_snapshot()` 的付款待辦摘要必須沿用相同的月費 / 季費開放期別；尚未開放的帳款可保留在正式費用紀錄，但不可顯示成一般會員現在就要處理的欠費。
- 季費補償的堂數不足只看當月週六數與 `/training-dates` 設定日期總數，補課日不限定週六。
- `is_primary_payer`、`is_half_price`、sibling / family grouping 會影響金額，改費用時要同步檢查。
- 手足主要繳費人退隊、離隊或關閉 / 畢業後，剩餘有效手足的新一期月費 / 季費試算不得沿用手足半價；主要繳費人恢復有效後，若 `sibling_ids` 與 `is_primary_payer` 仍保留，另一位有效手足可恢復手足減免。既有已保存帳款金額不自動覆寫，需由管理端重算或手動調整。
- 比賽費付款不得混入一般月費或裝備付款資料模型；只在 UI 與付款回報流程上整合。
- linked member 只能看已開放比賽費，或自己既有付款歷程；不可只靠前端隱藏。付款 RPC 必須鎖定場次、同步名單並重驗開放狀態，防止管理者關閉與家長付款同時發生。
- 開放後只以 `(member_id, amount)` 應收簽章判斷自動關閉：金額 / 名單改變且無付款歷程才關閉，賽事文字與時間修改不可關閉或建立重複費用。曾送出 / 已付款項目的金額快照不可回寫。
- 刪除賽事時，待審 / 已付款 / 目前付款關聯必須阻擋；無歷程費用直接刪除，已駁回 / 回滾歷史則解除 `match_id` 並保留取消稽核紀錄。取消群組只要有任何歷史付款關聯就不可刪除。
- 匯款表單 Edge Function 不硬編碼 secret，使用 `FORM_REMITTANCE_SECRET` 或環境設定。

## 工作流程

1. 先判斷修改的是月費、季費、比賽費、餘額、付款回報、提醒或匯款匯入。
2. 對照 `docs/MIGRATIONS.md` 找是否有後續 hotfix 覆寫同名 RPC / policy。
3. 讀前端 service/type，再讀對應元件，避免只改 UI 而漏掉 normalize 或 RPC payload。
4. 若新增付款欄位，同步更新：RPC return shape、service normalize、type、表單、審核 inbox、付款摘要元件與通知文字。
5. 若新增付款來源，同步考慮 `/my-payments` 的合併付款、餘額分攤與審核後扣款。
6. 若改通知或提醒，同時檢查 `push_dispatch_events`、`get_notification_feed()`、Web Push target 與 event key。
7. 若改比賽費開放狀態，同步檢查管理端卡頭狀態、家長端清單 / 摘要 / 合併付款選項、RLS、付款 RPC 鎖定順序與賽事刪除 trigger。

## 驗證

- 基本檢查：`pnpm exec vue-tsc --noEmit`
- 費用純邏輯：`pnpm exec vitest run src/utils/memberBilling.test.ts src/utils/monthlyFeeSettlement.test.ts src/utils/quarterlyFeeFamilies.test.ts src/utils/quarterlyFeeCompensation.test.ts src/utils/playerBalance.test.ts src/utils/feeManagementReminders.test.ts src/utils/feePaymentReminders.test.ts src/services/feePaymentReminders.test.ts`
- 比賽費或付款 UI 風險高時跑：`pnpm build`
- 人工 sanity check：家長 linked member 可見性、管理端審核、餘額扣抵、固定月繳 / 新泰月繳與球員計次月費排除季費、不收費排除隊費與比賽費、比賽費付款、裝備付款整合。
