# Feature Spec：<功能名稱>

- 狀態：`DRAFT`
- Delivery 目標：`SPEC_ONLY | IMPLEMENTED | PREVIEW_READY | READY_FOR_RELEASE | PRODUCTION`
- 建立日期：`YYYY-MM-DD`
- 負責人：
- 需求來源：
- 相關 issue / PR：

## 1. 原始需求

貼上或摘要使用者需求，保留重要名詞與限制。

## 2. 目標與非目標

### 目標

- 

### 非目標

- 

## 3. 假設與待確認事項

| 項目 | 目前假設 | 是否阻擋 |
| --- | --- | --- |
|  |  | 否 |

## 4. 驗收條件

- [ ] Given … When … Then …
- [ ] 錯誤、空狀態與權限不足時有明確結果。
- [ ] 手機、桌機或舊 WebView 相容需求已明列。

## 5. 影響面

| 項目 | 是否影響 | 檔案 / 資料 / 說明 |
| --- | --- | --- |
| Vue views / components | 否 | |
| Router / Auth / permissions | 否 | |
| Pinia / services / utils / types | 否 | |
| Supabase tables / RLS / RPC / cron | 否 | |
| Storage / Auth | 否 | |
| Edge Functions | 否 | |
| Notifications / Web Push | 否 | |
| Vercel / environment variables | 否 | |
| PWA / version / legacy WebView | 否 | |

## 6. 安全與資料規則

- 讀取邊界：
- 寫入邊界：
- RLS / RPC / feature-action：
- 敏感資料：
- Secret scan / credential rotation：
- Edge Function auth mode（`verify_jwt` / custom secret）：
- 資料相容與 backfill：

## 7. 實作計畫

1. 
2. 
3. 

使用 skills：

- `jg-baseball-project-workflow`
- `<feature-skill>`

## 8. 測試計畫

### Targeted

- [ ] `<command>`

### Feature regression

- [ ] 依 `AGENTS.md` / feature skill 執行：`<command>`

### Full gate

- [ ] `CI / Secret scan`
- [ ] `pnpm check`
- [ ] `git diff --check`
- [ ] 人工 / Preview smoke：

## 9. Release Manifest

### Git / Vercel

- Branch：
- Commit：
- Preview URL：
- Production branch：
- Environment variables changed：`否`（若是，只列名稱）

### Supabase migrations

| 檔案 | 相依順序 | Staging | Production | Post-check |
| --- | --- | --- | --- | --- |
| N/A | | | | |

### Edge Functions

| Function | 相依 migration | Auth mode | Secret readiness | Staging | Production |
| --- | --- | --- | --- | --- | --- |
| N/A | | | | | |

## 10. Rollout 與 Rollback

- 發布順序：
- Vercel rollback：
- Edge Function rollback：
- DB forward-fix / rollback：
- 資料備份或稽核證據：

## 11. 驗證證據

| Gate | 結果 | 證據 / 日期 |
| --- | --- | --- |
| Targeted tests | 待執行 | |
| Feature regression | 待執行 | |
| Secret scan | 待執行 | |
| Full CI / build | 待執行 | |
| Vercel Preview | 待執行 | |
| Supabase staging | N/A | |
| Production smoke | N/A | |

## 12. 最終狀態與剩餘風險

- 最終狀態：
- 未完成項目：
- 剩餘風險：
- 下一步：
