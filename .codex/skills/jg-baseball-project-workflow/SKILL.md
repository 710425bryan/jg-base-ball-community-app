---
name: jg-baseball-project-workflow
description: "Project-specific workflow for jg-base-ball-community-app. Use when Codex is asked to modify this repo's Vue 3 + Vite + TypeScript + Supabase app, especially page or component changes, page title styling, Pinia stores, router, services, composables, utils, migrations, Edge Functions, PWA behavior, or repo-wide validation. Trigger on requests about 本專案、社區棒球管理系統、頁面 title 樣式、Supabase、Google Sheet 同步、Google Calendar 同步、推播通知、權限、或此 codebase 的一般功能修改。"
---

# JG Baseball Project Workflow

## Overview

用這個 skill 當成此 repo 的預設工作入口。先用最小上下文定位任務，再只修改必要原始碼，維持既有 Vue + Supabase 資料流與專案風格。

## 啟動流程

1. 先讀 `AGENT.md`。
2. 再讀與任務直接相關的檔案。
3. 若任務牽涉路由、登入、權限、同步、推播，再補讀對應的 `router`、`stores`、`services`、`utils` 或 `supabase/functions`。
4. 先辨識目標檔案是原始碼、產物、腳本、還是 migration，確認真的該編輯才動手。

## 編輯邊界

- 把頁面專屬邏輯留在 `src/views/`。
- 把可重用 UI 放在 `src/components/`。
- 把可測試邏輯優先放在 `src/utils/` 或 `src/composables/`。
- 把外部資料存取與 Supabase 溝通集中在 `src/services/`。
- 把資料庫變更做成新的 `supabase_*_migration.sql`，不要直接覆寫既有 migration。
- 把 `public/version.json`、`dev-dist/`、`dist/` 視為產物，除非任務明確是建置或 PWA 輸出。
- 新增 route-level 頁面或新功能域時，同步建立 / 更新流程規則：`AGENT.md`、`docs/PROJECT_LOGIC.md`、`docs/FILE_MAP.md`、`AI_SKILLS.md`，以及對應 `.codex/skills/<feature>/SKILL.md`。若併入既有 skill，要在回報中說明。

## 固定守則

- 保留 `createWebHashHistory()`，除非任務已明確包含部署相容性評估。
- 保留 `src/services/supabase.ts` 既有的 token refresh 與休眠恢復保護。
- 不要擴散 `national_id`、`guardian_phone`、`contact_line_id` 等敏感欄位。
- 顯示球員資料時，先確認是否該走 `team_members_safe` 等安全讀取路徑。
- 延續現有繁體中文文案與命名，不要因個人偏好大改風格。
- 改到球員、請假、特訓報名 / 點數、收費、賽事等核心流程時，順手檢查是否影響同步、通知、彙總或關聯資料。
- 改 `/training`、特訓報名、點數管理、特訓點名或禁報流程時，先讀 `jg-baseball-training` skill。

## UI 標題規則

- 登入後 route-level 功能頁第一層標題統一使用 `src/components/common/AppPageHeader.vue`，不可在 view 內手寫 page title 結構。
- `AppPageHeader` 必須提供 Element Plus icon；標題旁的 badge / 計數放 `title-suffix` slot，返回按鈕放 `before` slot，右側操作放 `actions` slot。
- Page title 樣式由 `src/style.css` 的 `.app-page-header`、`.app-page-title`、`.app-page-title-icon`、`.app-page-subtitle` 統一控制。
- 預設 title 規格為 mobile `text-xl`、desktop `md:text-2xl`、`font-black`、`leading-tight`、`tracking-normal`、`text-slate-800`；title icon 是小型 inline 主色 icon。
- 不要在功能頁 page title 直接堆疊 `text-3xl`、`text-primary`、`tracking-tight`、`tracking-wider`、大型方框 icon、漸層 icon、手寫 SVG 或裝飾性 uppercase subtitle。若要調整全站 title 規格，優先改 `src/style.css` 的共用 class 或 `AppPageHeader`。
- 首頁 hero、公開 landing、卡片標題、section title、dialog title 可依情境保留自己的視覺層級；不要為了統一 page title 而壓平這些區塊。
- 頁面級或大區塊 loading 統一使用 `src/components/common/AppLoadingState.vue`，只透過 `text` 改文案；不要在 view 內手寫大型 loading spinner / icon / pulse 結構。
- 小型按鈕 loading、表單提交中、局部 Element Plus `v-loading` 遮罩可保留既有互動樣式。

## 驗證

- 依任務範圍選最貼近的檢查：`pnpm exec vue-tsc --noEmit`、`pnpm exec vitest run <target>`、`pnpm build`。
- 不要假設其他 script 存在，先以 `package.json` 為準。
- 改到資料庫寫入、同步或通知時，補最接近修改面的測試或至少做流程 sanity check。

## 回報方式

- 清楚說明改了什麼、為什麼這樣改、怎麼驗證、是否還有風險。
- 若任務其實更像權限、球員同步、推播或賽事日曆同步，轉讀對應 skill 後再繼續工作。
## 2026-04 Security Update

- 本專案的安全邊界以 DB policy / RLS / `security definer` RPC 為主，前端顯示控制只是輔助。
- 變更公開首頁、登入前流程、或任何匿名可達頁面時，預設只能讀公開安全 RPC；不要直接查受保護 raw table。
- 權限相關功能若新增 `feature/action`，要同步更新 DB helper、migration、前端 store、AI 文件。
- `team_members_safe` 是預設展示名單來源；只有真的需要完整個資時才查 `team_members`，並確認 DB 權限與畫面權限一致。
