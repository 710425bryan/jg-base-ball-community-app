---
name: jg-baseball-auth-permissions
description: "Role-based auth and permission workflow for jg-base-ball-community-app. Use when adding or changing protected routes, page visibility, action buttons, role checks, login behavior, router meta, or sensitive data access. Trigger on requests about 權限、角色、登入、路由守衛、`src/router/index.ts`、`src/stores/auth.ts`、`src/stores/permissions.ts`、`app_role_permissions`、或 feature/action 控制。"
---

# JG Baseball Auth Permissions

## Overview

用這個 skill 處理登入狀態、角色權限、路由守衛與功能顯示控制。把權限判斷集中在既有 router meta 與 permission store，不要在元件裡任意散落硬編碼角色邏輯。

## 讀取順序

1. 先讀 `AGENT.md`。
2. 讀 `src/router/index.ts`、`src/stores/auth.ts`、`src/stores/permissions.ts`。
3. 再讀受影響的 `view`、`layout`、`component` 與相關 Supabase 查詢。
4. 若任務牽涉敏感資料，再確認是不是應該改安全 view 或查詢路徑，而不是只改前端顯示。

## 路由與頁面規則

- 私有頁面掛上 `meta: { requiresAuth: true }`。
- 需要權限判斷的頁面補上 `meta.feature`，讓既有 guard 可以在無權限時導回 `/dashboard`。
- 沿用 `permissionsStore.can(feature, action)` 做頁面與按鈕控制，不要在元件中散落 `role === ...` 判斷。
- 記得 `ADMIN` 已經有全域 bypass，不要再重複寫一套特殊分支。

## Auth 守則

- 保留 `ensureInitialized()` 與 direct navigation 初始化流程。
- 保留 `syncAuthContext()` 內的 profile hydration 與 role reload 行為。
- 保留 magic link 僅允許 `profiles` 內既有 email 的限制。
- 若任務改到登入流程，確認不會破壞 `src/services/supabase.ts` 的 session 恢復。

## 權限資料守則

- 功能權限以 `app_role_permissions` 為準，UI 變更不要假設資料層會同步更新。
- 角色清單與排序若有調整，連同 `app_roles` 相關使用一起檢查。
- `dashboard` 與 `calendar` 目前屬於已登入即可看，除非任務明確要求，不要順手改變這個行為。
- 涉及球員敏感資料時，優先檢查是否應該改查安全 view，例如 `team_members_safe`。

## 驗證

- 至少驗證一條「有權限可進入」與一條「無權限被擋下」的路徑。
- 跑 `pnpm exec vue-tsc --noEmit`。
- 若有對 store 或 guard 行為補測試，優先針對修改點跑對應 vitest。
## 2026-04 Security Update

- `permissionsStore.can()` 只能控制畫面與互動，不代表資料庫已安全；變更權限時要先確認 DB 端是否也有 `has_app_permission()` / RLS 對應。
- `profiles`、`team_members`、`leave_requests`、`announcements`、`attendance_*`、`matches`、`fees` 相關表已改成 feature/action 驅動的 RLS；新增功能時要沿用同一套命名與檢查。
- 公開頁面請改走公開 RPC，例如 `get_public_landing_snapshot()`；不要在匿名情境直查 raw table。
- 登入前的 email 驗證要走 `can_request_magic_link()`，不要再匿名 `select profiles`.
- `team_members_safe` 僅供非敏感讀取；若要讀 `national_id`、`guardian_phone`、`contact_line_id`，必須改查 `team_members` 並確認 `players:EDIT` 或其他必要權限。
