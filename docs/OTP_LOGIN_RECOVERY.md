# OTP 登入失效排查與恢復流程（2026-09-09）

- 起始工作區乾淨，`main` 已由 `620ef6f` fast-forward 到 `07767d3`；本次登入修正納入 `1.1.57` patch release，使用者已明確要求直接推送 `main`。
- 截圖顯示 `Token has expired or is invalid`。已用唯讀查詢確認綁定專案 `qwxzwomzoyfkorbwsscv` 為 `jg-base-ball-community-app`，截圖帳號的 `can_request_magic_link()` 為 true，Auth 沒有封鎖期限。
- Auth 帳號於台灣時間 2026-09-09 19:00:39 建立，最後寄送確認信為 19:08:15，首次驗證及最後登入時間為 19:08:41。該帳號沒有可查的 `auth.audit_log_entries` 事件；這些資料不能還原截圖 19:05 那次失敗的確切原因，不能斷言是超時、舊碼、誤輸入或其他原因。
- 未讀取驗證碼／token，未替使用者寄信，未修改線上帳號、Auth 設定或資料庫。

## 已確認的程式缺口與修正

| 檔案 | 原行為與修正 |
| --- | --- |
| `src/components/LoginModal.vue` | 只顯示英文錯誤且沒有直接重寄入口；改成持續顯示中文錯誤、短視窗自動捲到錯誤、60 秒冷卻後重新寄碼。送出期間防重複請求、切換 email 與關閉。 |
| `src/utils/otpLogin.ts` | 集中 email 與 OTP 正規化、完整 8 碼檢查與錯誤訊息。原 `maxlength=8` 會在處理帶空白的貼上內容前截斷，現在整理空白／全形數字並保留前導零，超長與非數字輸入不送出。 |
| `src/stores/auth.ts` | 原寄碼會整理 email、驗證直接用原始 email；現在兩者共用相同正規化。驗證無 session 時不可回報成功，後續 profile 停權／可登入期間與權限 hydration 照常檢查。 |

公開登入保留既有原生 email／文字控制與品牌卡片，補 `autocomplete=email`、`autocomplete=one-time-code`、數字鍵盤、ARIA label／錯誤關聯。卡片有視窗高度上限與內部捲動，操作按鈕至少 44px；本次不變更登入後 Element Plus 表單規範。

60 秒為前端重寄冷卻，實際有效期及限流由 Supabase Auth 決定；未改動線上設定。參考 [Supabase passwordless email 文件](https://supabase.com/docs/guides/auth/auth-email-passwordless) 與 [Auth 錯誤碼文件](https://supabase.com/docs/guides/auth/debugging/error-codes)。

## 驗證

- `pnpm exec vitest run src/utils/otpLogin.test.ts src/components/LoginModal.test.ts src/stores/auth.test.ts src/router/index.test.ts src/utils/profileAccess.test.ts`：5 files／40 tests 通過。涵蓋格式整理、重複送出、重新寄碼、限流、禁止未授權寄碼、驗證後拒絕失效 profile、允許有效登入與路由授權。
- `pnpm build`：型別檢查與 production build 通過；保留既有 Browserslist 資料過期、chunk 大小及測試中的 Vue Router 棄用警告。
- 環境缺少 `agent-browser`，以專案既有 Playwright 操作本機頁面；所有 Supabase API 均攔截為模擬資料。六種尺寸（320×568、360×480、360×780、390×844、700×900、1280×900）皆完成寄碼、貼上格式整理、失效提示、自動捲到錯誤、冷卻後重寄、成功登入導向 `/dashboard`；沒有 page error 或 Dialog 水平溢出，按鈕至少 44px。
- 瀏覽器驗證腳本：`/tmp/jg-otp-browser-check.mjs`；截圖：`/tmp/jg-otp-error-<寬>x<高>.png`。
- 未驗證真實郵件重新寄碼、真實 iPhone 鍵盤／郵件自動填入／safe area 及系統文字放大；短視窗檢查不能取代 iPhone 實機驗收。本次沒有 DB 變更，也不影響費用計算。
- 文件、skill 為流程紀錄，採 diff 檢查；未新增 migration。`public/version.json` 由正式建置同步至 `1.1.57`，不納入無關的 `dev-dist/sw.js` 與 `supabase/.temp/cli-latest` 變更。

## 1.1.57 發布範圍

- Git 目標：`origin/main`，沿用 Vercel Git integration；正式部署完成與否需另以遠端狀態確認。
- Release manifest：本次登入修正、對應測試／文件、`package.json` 與建置產生的 `public/version.json`。Supabase migration、Edge Function、Auth 設定、Storage 與環境變數變更皆為 N/A。
- 發布前執行 `pnpm check` 與 `git diff --check`，核對兩份版本均為 `1.1.57`；push 後核對本機與遠端 commit 一致。
- 發布驗證：依 `pnpm-lock.yaml` 補齊 main 新增的 PDF 套件後，`pnpm check` 通過（219 files／1,123 tests、型別檢查與 production build）；沒有修改套件版本或鎖定檔。GitHub CI／Vercel 為 push 後的遠端檢查，不以本機通過代替上線確認。
- 如需回復，前端可回滾至本次發布前 `07767d3` 對應部署；本次不需要 DB rollback。
