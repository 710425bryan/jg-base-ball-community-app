# Delivery Workflow

本文件定義 `jg-base-ball-community-app` 從需求、Spec、開發、驗證、Vercel Preview 到 Supabase / Production 發布的標準流程。實際程式與安全規則仍以 `AGENTS.md`、`docs/MIGRATIONS.md`、`docs/EDGE_FUNCTIONS.md` 及對應 feature skill 為準。

## 1. 目前部署拓樸

```text
feature branch / pull request
  ├─ GitHub Actions: CI / Secret scan + CI / Quality gate
  └─ Vercel Git Integration: Preview deployment

main（Vercel Production Branch）
  ├─ GitHub Actions: 同一 commit 的兩個 required checks
  └─ Vercel Git Integration: Production build → Deployment Checks → production domain

Supabase
  ├─ Database / RLS / RPC / cron: migration gate
  ├─ Edge Functions: explicit function release gate
  └─ Auth / Storage / secrets: environment-specific manual gate
```

- Vercel Git integration 是現有 CD 通道；GitHub Actions 只負責 secret scan、測試與 build，不重複呼叫 Vercel CLI。
- GitHub workflow 只有在 commit / push 後才會執行；仍需在 GitHub 將 `CI / Secret scan` 與 `CI / Quality gate` 設為 `main` 的 required checks。
- 單靠 GitHub required checks 只能阻止不合格 PR 合併，不能消除 `main` push 後 CI 與 Vercel 上線的競速；Vercel 必須再把同名 GitHub checks 加入 Deployment Checks，通過前不把 build alias 到正式網域。
- Vercel 預設會對非 production branch 建立 Preview，對 production branch 建立 Production。實際 production branch 必須在 Vercel Project Settings 再確認。
- Supabase 尚未接自動 production deploy。現有 migration 同時散布在根目錄 `supabase_*.sql` 與 `supabase/migrations/*`，在 migration ledger 對齊前，不可直接假設 `supabase db push` 能完整重建 production schema。

### 目前的 production 阻擋（2026-08-26 稽核）

- 兩個 Edge Function 原始碼仍含 hard-coded private VAPID material：`supabase/functions/_shared/push.ts` 與 `supabase/functions/send-training-registration-notifications/index.ts`。不得輸出或繼續部署現有值；必須先撤銷 / 旋轉，改由 Supabase secrets 讀取。若旋轉整組 VAPID key pair，既有瀏覽器訂閱可能需要重新訂閱。
- `supabase/functions/leave-webhook/index.ts` 沒有程式內 request-secret 驗證，而 `supabase/config.toml` 也沒有逐支 function 的 `verify_jwt` 設定。完成 gateway 現況確認與 auth mode 版本化前，不自動部署 Edge Functions。
- 部分歷史 diagnostics SQL 綁定特定 production function URL 與公開 anon token；雖不是 service-role secret，仍不可直接重播到 staging，必須改成環境參數或環境專屬設定。
- 因此新 secret scan 預期先保持紅燈。只有在憑證已失效、程式碼已移除、git history 已清理或對已撤銷值建立精確 baseline 後，才可解除這個 gate。

## 2. Delivery 狀態

| 狀態 | 完成條件 |
| --- | --- |
| `DRAFT` | 已收到需求，Spec 尚未完成 |
| `SPEC_READY` | 目標、非目標、驗收條件、風險、測試與發布影響已寫清楚 |
| `IMPLEMENTING` | 正在開發與補測試 |
| `VERIFYING` | Targeted / feature regression / full gate 執行中 |
| `PREVIEW_READY` | CI 通過，Vercel Preview 可驗收 |
| `READY_FOR_RELEASE` | Preview 與 Supabase staging 證據齊全，等待 production 核准 |
| `DEPLOYING` | 已取得 production 授權並正在發布 |
| `DEPLOYED` | Production smoke 與必要健康檢查通過 |
| `ROLLED_BACK` | 已回復已知正常版本並完成基本驗證 |
| `BLOCKED` | 需要新資訊、權限、環境或外部狀態才能繼續 |

## 3. 標準流程

### Gate A：需求與 Spec

1. 使用 `docs/templates/FEATURE_SPEC.md` 建立 `docs/specs/YYYY-MM-DD-<slug>.md`。
2. 把自然語言需求轉成可驗收條件；重要流程優先使用 Given / When / Then。
3. 確認 frontend、DB / RLS / RPC、Edge Function、Storage / Auth、環境變數、通知、PWA 與舊 WebView 是否受影響。
4. 明列非目標與假設，避免在實作中無聲擴大範圍。

### Gate B：實作計畫

1. 讀 `jg-baseball-project-workflow` 與對應 feature skill。
2. 找出最小修改面、對應測試與必要文件。
3. DB 變更列出 migration、部署順序、post-check 與 rollback / forward-fix。
4. Edge Function 變更列出 function 名稱、相依 migration 與 secret 名稱，不記錄 secret 值。

### Gate C：開發與本機驗證

1. Bug fix / 規則修改先建立可重現案例，再修正。
2. 先跑 targeted tests，再跑 feature skill / `AGENTS.md` 指定完整回歸。
3. 完整品質閘門執行 `pnpm check`，再跑 `git diff --check`。
4. `pnpm check` 包含 typecheck、全量 Vitest 與 Vite production build。
5. GitHub 的 `CI / Secret scan` 必須獨立通過；它和品質檢查平行執行，任一失敗都不可合併或發布。

### Gate D：失敗回修

```text
失敗 → 分類根因 → 最小修正 → 重跑失敗檢查 → 重跑必要完整 gate
```

- 分類為本次回歸、既有失敗、環境 / secret 缺失或 flaky test。
- 不刪測試、不放寬型別、不改驗收條件來製造通過。
- 同一阻擋原因連續 3 輪沒有新證據或進展時，將 Spec 改為 `BLOCKED`，保存錯誤、已嘗試項目與下一個必要輸入。

### Gate E：GitHub PR 與 Vercel Preview

1. 由已授權的 feature branch push / PR 觸發 GitHub CI 與 Vercel Preview。
2. PR 只能在 `CI / Secret scan` 與 `CI / Quality gate` 都通過後合併。
3. 在 Spec 記錄 Preview URL、commit SHA、驗收角色、裝置尺寸、核心路徑與 console / network 結果。
4. 若 Preview 連到 production Supabase，不執行新增、付款、通知、刪除或資料修復等寫入測試；先完成環境隔離。

### Gate F：Supabase Staging

若變更包含 DB / RLS / RPC / cron / Storage policy：

1. 列出確切 migration 檔案與相依順序。
2. 在獨立 staging project 套用並執行 representative transaction、RLS / RPC / advisor 與 post-check。
3. 記錄 migration list / schema 狀態與驗證證據。
4. 只有 staging 通過才可標記 `READY_FOR_RELEASE`。

若變更包含 Edge Function：

1. 先確認 secret scan 通過，且沒有 private key / 有效 token 留在 tracked source 或 SQL。
2. 逐支確認 `verify_jwt` 或 custom-secret auth mode 已版本化，cron / webhook 呼叫方式與目標環境一致。
3. 先套用相依 migration。
4. 確認 staging secrets 已存在，不輸出 secret 值。
5. 只部署本次變更的 function，驗證 auth、成功 / 失敗回應、logs 與資料副作用。
6. 實際 CLI flags 每次以 `supabase functions deploy --help` 為準。

### Gate G：Production

正式發布前必須同時具備：

- 使用者明確 production 授權。
- Spec、CI、Preview、Supabase staging 與 release manifest 完整。
- Production 環境變數與 secrets readiness 已確認。
- 可回復的資料備份 / forward-fix 與 Vercel / Edge rollback 方案。

含 Supabase schema 的預設安全順序：

1. 套用 backward-compatible production migration。
2. 執行 DB post-check。
3. 部署相依 Edge Functions 並做 smoke test。
4. 合併 / push Vercel production branch，讓 Git integration 發布前端。
5. 驗證 production URL、登入、受影響流程、RPC / RLS、Function logs 與排程健康。
6. 破壞性欄位刪除或 constraint 收緊另開後續 release。

## 4. GitHub Actions 品質閘門

`.github/workflows/ci.yml` 使用：

- Node.js 24，並由 `package.json#engines.node` 固定成與本機 / Vercel 相同 major。
- pnpm 10.31.0 與 frozen lockfile。
- Gitleaks history scan；個人 GitHub repository 不需 license，若日後移到 organization，需依 Gitleaks 規則提供 organization license secret。
- `pnpm check`。
- read-only repository permission。
- 同分支新 commit 會取消舊 CI。

這個 workflow 不含 Vercel / Supabase token，也不做任何遠端部署。請在 GitHub 設定：

1. `Settings → Rules → Rulesets`（或 Branch protection）。
2. 保護 `main`，要求 PR 才能合併。
3. Require status checks：`CI / Secret scan`、`CI / Quality gate` 與 Vercel deployment check。
4. 禁止未經核准直接 push / bypass（依團隊角色設定）。

Vercel Project Settings 也要新增兩個 GitHub Deployment Checks：`CI / Secret scan`、`CI / Quality gate`。Vercel 仍可先建立 production build，但只有兩個 checks 都成功才自動掛上 production domain；job / workflow 名稱改動時必須同步更新 Vercel 設定。若未啟用這層，push 到 `main` 的 CI 無法技術上阻止 Vercel 先對外發布。

若日後改成 GitHub Actions 主導 `vercel deploy`，則應停用重複的 Git auto production deploy；兩種 CD 模式不可同時啟用。

## 5. Vercel 環境設定

建議維持三層：

| Vercel 環境 | Git 來源 | Supabase 目標 |
| --- | --- | --- |
| Local | 本機 | local 或 staging |
| Preview | 非 production branch / PR | 獨立 staging project |
| Production | `main`（需實際確認） | production project |

至少核對：

- Preview 的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 指向 staging。
- Production 的同名變數指向 production。
- Preview 與 Production 都設定 `ENABLE_EXPERIMENTAL_COREPACK=1`，讓 Vercel 採用 `package.json` 固定的 pnpm 10.31.0；並在 Vercel Project Settings 確認 Node.js 24.x。
- Service role、DB password、Edge secrets 不可成為 `VITE_*`，也不可提交到 repo。
- Preview / Production 的 Auth redirect URLs、Storage 與 Edge Function URLs 符合各自環境。

## 6. Supabase 自動化導入階段

### 現階段：CI 自動、Supabase 發布受控

- GitHub 自動跑前端 / unit tests / build。
- Supabase migration 與 Edge Function 依 release manifest 在 staging 驗證，production 需人工核准。
- 不在 CI 自動執行根目錄 `supabase_*.sql`。

### 下一階段：先整理 migration ledger

1. 比對 production 的 `supabase migration list` 與 repo 內所有已部署 SQL。
2. 建立可重建的 baseline，確認哪些根目錄 SQL 已套用、哪些已被後續 hotfix 覆寫。
3. 決定後續新 migration 統一由 `supabase migration new <name>` 建立在 `supabase/migrations/`。
4. 在乾淨 local / staging project 從零重建並通過 post-check。

這項整理應獨立成 migration 專案，不可在一般功能發布時順手猜測或搬移歷史 SQL。

### 完成 baseline 後：Supabase GitHub Environments

可建立 `supabase-staging` 與 `supabase-production` GitHub Environments：

- Staging：允許自動或人工 dispatch，使用 staging secrets。
- Production：required reviewers，僅在核准後執行。
- Secrets 至少包含 Supabase access token、各環境 project ref 與 DB password；名稱可依 workflow 設計，但不可寫入文件值或 repo。
- Edge Functions 使用明確 function 清單，不做無差別全量 deploy。

## 7. Rollback 原則

| 項目 | 回復方式 |
| --- | --- |
| Vercel frontend | 回滾到已知正常 deployment，驗證 production domain |
| Edge Function | 從已知正常 commit 重新部署指定 function |
| Supabase schema | 優先 forward-fix；只有事先撰寫、在 staging 驗證且不會遺失資料時才執行 down migration |
| Data repair | 使用可稽核、可重跑或有反向腳本的修復；付款 / 餘額 / 通知資料不得無證據覆寫 |

## 8. 完成定義

任務只有在 Spec 對應目標狀態成立時才能宣告完成。若目標是 production，但只做到 code / tests / Preview，必須回報 `READY_FOR_RELEASE` 或 `BLOCKED`，不能描述成已上線。
