---
name: jg-baseball-delivery-workflow
description: "End-to-end delivery workflow for jg-base-ball-community-app. Use when a requirement should move through a written spec, implementation, test-and-repair loops, Vercel Preview verification, Supabase release planning, and production release readiness. Trigger on requests about 從需求到上線、delivery、release、spec、完整開發流程、Preview 驗收、正式發布或測試失敗後持續修正。"
---

# JG Baseball Delivery Workflow

## Purpose

把一段需求轉成可追蹤的 Spec，依專案與功能別 skills 完成開發、驗證、Preview 與發布準備。這個 skill 負責編排，不取代 `jg-baseball-project-workflow` 或各功能域 skill 的實作規則。

啟用這個 skill 不等於授權 `git push`、建立 / 合併 PR、套用遠端 Supabase migration、部署 Edge Function 或發布 production。執行外部變更前仍要確認使用者指定的目標與授權範圍；若未指定，預設做到 `READY_FOR_RELEASE`。

## Required Context

1. 先讀 `AGENTS.md`、查看 `git status --short`。
2. 讀 `docs/DELIVERY_WORKFLOW.md` 與 `docs/templates/FEATURE_SPEC.md`。
3. 讀 `jg-baseball-project-workflow`，再依需求命中範圍讀對應 feature skill。
4. 牽涉 DB / RLS / RPC / cron 時讀 `docs/MIGRATIONS.md`；牽涉 Edge Function / secret / 外部 API 時讀 `docs/EDGE_FUNCTIONS.md`。
5. 只讀與本次需求直接相關的產品邏輯與程式碼；不要為了填滿 Spec 掃描整個 repo。

## Delivery Target

開始前判斷本次目標：

- `SPEC_ONLY`：只完成可評審 Spec 與執行計畫。
- `IMPLEMENTED`：完成程式碼與本機驗證。
- `PREVIEW_READY`：完成分支 / PR 準備與 Vercel Preview 驗收清單。
- `READY_FOR_RELEASE`：Preview 與 Supabase staging 證據齊全，可等待正式核准。
- `PRODUCTION`：使用者已明確要求並授權正式發布。

若需求模糊但可安全推進，先建立 Spec 並把假設標出；只有會改變產品範圍、資料模型、安全邊界或正式發布決策的缺口才需要停下詢問。

## Workflow

### 1. Create the Spec

- 以 `docs/templates/FEATURE_SPEC.md` 建立 `docs/specs/YYYY-MM-DD-<slug>.md`。
- 寫清楚目標、非目標、驗收條件、資料與權限影響、測試矩陣、部署內容、相容性與 rollback。
- 把未知事項列為假設或阻擋項，不把理想狀態寫成現況。
- 若需求包含 production，Spec 必須明列 Vercel、Supabase migration、Edge Functions 與環境變數是否受影響。

### 2. Route the Work

- 依 `AGENTS.md` 選 feature skill 與必要安全 skill。
- 將變更分類為 frontend、Supabase schema / data、Edge Function、Storage / Auth、環境變數與 PWA。
- DB 變更需列出 migration / post-check；Edge Function 需列出 function 名稱與所需 secret，但不得記錄 secret 值。
- 先確認現有 dirty files，保留所有與本次任務無關的使用者改動。

### 3. Implement in Reviewable Slices

- 每個 slice 同時維護實作、同名或覆蓋該行為的測試、Spec 狀態與必要文件。
- Bug fix 或規則變更優先先建立可重現的失敗測試，再做最小修正。
- DB 變更維持 backward-compatible expand / contract：先新增相容結構，再部署程式，破壞性 cleanup 放到後續 release。
- 不直接編輯 `dist/`、`dev-dist/`、`public/version.json`，除非任務明確是產物或版本問題。

### 4. Verify and Repair

依序執行：

1. 最接近修改面的 targeted tests。
2. `AGENTS.md` 或 feature skill 指定的完整回歸矩陣。
3. `pnpm typecheck`、`pnpm test`、`pnpm build`，或等價的 `pnpm check`。
4. `git diff --check` 與最終 diff review。
5. GitHub `CI / Secret scan`；若發現 secret，只能在撤銷 / 旋轉、移出程式碼並完成歷史處置後解除阻擋，不可直接 allowlist 仍有效的憑證。
6. DB / Edge 變更的 staging transaction、post-check、權限與 log sanity check；無可用環境時明確標示未驗證。

測試失敗時：

- 先判斷是本次回歸、既有失敗、環境 / secret 缺失或 flaky test。
- 修正根因後先重跑最小失敗檢查，通過後再重跑必要完整 gate。
- 不得刪除或弱化有效測試、放寬型別或改寫驗收條件來製造綠燈。
- 同一阻擋原因連續 3 輪沒有新證據或進展時，標示 `BLOCKED`，保存錯誤、已嘗試項目與下一個必要輸入；不要無限重試。

### 5. GitHub and Vercel Preview

- GitHub Actions `CI / Quality gate` 是 merge 前品質閘門；它不負責部署。
- 現有 GitHub → Vercel Git integration 負責部署：非 production branch 產生 Preview，production branch（預期 `main`）產生 Production。
- 未經使用者授權不得自行 push branch 或建立 / 合併 PR。
- Preview 驗收需記錄 commit、Preview URL、核心 smoke paths、裝置 / 權限角色與 console / network 異常。
- Vercel Preview 必須使用非 production Supabase 專案才能執行會寫資料的測試；若 Preview 仍指向 production，僅允許唯讀 smoke test，並把環境隔離列為 release blocker。

### 6. Supabase Release Gate

- 此 repo 目前同時有根目錄 `supabase_*.sql` 與 `supabase/migrations/*`；在 migration history 完成盤點與 baseline 前，不得把 `supabase db push` 接成 production 自動部署。
- 每次 DB release 都要列出確切 SQL 檔、相依順序、是否已在 staging 套用、代表資料驗證與 post-check。
- 每次 Edge Function release 都要列出確切 function 名稱、相依 migration、secret readiness、staging 驗證與 rollback commit。
- Edge Function 安全預檢必須確認：tracked source / SQL 無 private key 或有效 token、每支 function 的 `verify_jwt` 或 custom-secret 驗證模式已明確版本化、cron / webhook 呼叫端與 secret 名稱能對應目標環境。
- 任一 secret、function auth mode、production URL / token 可攜性仍不明時，狀態必須是 `BLOCKED`；不得 deploy-all，也不得自動部署 Edge Functions。
- 執行任何 Supabase CLI 指令前先用 `supabase --version` 與對應 `--help` 確認目前 CLI 行為。
- 遠端 staging / production migration、資料修復、secret 更新與 Edge Function deploy 都需要使用者明確授權。

### 7. Production Gate

只有下列條件都成立才可進入 production：

- Spec 驗收條件與 release manifest 已完成。
- Targeted、feature regression、全域 CI / build 都通過。
- Vercel Preview 已驗收，且是預計發布的 commit。
- Supabase staging migration / Edge Function 已驗證；未涉及者明確標示 N/A。
- 已確認 production branch、環境變數、備份 / rollback 與 post-deploy owner。
- Secret scan 已通過，且 Edge Function auth mode 已版本化或由可稽核證據確認。
- 使用者明確核准 production mutation。

含 DB 的發布順序預設為：production backward-compatible migration → Edge Functions → Vercel production → smoke / logs。破壞性 cleanup 另開後續 release，不和依賴它的前端同批發布。

核准內容必須綁定 commit、Vercel / Supabase target、migration、function 清單與發布順序；任一項改變就回到 production gate 重新核准。

### 8. Post-Deploy and Rollback

- 驗證 production URL、登入入口、受影響核心流程、Supabase RPC / RLS、Edge Function logs 與背景排程健康狀態。
- 前端異常可回滾到先前 Vercel deployment；DB 預設使用 forward-fix，不自動執行未事先撰寫與驗證的 down migration。
- Edge Function 回滾需部署已知正常 commit，並再次驗證相依 schema。
- 將結果更新回 Spec：`DEPLOYED`、`ROLLED_BACK` 或 `BLOCKED`，附上證據與剩餘風險。

## Completion Report

回報至少包含：

- Spec 路徑與最終狀態。
- 修改內容與選用的 feature skills。
- Targeted / full regression / CI / build 結果。
- Vercel Preview / Production 狀態與 URL（若有）。
- Supabase migration、Edge Functions、staging / production 狀態。
- 未執行項目、原因、rollback 狀態與剩餘風險。
