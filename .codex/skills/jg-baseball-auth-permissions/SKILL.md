---
name: jg-baseball-auth-permissions
description: "Role-based auth and permission workflow for jg-base-ball-community-app. Use when adding or changing protected routes, page visibility, action buttons, role checks, login behavior, router meta, or sensitive data access. Trigger on requests about 權限、角色、登入、路由守衛、`src/router/index.ts`、`src/stores/auth.ts`、`src/stores/permissions.ts`、`app_role_permissions`、或 feature/action 控制。"
---

# JG Baseball Auth Permissions

## Overview

用這個 skill 處理登入狀態、角色權限、路由守衛與功能顯示控制。把權限判斷集中在既有 router meta 與 permission store，不要在元件裡任意散落硬編碼角色邏輯。

## 讀取順序

1. 先讀 `AGENTS.md`。
2. 讀 `src/router/index.ts`、`src/stores/auth.ts`、`src/stores/permissions.ts`。
3. 再讀受影響的 `view`、`layout`、`component` 與相關 Supabase 查詢。
4. 若任務牽涉敏感資料，再確認是不是應該改安全 view 或查詢路徑，而不是只改前端顯示。

## 路由與頁面規則

- 私有頁面掛上 `meta: { requiresAuth: true }`。
- 需要權限判斷的頁面補上 `meta.feature`，讓既有 guard 可以在無權限時導回 `/dashboard`。
- 沿用 `permissionsStore.can(feature, action)` 做頁面與按鈕控制，不要在元件中散落 `role === ...` 判斷。
- 記得 `ADMIN` 已經有全域 bypass，不要再重複寫一套特殊分支。

- `/my-payments` 新增付款回報的免綁定例外只限有效 `ADMIN`，不等同任何 `fees` feature 權限；集中於 `usePaymentSubmissionAccess` 與 DB `private.can_submit_payment_for_member()`。啟用／存取期間、原回報者、待審及金額檢查仍有效。

## Auth 守則

- 即時停權由 `profileAccessMonitor.ts` 只訂閱本人 `profiles.id` UPDATE，需先部署 `20261009134852_immediate_profile_suspension.sql` 開啟 publication；不可放寬 self/admin SELECT RLS。前景／重連／token／30 秒備援查詢與 access_end timer 補漏，請求須合併、可停止且隔離舊 session 回應；網路失敗不能冒充停權。
- 拒絕存取先清本機帳號及權限、卸載受保護 outlet，再 signOut；App 必須跳過草稿確認導回首頁並顯示 `AuthAccessNotice`。`permissions.fetchPermissions` 的舊請求也不得覆蓋清空／新帳號的權限。初始化尚未取得同帳號有效 profile 時不能視為已登入，失敗保留可重試的持久 session。
- 寄碼／重新寄碼都必須等 `can_request_magic_link` 明確 true 才呼叫 Auth OTP；使用 `shouldCreateUser: false`，欄位旁持續顯示拒絕原因。不得為測試向真實帳號寄碼。應用退出不等於 server ban 或所有資料 API 的 JWT 撤銷；離線或凍結裝置只能恢復後處理。
- 回歸：`profileAccessMonitor.test.ts`、`auth.test.ts`、`permissions.test.ts`、`App.test.ts`、`LoginModal.test.ts`、`AuthAccessNotice.test.ts`、`profileAccess.test.ts`、`router/index.test.ts`；SQL `node tests/database/immediateProfileSuspension.integration.mjs`；瀏覽器 `node tests/browser/verify-account-suspension.mjs`（需本機 dev server，API／Realtime 全部隔離）。

- 保留 `ensureInitialized()` 與 direct navigation 初始化流程。
- 保留 `syncAuthContext()` 內的 profile hydration 與 role reload 行為。
- 保留 magic link 僅允許 `profiles` 內既有 email 的限制。
- 若任務改到登入流程，確認不會破壞 `src/services/supabase.ts` 的 session 恢復。
- OTP 寄碼／驗證共用 `src/utils/otpLogin.ts` 正規化 email 與 8 碼數字；保留前導零、接受郵件空白／全形數字、不截斷超長輸入。只有取得 session 才能繼續 profile 檢查。`LoginModal` 的失效提示、60 秒 UI 冷卻、重新寄碼與忙碌期間防重複送出需一起驗證；有效期及限流仍由 Supabase Auth 決定，測試不可對真實使用者寄碼。

## 權限資料守則

- 功能權限以 `app_role_permissions` 為準，UI 變更不要假設資料層會同步更新。
- 角色清單與排序若有調整，連同 `app_roles` 相關使用一起檢查。
- `dashboard` 與 `calendar` 目前屬於已登入即可看，除非任務明確要求，不要順手改變這個行為。
- 涉及球員敏感資料時，優先檢查是否應該改查安全 view，例如 `team_members_safe`。

## 新增角色與複製權限

- 入口為 `RolePermissionsManager.vue` 的新增角色視窗；「複製角色權限」使用單一 Element Plus 選單，預設不複製，開啟或取消後重新開啟需清除來源選取。
- 其他系統與自訂角色皆可作來源；`ADMIN` 的最高權限來自 bypass，選項需停用並說明無法複製，RPC 同樣拒絕 ADMIN 來源。
- `src/services/rolesApi.ts` 的 `createAppRole()` 呼叫 `create_app_role(p_role_key, p_role_name, p_copy_from_role_key)`；不要回退為前端逐筆建立角色／複製權限。RPC 限有效 ADMIN，保留角色管理原有安全限制，角色與完整已儲存 feature/action 在同一交易建立。
- 複製為建立時快照，包含目前矩陣外的已儲存權限；後續可獨立調整，不連動或修改來源。不複製則沒有權限列；來源不存在、重複角色或權限寫入失敗必須整筆回滾。
- 成功後刷新元件角色清單與 permission store 角色選項，讓使用者管理可選到新角色。新 RPC migration 必須先於前端部署，未部署時應保留表單及顯示錯誤，不以兩段寫入 fallback。

## 角色顯示排序

- 排序以 `app_roles.weight` 升冪為準，相同數字依 `role_key` 穩定排序；未知角色／缺值使用 99。不要依名稱為「排班教練」等特殊字串插隊，也不要用數字判斷授權。
- `RoleSortEditor.vue` 在桌面選取角色區塊與手機 Drawer 提供 Element Plus 正整數欄位及保存；ADMIN／其他系統角色也可調整。`rolesApi.updateAppRoleWeight()` 呼叫 `update_app_role_weight(p_role_key, p_weight)`，以 SECURITY INVOKER 沿用原 RLS，並驗證有效 ADMIN；只更新 weight，不更動其他角色欄位或權限列。
- 保存成功先以 RPC 結果同步元件與 permission store 角色清單，再重新查詢；後續載入失敗時，使用者名單兩種模式及角色選項仍採已保存的新順序。RPC 保存失敗保留輸入。新增自訂角色預設 99，再使用排序操作調整；不增加 `create_app_role()` 的 weight 參數，也不複製來源 weight。
- 初始八個精確 role key／數字對照見 `docs/PROJECT_LOGIC.md`。初始設定 migration 先於前端部署；管理者後續手動調整後不可把同一 migration 當重設腳本重跑。
- 固定排班範本的「固定教練」、排班卡片／手動排班的「指派教練」使用相同 weight／role_key 順序及 role_name 分組標題，父頁載入與範本開啟／重載時沿用 permission store 取得角色清單；分組只整理既有可排班教練，不依角色數字擴大候選或授權。相關 helper 為 `coachScheduleCoachOptions.ts`；卡片原請假停用仍有效。

## 驗證

- 至少驗證一條「有權限可進入」與一條「無權限被擋下」的路徑。
- 跑 `pnpm exec vue-tsc --noEmit`。
- 若有對 store 或 guard 行為補測試，優先針對修改點跑對應 vitest。
- 新增角色／權限複製至少跑 `RolePermissionsManager.test.ts`、`rolesApi.test.ts` 與 `pnpm test:roles:sql` 隔離 SQL 回歸（亦納入 `pnpm check`）；涵蓋不複製、系統／自訂來源、空權限、矩陣外權限、快照獨立性、ADMIN 來源拒絕、來源失效／重複識別碼回滾及無權限呼叫。手機視窗需補真實 Element Plus 的選單、取消重開、錯誤保留與儲存流程；實體手機／正式帳號與遠端部署證據需另記。
- 排序數字需跑 `RoleSortEditor.test.ts`、`RolePermissionsManager.test.ts`、`rolesApi.test.ts`、`userRoleOrder.test.ts`、`UsersView.test.ts`、`permissions.test.ts` 與 `pnpm test:roles:sql`；驗證初始精確 keys、正整數／無效輸入、ADMIN 及系統／自訂角色可改、保存結果同步／重新查詢失敗、相同數字／未知角色順序、RLS 阻擋與授權資料保留。手機 Drawer 與桌面排序輸入、保存及失敗恢復需補瀏覽器驗證。
## 2026-04 Security Update

- `permissionsStore.can()` 只能控制畫面與互動，不代表資料庫已安全；變更權限時要先確認 DB 端是否也有 `has_app_permission()` / RLS 對應。
- `profiles`、`team_members`、`leave_requests`、`announcements`、`attendance_*`、`matches`、`fees` 相關表已改成 feature/action 驅動的 RLS；新增功能時要沿用同一套命名與檢查。
- 公開頁面請改走公開 RPC，例如 `get_public_landing_snapshot()`；不要在匿名情境直查 raw table。
- 登入前的 email 驗證要走 `can_request_magic_link()`，不要再匿名 `select profiles`.
- `team_members_safe` 使用 invoker 權限與底層 RLS：linked user 只看綁定球員，相關 VIEW 權限看全隊安全欄位。
- 若要讀 `national_id`、`guardian_phone`、`contact_line_id`，必須以 `players:EDIT` / `ADMIN` 呼叫 `list_team_members_for_edit()`；不可直接改查 raw `team_members`。
