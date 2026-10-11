# 角色中文顯示名稱與 1.1.75 發布

- 日期：2026-10-11
- 狀態：IMPLEMENTED；1.1.75 Git 發布準備完成，正式資料庫尚未套用。
- 使用者授權：新增可編輯的中文顯示名稱，先檢查系統判讀；接續要求升 patch 版號、commit、push 到目前 main。

## 目標與邊界

- 角色設定的桌面區塊及手機 Drawer 可修改顯示名稱，角色識別碼只讀。
- 有效 ADMIN 可改系統／自訂角色名稱；名稱去首尾空白、必填、最多 100 Unicode codepoints。
- 僅修改 app_roles.role_name，不改 role_key、weight、is_system、profiles.role 或權限列。
- 不納入原工作區通知請求去重、auth last-seen、維運與歷史推播處置；不部署 Edge Functions、調整 secrets 或直接套用正式 SQL。

## 判讀稽核與修正

- 前端權限、ADMIN bypass、DB helper／RLS、推播受眾與教練資格使用角色識別碼；名稱只作顯示。
- 唯一發現的名稱依賴是 PlayersView 同步家長帳號時優先搜尋「一般成員」。抽至 guardianAccountRole，只按 MEMBER → PARENT → GENERAL_MEMBER 選擇，保留既有 MEMBER fallback。
- 正式 Supabase qwxzwomzoyfkorbwsscv 唯讀確認 app_roles 主鍵／permission 外鍵均為 role_key；沒有 role_name policy 或 app_roles 非內建 trigger。引用 role_name 的函式為角色建立流程，current_profile_role 仍回有效 profiles.role。
- 導覽、公開頁登入徽章與個人設定改讀 shared role metadata；只在已有效登入且本人 profile 一致後補載名稱。不增加匿名 raw-table 存取或跨裝置 Realtime。

## 實作與安全

- RoleNameEditor／RoleSortEditor 各自保存，另一欄未儲存草稿不因 metadata 更新而清除。
- 保存中切換角色不卸載 editor，延遲回應仍同步正確角色與 store；不覆寫新選取角色輸入。
- RolePermissionsManager 先採 RPC 回傳結果更新本機與 permission store，再刷新清單；刷新失敗保留已保存結果。
- update_app_role_name(text,text) 為 SECURITY INVOKER、空 search_path，檢查 auth.uid 與 current_profile_role()='ADMIN'，沿用現有 RLS；只向 authenticated 授予 EXECUTE。
- API 缺失時顯示 migration 提示並保留輸入，不以 raw update fallback。

## 驗收證據

- 相關 Vitest 19 files／176 tests 通過；最終版面修补後 editor／manager 3 files／38 tests 通過。
- 角色隔離 SQL 216 checks：建立 84、排序 71、名稱 61；涵蓋系統／自訂改名、名稱界線、無權限／停用／過期／未到期／匿名／RLS 拒絕、交易回滾及授權資料保留。
- Chromium 360／390／700／1280 px 共 95 checks、33 screenshots；成功、失敗保留、防重複、唯讀 key、使用者表格／卡片／選項同步、權限不變、草稿保留、延遲回應切換、100 字連續英中名稱換行及手機 touch scroll 通過，零外部請求與 console error。
- 瀏覽器證據：/tmp/jg-role-name-verification/evidence.json。實體 iPhone／Android 鍵盤及硬體 safe area 尚未驗收。
- 正式發布檢查在僅含暫存區內容的獨立副本執行 `pnpm check` 全數通過：typecheck、272 Vitest files／1498 tests、角色 SQL 216 checks、教練 SQL 508 checks、付款 SQL 613 checks、production build。log：`/tmp/jg-role-release-check.log`；獨立副本的 package／public／dist 版本一致為 1.1.75。

## Release manifest

- Git：main → origin/main，版本 1.1.74 → 1.1.75；public/version.json 由 Vite 正常產生。
- Vercel：依既有 Git integration 觸發，未手動部署；CI／部署狀態須另查，不能用 Git push 成功代替。
- Supabase：supabase/migrations/20261011150448_app_role_display_names.sql，僅提交；此回合僅授權 commit／push，正式套用另行處理；發布前唯讀確認 `to_regprocedure('public.update_app_role_name(text,text)')` 為 null，保存功能在套用前會顯示尚未更新提示。
- migration 為相容性新增 RPC，沒有資料回填；依賴既有 app_roles、current_profile_role、ADMIN-only RLS。正式使用新保存功能前需先套用 migration 並確認 ACL／函式內容。
- Edge Functions、Storage、Auth、環境變數：不變。

## Rollback 與剩餘限制

- 前端可回退上一版本 commit ffb6256 的 Vercel deployment；新 RPC 可保留，不自動刪除或回寫已改名稱。
- 目前只有本機隔離 SQL 驗證，未做遠端 staging／正式帳號保存驗證；Git 提交不代表資料庫或完整功能上線。
- 未提交的既有工作持續留在原 checkout，不進這次發布。
