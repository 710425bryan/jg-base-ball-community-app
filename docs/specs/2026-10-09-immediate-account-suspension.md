# 帳號停權即時登出與寄碼阻擋

- 狀態：`IMPLEMENTED`（1.1.73 發布內容驗證完成；遠端 CI／部署以該 commit 狀態為準）
- Delivery 目標：使用者授權升 patch、commit 並 push 目前 main；由既有 Vercel Git integration 發布。
- 需求：管理者停權後，已登入使用者立即退出；停權帳號不可寄送登入驗證信；提供實際 UI 截圖。

## 行為與安全邊界

- 前端只訂閱本人 `profiles.id` 的 UPDATE，沿用 self SELECT RLS，不新增公開資料或匿名 profile 查詢。
- 即時收到 `is_active = false` 時先清除記憶體帳號與權限、卸載受保護畫面，再進行本機 Supabase session 登出及回首頁；網路請求與未儲存表單不得阻擋退場。
- Realtime 訂閱成功、回前景、恢復網路、token 更新及 30 秒備援檢查重新確認本人存取狀態；讀取錯誤不冒充停權，舊帳號／已停止監聽的回應不得清除新帳號。
- 「立即」指已連線且正在執行的新版頁面接收資料庫事件後即刻退場。離線／系統凍結裝置須待恢復連線／前景；不能承諾遠端清除已下載的內容。
- 初次寄碼與重新寄碼皆呼叫既有 `can_request_magic_link`，唯有明確 true 才能呼叫 Auth OTP；錯誤／false 不寄信，不顯示已寄出。
- 不更動 Auth SMTP、帳號資料、角色、費用、全域 RLS 或 managed Auth tables。本次是應用程式退出控制，既有直接 Data API／Auth API 的完整封鎖不以 UI 登出代替。

## 驗收

- [x] 已登入時收到停權異動，不重新整理就移除後台並顯示登出原因。
- [x] 停權後切頁、token 刷新與晚到的 profile 回應不可恢復登入。
- [x] 停止監聽／切換帳號可清除 channel、timer 與 DOM listeners。
- [x] 重連／回前景／備援檢查能捕捉漏掉的停權；網路錯誤可恢復。
- [x] 停權寄碼與停權後重新寄碼沒有 Auth OTP 請求；正常帳號仍可寄碼。
- [x] 桌機與手機瀏覽器截圖、單元測試、型別檢查、SQL 回歸與 build 通過。

## 實作與發布

- 使用 skills：project-workflow、auth-permissions、roster-users-team-groups、delivery-workflow、Supabase。
- 新 service 負責本人狀態監聽；auth store 管理失效、世代隔離與 session 清除；App 負責受保護 outlet 與強制導回；LoginModal 顯示持續錯誤。
- Migration：僅把 profiles 加入 `supabase_realtime` publication，保留既有 self/admin SELECT RLS。2026-10-09 發布前唯讀確認正式 profiles 已加入 publication，且原 self SELECT policy 保留；migration history 未記錄本檔，不能推定曾完整套用。本次不重套遠端 SQL。
- 前端版本：1.1.72 → 1.1.73；只提交本次停權／寄碼變更與必要測試、文件，其他工作區變更保留。
- Supabase：僅唯讀核對正式 schema；本機隔離 SQL 測試，不停權真實帳號、不寄真實信件。
- 回滾：回前一前端；publication 可保留且不放寬 RLS，不回滾使用者停權資料。

## 驗證證據

- 2026-10-09：targeted 52 tests 通過；最後 auth／permissions／App 35 tests 通過。
- 全量 Vitest：`pnpm exec vitest run --maxWorkers 4 --exclude scripts/supabase-recovery-observer.test.mjs`，267 files／1474 tests 通過。原始全量指令會把工作區既有 Node `node:test` 檔案當成 Vitest suite，報 No test suite found；該檔未修改，以 `node --test scripts/supabase-recovery-observer.test.mjs` 另跑 13 tests 通過。沒有略過有效案例，原樣 `pnpm check` 仍有這個既有 runner 相容問題。
- `pnpm build`（包含 vue-tsc）通過，保留既有 chunk size 與 Browserslist 提示；不升版、不手改產物。
- `node tests/database/immediateProfileSuspension.integration.mjs`：14 checks 通過，涵蓋 publication 冪等、RLS/grants 保留、停權本人資料可讀、停權 ADMIN 不再取得 role、匿名不可查 profile、啟用／停權／不存在／空白／未開始／過期／重新啟用的寄碼前檢查。
- `pnpm test:roles:sql`、`pnpm test:coach-schedules:sql`、`pnpm test:payments:sql` 全部通過；新功能不修改計費邏輯。
- `node tests/browser/verify-account-suspension.mjs`：390／1365px 兩個獨立 session，實際 App + SDK、隔離 REST/Auth/Realtime 協定，停權事件後無 reload 即退出、清除 localStorage session、導回首頁與持續提示。停權後寄碼 Auth OTP 呼叫數為零，重新啟用後可寄碼，無 pageerror；外部 Google Calendar iframe 被刻意攔截。返回按鈕 ≥44px，提示畫面覆蓋 viewport，無水平溢出。
- 截圖與 machine-readable 證據：`/Users/bryan/.codex/visualizations/2026/10/09/01a120e3-8a3e-7261-94ef-a55fec8a5d7a/suspension-update/`。
- `git diff --check` 通過；保留任務開始時已存在的通知、last-seen、維運腳本與文件變更。
- 尚未驗證：Supabase staging、真實跨裝置停權事件及背景凍結、真實 Auth 郵件／跨裝置網路、Vercel Preview／正式。初次實作僅本機調整及截圖；後續已授權升版、commit／push，Git／CI／部署結果另記，未執行遠端 DB mutation 或真實寄信。
- 發布順序：先套用 `20261009134852_immediate_profile_suspension.sql` 並核對 publication membership／原 RLS，再發布前端並讓客戶端載入新版。舊版已開啟的頁面不會自動得到新增的 listener，不能宣稱所有既有舊版畫面已即時退出。

## 1.1.73 發布驗證

- 依使用者授權升 patch 並提交／推送 main。從 Git index 匯出實際發布內容獨立驗證，未納入其他通知刷新、last-seen 去重或維運工作。
- 完整 `pnpm check` 通過：266 files／1459 tests、型別檢查、角色／教練／付款 SQL 與 production build。隔離發布副本沒有未提交的 Node observer 測試，因此不需排除任何測試。
- 新增停權 SQL 14 checks 通過；發布副本 390／1365px 瀏覽器驗證通過，無 pageerror。證據 `/tmp/jg-release-1.1.73-check.log`、`/tmp/jg-release-1.1.73-browser/evidence.json`。
- package／public／dist 版本一致為 1.1.73；public/version.json 由 Vite build 產生。
- 正式 `qwxzwomzoyfkorbwsscv` 唯讀 post-check：profiles 已列於 supabase_realtime，`profiles_select_self_or_users_view` 仍允許 auth.uid() = id；migration history 查無本檔版本／名稱。本次沒有套用 SQL、修改真實帳號或寄信。
- Git push 後由既有 GitHub CI／Vercel Git integration 執行；最終結果以該提交的檢查及 deployment 為準，不把本機通過等同正式跨裝置驗收。
