# Feature Spec：付款回報金額防呆與異常審核

- 狀態：`IMPLEMENTED`
- Delivery 目標：`IMPLEMENTED`
- 建立日期：`2026-09-02`
- 負責人：Codex
- 需求來源：使用者核准的「付款回報金額防呆與異常審核」方案
- 相關 issue / PR：N/A

## 1. 原始需求

個人付款回報必須把「系統應收」與「實際付款」分開。系統應收由資料庫依月費／季費規則重新計算且不可由前端覆寫；餘額扣抵只降低正確應付現金。實際付款與正確應付不一致時仍可回報，但必須附原因並二次確認。管理端不可核准短繳或無法核對的回報；多繳只能在明確確認後，把資料庫計算出的精確差額轉入該球員餘額。

## 2. 目標與非目標

### 目標

- 家長端顯示系統應收、餘額扣抵、正確應付、實際付款、差額與異常原因。
- 月費與每位季費的系統應收由 `get_my_payment_submission_estimate()` 重新計算並保存快照。
- 管理端依 `matched / underpaid / overpaid / unverifiable` 狀態限制操作。
- 短繳由前端停用核准且 DB RPC 再次阻擋；多繳由 DB 依差額建立具冪等鍵的 `overpayment` 流水。
- 退回原因必填，並通知原回報帳號，深層連結定位原付款回報。
- 只補齊目前 `pending_review` 的可核對資料；不改寫已核准或已退回歷史。

### 非目標

- 不新增部分付款狀態。
- 不變更裝備與比賽費的系統決定金額。
- 不批次修正過去已核准資料。
- 本次不直接部署 migration、Edge Function 或前端 production。

## 3. 假設與待確認事項

| 項目 | 目前假設 | 是否阻擋 |
| --- | --- | --- |
| 短繳 | 退回後由使用者重新送出，不累計部分付款 | 否 |
| 多繳 | 管理員只確認是否接受，差額不可手填 | 否 |
| 舊版 App | 未傳實際付款欄位時，以舊 `amount - balance_amount` 推導並標註異常原因 | 否 |
| 待審舊資料 | migration 只補 `pending_review`；估算失敗保留 `unverifiable` | 否 |
| 推播失敗 | 審核結果已完成時不回滾付款交易，畫面提示管理員通知失敗 | 否 |

## 4. 驗收條件

- [x] 應收 6,000、折抵 1,000、實付 5,000 可正常核准。
- [x] 實付 4,000 顯示短繳，前端停用核准，DB RPC 亦拒絕。
- [x] 實付 5,500 經管理員確認後核准，500 元以冪等流水存入正確球員餘額。
- [x] 審核前餘額不足時整筆 transaction 回滾，回報維持待審。
- [x] 多球員季費逐人核對；任一短繳阻擋整張，個別多繳各自入帳。
- [x] 舊版前端傳入自訂 `amount` 不會覆寫正式月費／季費本金。
- [x] 退回原因、target user、event key 與 `/my-payments?highlight_submission_id=...` 正確。
- [x] migration 不更新非 `pending_review` 的付款回報。
- [ ] 360px、390px、640–767px 與桌機 Dialog 無水平溢出，錯誤貼近欄位，操作區至少 44px。

## 5. 影響面

| 項目 | 是否影響 | 檔案 / 資料 / 說明 |
| --- | --- | --- |
| Vue views / components | 是 | `MyPaymentsView.vue`、付款金額控制、管理端 inbox |
| Router / Auth / permissions | 否 | 沿用 `/my-payments` 與 `fees:EDIT` |
| Pinia / services / utils / types | 是 | `myPayments.ts`、付款型別、金額核對純函式 |
| Supabase tables / RLS / RPC / cron | 是 | 付款主表／季費明細欄位、建立／列表／審核 RPC |
| Storage / Auth | 否 | N/A |
| Edge Functions | 是 | 通用推播事件補上單一明確 `target_user_id` |
| Notifications / Web Push | 是 | 退回 `fees/PAYMENT_REMINDER` targeted 通知 |
| Vercel / environment variables | 否 | N/A |
| PWA / version / legacy WebView | 否 | 不修改產物與版本檔 |

## 6. 安全與資料規則

- 讀取邊界：個人列表僅本人 linked member；管理列表需 `fees:VIEW` 或 `fees:EDIT`。
- 寫入邊界：建立 RPC 以 `auth.uid()` 與 linked member 驗證；審核 RPC 需 `fees:EDIT`。
- RLS / RPC / feature-action：前端按鈕只做 UX，短繳、餘額不足、差額與冪等入帳由 transaction 內 RPC 強制。
- 敏感資料：只新增金額、原因與送出帳號 ID，不擴大名單或個資讀取。
- Secret scan / credential rotation：無新增 secret。
- Edge Function auth mode：沿用 `send-push-notification` bearer JWT。
- 資料相容與 backfill：保留舊 `amount` 欄位；僅 `pending_review` 補推導欄位，非待審歷史不更新。

## 7. 實作計畫

1. 新增純函式與付款金額控制元件，改造家長端單人／多人季費表單。
2. 擴充型別與 service payload／normalize；加入深層連結定位退回資料。
3. 新增 migration，讓建立、列表與審核 RPC 使用 DB expected snapshot 與 reconciliation guard。
4. 改造管理端核對卡、固定退回原因與多繳確認；發送 targeted 站內通知及 Web Push。
5. 更新專案邏輯、檔案地圖、migration／Edge Function／手機稽核文件與測試。

使用 skills：

- `jg-baseball-project-workflow`
- `jg-baseball-delivery-workflow`
- `jg-baseball-finance-payments`
- `jg-baseball-push-notifications`

## 8. 測試計畫

### Targeted

- [x] 付款核對 utils、付款控制元件、家長頁、管理 inbox、service、migration、推播事件測試。

### Feature regression

- [x] 依 `AGENTS.md` / `jg-baseball-finance-payments` 執行完整收費計算回歸。
- [x] 執行推播 targeted regression。

### Full gate

- [x] `pnpm exec vue-tsc --noEmit`
- [x] `pnpm build`
- [x] `pnpm check`
- [x] `git diff --check`
- [ ] 人工 / Preview smoke：本地靜態與自動化驗證；登入後裝置 smoke 留待 staging。

## 9. Release Manifest

### Git / Vercel

- Branch：目前工作分支
- Commit：N/A
- Preview URL：N/A
- Production branch：N/A
- Environment variables changed：`否`

### Supabase migrations

| 檔案 | 相依順序 | Staging | Production | Post-check |
| --- | --- | --- | --- | --- |
| `supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_profile_payment_amount_reconciliation_migration.sql` | 1 | 待執行 | 未授權 | 比對待審狀態；確認 approved/rejected row 未變 |

### Edge Functions

| Function | 相依 migration | Auth mode | Secret readiness | Staging | Production |
| --- | --- | --- | --- | --- | --- |
| `send-push-notification` | 上述 migration | bearer JWT | 沿用既有 | 待執行 | 未授權 |

## 10. Rollout 與 Rollback

- 發布順序：DB migration → `send-push-notification` → 前端。
- Vercel rollback：回退前端版本；保留向後相容 RPC 欄位。
- Edge Function rollback：回退 function；DB 事件欄位不需刪除。
- DB forward-fix / rollback：已新增 nullable 欄位不直接 drop；RPC 問題以新 migration forward-fix。
- 資料備份或稽核證據：migration 前輸出待審 reconciliation 分布與非待審 row 摘要；migration 後重查。

## 11. 驗證證據

| Gate | 結果 | 證據 / 日期 |
| --- | --- | --- |
| Targeted tests | 通過 | 2026-09-02：付款、管理 inbox、migration、推播等 31 files／146 tests |
| Feature regression | 通過 | 2026-09-02：包含完整收費計算矩陣 |
| Secret scan | 部分通過 | 2026-09-02：本次 changed-file pattern scan 0 hits；repository history Gitleaks 仍依既有已知 VAPID 阻擋處理 |
| Full CI / build | 通過 | 2026-09-02：`pnpm check`，212 files／1039 tests、typecheck、Vite production build |
| Vercel Preview | N/A | 本次未要求建立 Preview |
| Supabase staging | N/A | 本次未授權套用 migration |
| Production smoke | N/A | 本次未授權 production mutation |

## 12. 最終狀態與剩餘風險

- 最終狀態：本地實作完成（`IMPLEMENTED`），尚未部署。
- 未完成項目：Supabase staging migration 編譯／交易驗證、Edge Function staging deploy、登入後 360px／390px／640–767px／桌機視覺驗收。
- 剩餘風險：本機沒有 Supabase CLI／psql，migration 目前只有靜態結構測試；repository 既有 Edge Function secret/auth release blocker 仍存在。
- 下一步：依序在 staging 套 migration、部署 `send-push-notification`、部署前端，執行 post-check 與裝置 smoke 後才進 production gate。
