---
name: jg-baseball-registration-forms
description: "Competition registration, reusable template, roster selection and OOXML generation workflow for jg-base-ball-community-app. Use when changing /registration-forms, registration_forms permissions, registration_form_events, registration_form_event_templates, registration_form_templates, registration_form_generation_logs, the private registration-forms bucket, registrationFormsApi, RegistrationEventDialog, RegistrationFormWizard, or registration-form-documents Edge Function."
---

# JG Baseball Registration Forms

## Overview

用這個 skill 處理賽事報名主檔、可重用範本上傳／下載、有效球員選取、輸出欄位補正、Excel / Word OOXML 自動填寫、照片關聯與個資安全。這個功能會接觸身分證、生日與照片，前端路由或按鈕不是安全邊界。

## 讀取順序

1. 先讀 `AGENTS.md`。
2. 讀 `docs/PROJECT_LOGIC.md` 的「報名表範本與產檔」與 `docs/FILE_MAP.md`。
3. 讀 `src/types/registrationForm.ts`、`src/utils/registrationForms.ts`、`src/services/registrationFormsApi.ts`。
4. 若改 UI，讀 `src/views/RegistrationFormsView.vue`、`RegistrationEventDialog.vue` 與 `RegistrationFormWizard.vue`。
5. 若改權限或路由，讀 `src/router/index.ts`、`src/layouts/MainLayout.vue`、`src/components/RolePermissionsManager.vue` 與 `jg-baseball-auth-permissions` skill。
6. 若改完整名單欄位，讀 `src/stores/playerRoster.ts`、`src/services/playerRosterApi.ts` 與 `jg-baseball-roster-users-team-groups` skill。
7. 若改 DB / Storage，讀 `supabase_registration_forms_migration.sql`、`supabase/migrations/*registration_form_events.sql` 與 `docs/MIGRATIONS.md`。
8. 若改產檔，讀 `supabase/functions/registration-form-documents/index.ts`、`logic.ts`、對應測試與 `docs/EDGE_FUNCTIONS.md`。

## 固定安全邊界

- 路由 `/registration-forms` 使用 `meta.feature = 'registration_forms'`。
- feature actions 固定為 `VIEW / CREATE / EDIT / DELETE`；migration 只預設授予 `ADMIN`。
- 範本上傳需 `registration_forms:CREATE`，刪除需 `DELETE`，原檔讀取需 `VIEW`。
- 產生含完整個資文件必須同時檢查 `registration_forms:CREATE` 與 `players:EDIT`。
- Edge Function 必須以呼叫者 JWT 建立 user-scoped client 呼叫 `list_team_members_for_edit()`；不可用 service role 直接讀 raw `team_members` 取代。
- 姓名、`portrait_auth`、`avatar_url` 由後端完整名單決定，不接受前端 override。未授權者不可置入照片。
- 本次補正值只寫入輸出檔，不更新 `team_members`。
- Storage object key 必須使用 UUID 與 ASCII 固定檔名；使用者原始檔名只保存於 `original_file_name`，不可直接拼入 object key。
- multipart 傳輸檔名固定使用 ASCII `template.xlsx` / `template.docx`，原始檔名以獨立文字欄位傳送；後端以已驗證 OOXML profile 決定實際 file type，不可只信任 multipart `File.name`。
- `registration_form_generation_logs` 不可加入球員 ID、個資欄位、request payload 或產出檔 path。
- `registration_form_events` 與 `registration_form_event_templates` 只保存賽事 metadata／範本關聯，不保存球員 ID、個資或產出檔；產檔前必須由後端驗證 event-template 關聯。
- 產出檔只回傳 binary，必須含 `Cache-Control: no-store`，不可上傳到 Storage。

## 版型與 OOXML 規則

- 第一版只接受 `.xlsx` / `.docx` 及兩個 profile：
  - `just_baseball_taipei@1`：30 人、Excel 球員資料／照片工作表。
  - `chairperson_cup_u9@1`：20 人、Word 表格／照片格。
- 未知結構要回「尚未支援」，不可只用副檔名判斷成功。
- 原始 ZIP 上限 10 MB、中央目錄 500 entries、總解壓 50 MB；先檢查中央目錄再解壓。
- 拒絕路徑穿越、ZIP64、macro / VBA、OLE / embeddings、外部 relationships。
- 修改目標 cell / table cell / drawing relationship；保留其他 XML、合併、字型、列印與頁面設定。
- 照片只允許同一 Supabase 專案的 `avatars` bucket，單張最多 1 MB、JPEG / PNG；等比例縮放、置中、不裁切。
- Excel 投打只輸出 `R / L`；「左右開弓」或同時含左右的值必須阻擋並由使用者人工選擇。
- `portrait_auth` 是布林來源；未授權或缺照片只顯示警告並清空照片格，不阻擋產檔。

## UI 規則

- 頁面使用 `AppPageHeader`、`AppLoadingState` 與 Element Plus 表單控制。
- 主頁固定以「賽事報名／範本庫」分流；範本可掛到多場賽事，產檔只能從賽事內進入。
- 賽事狀態固定為草稿／準備中／已送出／已截止；草稿第一次成功產檔後推進準備中，已截止事件不可產檔。
- 精靈固定三步：隊職員資料、球員選取／排序、檢查下載。
- 隊職員姓名使用可搜尋／可自訂的名單選單；選取有效教練、管理群、球員或校隊成員時，自動帶入完整名單的 `guardian_phone`，本次電話仍可手動修正且不得回寫主檔。
- 有效名單只含角色「球員／校隊」，排除退隊、離隊與 `is_inactive_or_graduated = true`。
- 球員選取提供「所有人」、依 `birth_date` 即時計算的動態 U-level 與「清除全選」快捷操作；超過版型容量時只依背號選取前 N 人並顯示提醒。
- 預設依數字背號排序；可調整輸出順序，且不得超過 profile 容量。
- 守位只在版型有對應欄位時顯示且為非必填；有選擇時才輸出，留白不得阻擋產檔。
- 必填缺漏要在精靈內列出並阻擋；照片／肖像只列 warning。
- 檔案選擇使用 Element Plus `el-upload`；Dialog 在 `<768px` 不得超出 viewport，所有主要操作保持至少 44px。

## 驗證

- 前端純邏輯／API／頁面：
  `pnpm exec vitest run src/utils/registrationForms.test.ts src/services/registrationFormsApi.test.ts src/components/registration-forms/RegistrationFormWizard.test.ts src/views/RegistrationFormsView.test.ts`
- DB / Edge boundary：
  `pnpm exec vitest run src/services/registrationFormsMigration.test.ts src/services/registrationFormDocumentsEdge.test.ts`
- OOXML：
  `pnpm exec vitest run supabase/functions/registration-form-documents/logic.test.ts`
- 共用權限／導覽：跑 `src/router/index.test.ts`、`src/layouts/MainLayout.test.ts`、`src/components/RolePermissionsManager.test.ts`。
- 型別與建置：`pnpm exec vue-tsc --noEmit`、`pnpm build`、`git diff --check`。
- 實檔：兩個已知附件各驗 1 人與滿額；Word 需 render 全頁，Excel 需 inspect 目標 range / drawings，確認缺照格空白、照片置中、不跨頁且版式／列印設定保留。
