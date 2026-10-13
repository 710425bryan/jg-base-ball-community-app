# 點名管理：月份查詢與卡片／表格檢視

- 狀態：`VERIFYING`；Delivery 目標：`PRODUCTION`
- 日期：2026-10-13；版本：1.1.81
- 需求：預設本年本月，不一次讀取全部歷史；可切換卡片／表格，月份欄與「回到本月」按鈕高度一致。使用者已明確要求「幫我更新部署上去」。

## 範圍與驗收

- 進入 `/attendance` 預設台灣本年本月；月份可跨年選擇，亦可回到本月。
- `listAttendanceEvents(month)` 在 Supabase query 使用月初（含）／次月月初（不含）範圍，只讀取該月事件及關聯點名狀態；無效月份拒絕查詢。
- 卡片及表格使用相同摘要，切換檢視不發新請求；快速切換月份不讓舊結果／錯誤覆蓋新月份，失敗可重試目前月份。
- 表格提供既有開始點名及刪除操作，保留 CREATE／DELETE 權限及確認流程。出席／請假／缺席計數與場地名單範圍不變；不修改點名 detail、假單、費用或推播。
- 日期欄、回到本月及檢視切換均 44px；桌機日期欄與按鈕上下緣對齊。手機表格只在自身容器水平捲動。

## 影響與安全邊界

| 項目 | 內容 |
| --- | --- |
| 前端 | AttendanceListView、attendanceEvents service、attendance summary 型別及相應測試 |
| 權限 | 沿用 attendance route／CREATE／DELETE UI 與 DB `has_app_permission` RLS；不新增權限 |
| 資料 | 保留 event、profiles 姓名／暱稱、status 統計與安全 id count；不增加敏感欄位 |
| Supabase schema／RPC／RLS／cron | N/A，無 migration、backfill 或資料修復 |
| Edge Functions／Storage／Auth／通知 | N/A，無部署或設定異動 |
| 環境變數 | 無變更，沿用現有 Vercel 環境 |
| PWA／舊 WebView | package 版本升為 1.1.81，version.json 由 build 產生；保留 hash router、legacy build 與更新提示 |

## 驗證證據

| 項目 | 結果 |
| --- | --- |
| 月份 service／View／檢視切換／請假／摘要 | 6 檔 47 tests 通過，包含台灣跨月、跨年／閏月、無效月份、場地計數、請求競態、失敗重試與兩種檢視操作 |
| 手機規則 | 60 tests 通過；高度補正後重跑 View＋手機規則 68 tests 通過 |
| Chromium 隔離頁面 | 360／390／767／1365px 無頁面水平溢出；真實 Supabase client 送出 gte／lt 月份條件，檢視切換沒有新增請求；日期欄及回到本月實測皆 44px，桌機頂緣相同。資料回應使用 fixture |
| 完整本機 gate | 1.1.81 `pnpm check` 通過：型別、297 檔／1,858 tests、observer、players／roles／training／coach／payments／matches SQL 回歸與 production build；`git diff --check` 通過 |
| GitHub Secret scan／Quality gate | 待執行 |
| Preview／Production | 待執行；只做唯讀 smoke，資料寫入不屬此次發布驗收 |
| Supabase staging | N/A，無 DB／Edge 變更 |

證據：`output/playwright/attendance/`（ignored），包含 `evidence.json`、`height-evidence.json` 與各尺寸截圖；發布證據存於其 `release/`。純型別、文件、版本號無獨立 unit test，分別以 typecheck、diff review、build／線上版本檔驗證。

## Release Manifest 與順序

- GitHub：`710425bryan/jg-base-ball-community-app`
- Branch：`codex/attendance-month-views`；基底 main `f31375ac8f3c5be347f8bdce982b7e9d0e04ee92`。
- Vercel project：`prj_Ct3Ifa2JcREe4U5ZrOZpXhiJ7wjL`；team：`team_NtAzFlUwIuQX9YmCAMDxzHoX`。
- 正式分支：`main`；正式網址：https://jg-base-ball-community-app.vercel.app。
- 發布：完整本機驗證 → feature commit／PR → CI 與唯讀 Preview smoke → 合併主分支 → production CI／deployment／版本與資產驗證。
- 不包含工作區原有的其他功能發布文件修改。
- 回復候選：1.1.80 `dpl_8uCMZ75ejc9qn7nazCz6QmUkLhu6`；前端可回復到此 Vercel deployment，無 DB 回滾。
- 使用技能：project workflow、leave attendance、delivery workflow、Vercel deployments、Playwright／verification。

## 最終狀態與限制

- 發布進行中；尚未宣稱正式站已更新。
- 未驗實體 iPhone／Android safe area 或正式登入後真實點名操作；以隔離功能驗證及公開站唯讀 smoke 區分記錄。
