# Feature Spec：隊職員軟刪除與歷史保留

- 狀態：`VERIFYING`（發布準備；正式環境尚未變更）
- Delivery 目標：`PRODUCTION`（使用者於 2026-10-13 明確要求部署）
- 建立日期：2026-10-13
- 需求來源：隊職員刪除遭裝備付款外鍵阻擋；使用者要求刪除後不出現在任何名單（包含退隊），資料庫保留供日後查找。

## 1. 目標與非目標

- 刪除後在隊、退隊、全部、搜尋與匯出名單皆隱藏；保留主列、付款、請購、庫存、餘額、成績及帳號綁定。
- 刪除時間、操作者及原在隊狀態可供日後授權查找。
- 不刪除既有帳務、不放寬外鍵、不建立回收筒或還原 UI，不執行正式成員操作。

## 2. 資料與安全邊界

- 新增 `team_members.deleted_at timestamptz`、`deleted_by uuid`、`deleted_previous_status text`。所有既有資料初始為 null，migration 不更動既有紀錄。
- `soft_delete_team_member(uuid)` 是唯一客戶端刪除入口。固定空 search_path 的 definer RPC 驗證 auth.uid 與既有 `has_app_permission('players','DELETE')`（含啟用／存取期間）；無須新增 EDIT 權限。鎖定成員並原子更新，重送回傳相同 ID，保留首次稽核。
- 刪除時保存原 status，再將內部 status 設為退隊，沿用既有首頁／個人功能／有效成員與新期手足優惠排除。刪除標記是獨立概念，普通退隊仍出現在退隊列表；已刪除者永遠不出現在該列表。已存帳款不重算、關閉旗標不變。
- SECURITY INVOKER trigger 阻擋 authenticated／anon 直接 DELETE、偽造刪除欄位及更新已刪除主列；service_role／DB 維運角色仍能做明確維護。不變更原 RLS、外鍵或其他 RPC。
- safe view 追加非敏感 deleted_at，維持 security_invoker；共享歷史查詢不過濾此 view，避免付款姓名遺失。一般名單 service 過濾 deleted_at；編輯權限的 Google 同步另取完整 snapshot，跳過已刪除者，不重新新增／送新球員通知／改綁定。
- 手足正規化保留完整 ID 圖，但不修改已刪除主列；原帳號綁定保持。展示用手足選單隱藏已刪除姓名／ID，清空或更換可見選項仍保留隱藏關聯，避免因顯示過濾而誤恢復手動半價。沒有新增個資曝光或 secret。

## 3. 前端驗收

- 確認文字明列所有名單包含退隊皆隱藏、歷史保留，未儲存草稿不會一併保存。
- 取消／關閉、確認期間換人、撤銷權限、重複點擊皆不誤寫；RPC 失敗留表單及持續錯誤。
- 成功核對回傳 ID、清除舊快取並強制刷新；刷新失敗不得把成功刪除報為失敗。
- DB 未部署時顯示中文更新提示，不回退實體 DELETE。
- Google 同步不得因名單已隱藏而重建同名 ID 或復活舊列。

## 4. 驗證計畫與證據

| 項目 | 結果 |
| --- | --- |
| 直接 service／composable／名單與同步測試 | 通過；最終手足保留補正另跑 23 項相關測試，已包含於全量結果 |
| 完整費用、裝備、名單回歸 | 28 檔／163 tests 通過；最終全量 gate 另列 |
| `pnpm test:players:sql` | 53 checks 通過；隔離 PGlite 執行實際 migration，重現原 FK 失敗，涵蓋授權、17 張相依表歷史快照、防復活與回滾 |
| Chromium 390／1365px | 最終 24 checks 通過；包含已刪除手足關聯保留、各名單隱藏、失敗保留與當前畫面錯誤可見；零外部請求／browser error／直接 UPDATE 或 DELETE。證據 `output/playwright/player-soft-delete/evidence.json`（ignored） |
| 全量 Vitest | 最終 296 檔／1,838 tests 通過；`pnpm exec vitest run --exclude scripts/supabase-recovery-observer.test.mjs --maxWorkers=4` |
| `pnpm check` 其餘階段 | 型別、observer、角色 SQL、特訓 SQL、教練 SQL、付款 SQL、比賽 SQL 全部通過；首次預設全量 Vitest 兩個既有大型 import 測試超過 5 秒，個別重跑及限制 4 workers 的全量均通過，未放寬 timeout 或刪改斷言。不宣稱首次單一 `pnpm check` 執行成功 |
| `pnpm build`／diff review | 最終型別與 production build 通過；`git diff --check` 及獨立程式／DB／手足保留複查通過。既有大型 chunk／Browserslist 更新提醒仍在 |
| GitHub CI／Secret scan | 未執行；尚未 push／建立 PR，本機未安裝 gitleaks |
| 正式 Supabase | 唯讀確認外鍵、現有權限與函式；未套用 migration、未操作成員 |
| Preview／獨立 Supabase staging／正式登入／實體手機 | 未執行，不以隔離 fixture 代替 |

測試紀錄放 `output/playwright/player-soft-delete/`（ignored），包含最終 `full-vitest-final.log`、`build-final.log`、瀏覽器證據與截圖。PlayersView 原已超過 600 行，本次將刪除生命週期、寫入與手足關聯分別抽到 composable／service／utils；未擴大重構既有同步與編輯表單，以降低非本次範圍的風險。

## 5. Release Manifest

- DB：`supabase/migrations/20261013005735_team_member_soft_deletion.sql`，須先於前端。
- 前端：PlayersView、playerRosterApi、playerRosterMutations、usePlayerSoftDelete、playerRosterSiblings 及同步防護。
- 版本：1.1.80；Edge Functions、Storage、Auth 設定與環境變數：無變更。
- Branch：`codex/team-member-soft-deletion`；基底 main `9c2f5b243015a9bb06b13324a307b5510efa140a`（1.1.79）。
- GitHub：`710425bryan/jg-base-ball-community-app`；Vercel project `prj_Ct3Ifa2JcREe4U5ZrOZpXhiJ7wjL`、team `team_NtAzFlUwIuQX9YmCAMDxzHoX`，正式 https://jg-base-ball-community-app.vercel.app。
- Supabase：`qwxzwomzoyfkorbwsscv`；只套用本次單一 migration，不執行 db push、資料刪除或歷史修復。
- 使用者已明確授權本次正式部署；CI／Preview、DB pre/post-check 及發布結果於完成後補記。
- 發布前正式部署 `dpl_D8Y2MrTs4AaJH1mv5DLktQRuUiJU`（1.1.79），作為前端回復候選；DB 保留刪除保護並優先 forward-fix。
- 使用 project／roster／auth／equipment／finance／player-sync／Supabase 技能，發布依 delivery workflow。

## 6. 發布、查找與回復

1. 經授權在 staging 套用指定 migration 並驗證，再依正式發布 gate 核准 production。
2. DB post-check：欄位初始 null、舊資料筆數／指紋不變；RPC ACL、空 search_path、trigger、安全 view 與原 RLS／FK 保留。不可在正式環境對真實成員做刪除測試。
3. 前端發布後唯讀驗證名單與相依 RPC readiness。舊客戶端的實體 DELETE 會被中文錯誤阻擋，需重新整理至新版。
4. 日後有授權時，維運可按 ID／姓名查 `team_members where deleted_at is not null`，並以原 member_id 追查帳務歷史；不新增公開或低權限查找入口。
5. 前端回滾仍保留 DB 保護，禁止恢復硬刪。DB 優先 forward-fix，不自動清除 deleted_at 或刪除新欄位；若未來需還原，須另外設計權限、同步、收費與原狀態恢復流程。

## 7. 剩餘風險

- 隔離 SQL fixture 載入相關真實 DDL／RLS／RPC，但不是整個正式 schema；多連線競態、正式網路、實體手機與 staging 尚待發布階段驗證。
- 刪除等同不再是有效隊職員，未來計算沿用既有有效成員排除；歷史帳務與原金額不重算。
