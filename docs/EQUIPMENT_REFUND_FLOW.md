# 裝備退款 / 作廢收款流程

本文件定義裝備付款已確認收款後，因測試資料、家長取消、商品無法交付或管理端誤按收款時的退款 / 作廢收款流程。

## 目標

- 保留已發生過的付款紀錄，不直接刪除已收款資料。
- 將裝備付款紀錄標記為 `refunded` / 已退款。
- 將對應 `equipment_transactions.payment_status` 標記為 `refunded`，讓後續可刪除測試請購或取消請購。
- 若原付款使用球員餘額扣抵，退款時要把扣掉的餘額加回去。
- 若原付款有溢繳轉入球員餘額，退款時要反向扣回。
- 退款後才能刪除請購產生的裝備交易，並讓庫存回補。

## 狀態規則

### 有家長付款回報單

| 資料 | 退款前 | 退款後 |
| --- | --- | --- |
| `equipment_payment_submissions.status` | `approved` | `refunded` |
| `equipment_transactions.payment_status` | `paid` | `refunded` |
| `equipment_transactions.payment_submission_id` | 付款單 id | 保留付款單 id 作為歷史關聯 |
| `equipment_purchase_requests.status` | `approved` / `ready_for_pickup` / `picked_up` | 不自動改變 |

退款只處理收款狀態，不代表商品狀態已取消或已收回。若要取消請購或刪除測試請購，退款完成後再執行請購刪除 / 取消。

### 管理端直接標記已收款

若管理端在尚未付款清單直接按「標記已收款」，可能沒有 `equipment_payment_submissions` 付款單。此時走 `refund_equipment_transactions(uuid[], text)`，只將 `equipment_transactions.payment_status` 從 `paid` 改為 `refunded`，並把作廢原因寫入交易備註，不產生餘額反向流水。

## 餘額流水

退款 RPC 必須檢查原付款單的兩種餘額影響：

- `balance_amount > 0`：代表家長付款時使用球員餘額扣抵，審核收款時已寫入 `payment_deduction` 負數流水；退款時要新增等額正數流水，理由為「裝備付款退款 - 退回餘額扣抵」。
- 付款確認時若有 `source = 'overpayment'` 且 `related_equipment_payment_submission_id = submission.id` 的溢繳轉入流水，退款時要新增等額負數流水，理由為「裝備付款退款 - 溢繳轉入沖回」。

退款流水使用固定 idempotency key，避免重複操作造成餘額重複加回或扣回。

## 刪除與取消規則

`delete_equipment_transactions(uuid[])` 應繼續阻擋：

- `payment_status in ('pending_review', 'paid')`
- 關聯付款單狀態不是 `rejected` 或 `refunded`

退款後，`payment_status = 'refunded'` 且付款單狀態為 `refunded` 或沒有付款單，管理者才可刪除測試請購或取消請購產生的購買交易，庫存才會回補。

## 管理端操作

管理端在裝備付款紀錄已收款完成時，應提供「退款 / 作廢收款」操作；若是直接標記已收款的交易，提供「作廢收款」操作。

操作時需顯示提醒：

- 退款會把付款紀錄標記為已退款。
- 若有球員餘額扣抵，會退回餘額。
- 若有溢繳轉入，會反向扣回餘額。
- 退款不會自動刪除請購，也不會自動改商品領取狀態。
- 退款後才可刪除測試請購或取消請購。

## 驗收案例

- 已收款裝備付款可執行退款。
- 退款後付款紀錄顯示「已退款」。
- 退款後裝備交易顯示「已退款」。
- 直接標記已收款的交易可作廢成「已退款」。
- 使用球員餘額扣抵的付款，退款後餘額加回。
- 有溢繳轉入餘額的付款，退款後溢繳金額反向扣回。
- 退款後可刪除測試請購，庫存回補。
- 未退款的已收款請購仍不可直接刪除。
