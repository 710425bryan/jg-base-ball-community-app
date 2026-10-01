# Feature Spec：國中部月費開放時點修正

- 狀態：`RELEASED`（正式 DB 修正已生效，家長實際送出仍待確認）
- Delivery 目標：`PRODUCTION`；使用者已在正式庫執行此修正並回報失敗，本次沿用同一專案與 SQL 範圍修復及套用。
- 建立日期：2026-10-01（台灣）
- 需求來源：使用者查看國中部繳費開放時間後，要求一併修正發現的線上後端落差。

## 目標與現況

國中部月費每月 25 日起開放下個月，適用 `single_monthly` 與 `training_dates`。修正前，正式專案 `qwxzwomzoyfkorbwsscv` 的設定為單次月費 2,000 元，但付款 trigger 沒有 program-aware 開放判斷；沒有正式帳款時被當成結束後才能付款的計次月費。首頁摘要同樣使用舊判斷，估算 RPC 則缺少月費開放月份限制。

保留中港校隊／社區計次次月 1 日付款、社區固定月繳 25 日預繳。既有金額、折扣、待審／已繳快照、季費歸屬與餘額維持既有流程。不新增自動帳款或付款、不發通知、不更動前端版面。

## 驗收條件

- [x] 9/24 不提供 10 月國中部估算／回報，9/25 起允許，10/25 開放 11 月，12/25 開放次年 1 月。
- [x] 國中部兩種模式及已存計次快照都使用同一預繳開放時點；正式帳款尚未建立時可使用既有動態估算回報。
- [x] 首頁只統計已開放帳款，保留帳款金額與既有加入月份限制。
- [x] 中港校隊與社區計次待月份結束才開放；社區固定月繳不回歸。
- [x] 一般家長限 linked members，有效 ADMIN 代填例外保留，匿名／未綁定付款被拒。
- [x] migration 重跑不改資料或原 RPC ACL；新 helper 不對 anon／authenticated 公開。
- [x] SQL 與已存函式的 LF／CRLF 四種組合都可執行與重跑；未知版型仍中止並完整回滾。

## 實作與安全邊界

Migration：`supabase/migrations/20261001032108_junior_high_payment_open_period.sql`。

初次人工套用回報 `get_my_home_snapshot monthly availability predicate not found`：Windows 剪貼簿可使 dollar-quoted 比對文字保留 CRLF，原 SQL 只正規化 catalog 函式，測試共用 `read()` 又預先把 SQL 轉為 LF，漏測此情況。修正將比對與替換文字一併轉為 LF；integration 改讀原始檔案位元組，`--newline-matrix` 執行四種換行組合，另測兩支 RPC 的未知版型失敗回滾。人工失敗後正式 helper 不存在、三支函式仍為原版，沒有部分生效。

新增純函式 `get_monthly_payment_open_calculation_type()`，只依角色、收費模式與 raw program 決定付款開放模式。trigger 呼叫此 helper，不讓金額 snapshot 延後國中部付款。以可重跑且遇到未知函式版型就失敗的字串替換，只調整 `get_my_payment_submission_estimate()` 與 `get_my_home_snapshot()` 的開放條件，保留正式庫後續權限與季費金額歸屬修正。

既有 security definer RPC、固定 search_path、linked 範圍、付款本金／餘額與審核邊界保留。Migration 僅改 function，不新增／更新／刪除業務資料。不新增 RLS、Storage、Auth、Edge Function、cron 或環境變數。

Skills：project workflow、finance payments、auth permissions、delivery workflow、Supabase。

## 測試與證據

| 驗證 | 結果 |
| --- | --- |
| 舊邏輯重現 | `node tests/database/monthlyPaymentOpenPeriod.integration.mjs --red` 因原 trigger 拒絕已開放國中部 10 月而失敗 |
| 新增隔離 SQL 測試 | 每種換行組合 76 checks，共 304；實際估算／付款 RPC、首頁付款 projection、兩種模式、跨年、舊快照、權限、資料保護與未知版型回滾 |
| 正式函式版本隔離驗證 | 擷取僅含函式定義的 JSON，四種換行組合共 304 checks 通過；無遠端測試付款 |
| 強制費用 unit 回歸 | 21 檔／108 案通過 |
| 全付款 SQL 回歸 | 53 + 87 + 41 + 44 + 76 × 4 = 529 checks 通過 |
| Typecheck | 通過 |
| 全量 unit／build | 推送前 240 檔／1,233 案通過；第一次有既有 MainLayout import 的 5 秒逾時，單獨及 2 workers 全量重跑通過；1.1.69 `pnpm build` 通過 |
| 教練排班 SQL gate | 29 + 52 checks 通過 |
| GitHub CI／Vercel Preview | 使用者已授權將 DB 修正與管理員收費說明以 1.1.69 提交並推送目前 main；GitHub CI 由主分支推送觸發，結果待確認；未建立 Preview 分支或 PR |
| Supabase staging | 無獨立 staging；以隔離 PGlite 執行正式函式版本驗證 |
| 正式庫部署／post-check | 2026-10-01 已套用 `qwxzwomzoyfkorbwsscv`，history version `20261001032108`；4 支函式使用身分開放規則、原 RPC ACL 不變。月費 215、季費 332、付款回報 156、餘額流水 162 筆的完整資料 fingerprint 前後一致。8 項正式開放日期案例通過；以 authenticated 角色、真實有效非 ADMIN 綁定範圍唯讀查核 7 組，10 月估算皆 2,000 元、11 月不提供估算 |

## 發布與回退

只透過 Supabase `apply_migration` 套用上述獨立 migration 至已確認的專案，沒有使用 `supabase db push` 或重跑舊整份 migration。部署前後比對業務資料 fingerprint、既有 RPC ACL、helper 與三個受影響函式的定義；唯讀檢查真實國中部的 10 月／11 月估算，沒有建立真實付款。新檔名已對齊正式 migration history；先前未成功套用的本機檔名為 `20261001022912_junior_high_payment_open_period.sql`。

DB 回退採 forward-fix，原正式函式定義暫存於本機非 repo 路徑，可恢復三支既有函式；金額與付款資料沒有回填。前端／Edge rollback 不適用。

依 `.codex/skills/jg-baseball-delivery-workflow/SKILL.md` 與既有對話範圍，正式庫僅套用使用者已執行且回報錯誤的這一支 SQL；後續使用者另行授權在目前 main commit／push，包含管理員收費說明 UI 與 1.1.69 版本更新，沒有套用其他 migration。

## 剩餘驗證

未進行真實家長瀏覽器操作或真實付款；使用隔離環境實際 RPC 驗證以及正式庫唯讀 post-check，避免新增付款紀錄。
