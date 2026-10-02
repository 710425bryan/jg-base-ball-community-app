# Feature Spec：排班教練資格與月份排班總覽

- 狀態：`IMPLEMENTED`（本機驗證完成；SQL 已部署，1.1.70 Git 發布依後續授權進行）
- Delivery 目標：完成本機實作與驗證；教練 SQL 延續本對話已授權的同一正式專案修正。使用者後續明確授權升修補版、commit 並 push 目前 main 分支；實際託管部署與 CI 狀態於推送後另行確認。
- 建立日期：2026-10-03
- 需求來源：指派選單缺少「排班教練」；希望在一個 Dialog 一次查看全月日期、場地／比賽與教練名單；後續要求來源顏色、移除正常重新整理按鈕，以及新增未指派篩選、刪除純統計。

## 1. 操作與驗收

- [x] 固定範本、活動卡片及手動排班可選擇有效的「排班教練」，沿用角色排序與群組。
- [x] 月份選擇區有直接可見的「月份總覽」按鈕，無須捲過活動卡片。
- [x] Dialog 顯示所選月份所有活動，由月初到月底、同日按時間排序；列出日期、來源、活動名稱、場地、時間與已儲存指派教練。
- [x] 不受頁面來源篩選影響，保留同日不同活動／場地，不依名稱合併；未指派與取消活動明確標示。
- [x] 每次開啟／重試透過原安全月份 RPC 讀取獨立最新快照，不修改未儲存草稿；載入失敗顯示重試，不能顯示舊月份資料。
- [x] 提供獨立「未指派教練」切換，與來源取交集，計數依當前來源的事件空指派；依已保存的教練 ID 判定，不讓選草稿教練後卡片消失，保存成功才更新篩選結果。保留已取消空指派的狀態標示，移除三個純統計；總覽不受兩個篩選影響。
- [x] 場地訓練採藍色、比賽採既有琥珀橘色，列表淡底／左邊條／來源徽章一致；保留文字標籤，不只靠顏色識別。正常 footer 僅「關閉」，不顯示「重新整理」按鈕；讀取失敗才提供「重試」。
- [x] 360／390／767px 可操作、Dialog 內部捲動、關閉與主要控制至少 44px、輸入文字 16px，無水平溢出。

## 2. 診斷與範圍

- 正式唯讀診斷：`SCHEDULINGCOACH` 的 role_name 為「排班教練」、weight 15；3 位 profile 均符合 active／access window，但既有 `private.coach_profile_is_schedulable()` 判為 0 位。
- 既有該角色已配置排班 VIEW／CREATE／EDIT、本人與管理假單權限；此次不新增／複製權限、不改角色名稱或排序。
- 只擴充精確穩定的 `SCHEDULINGCOACH` 角色代碼，與 HEAD_COACH／COACH 共用有效帳號條件；不能依顯示名稱、weight 或任何 VIEW 權限推導教練資格。
- 通知 audience 的排班 VIEW 分支改用同一資格 helper，維持管理 VIEW／ADMIN、收件權限撤回及私人原因隔離；不修改 worker、cron 或 secrets。
- 月份總覽唯讀，不提供批次編輯／新增指派、不新增路由或任意 profile 查詢，也不修改收費／點名／球員資料。使用者後續要求活動依來源顏色區分並移除正常重新整理按鈕，保持開啟／前景自動更新與錯誤重試。

## 3. 資料與安全

- 名單、單筆保存、範本、自動帶入、本人假單與 Dashboard 沿用現有 RPC 與共用資格；保持請假／撞班／版本檢查及 raw table DML 限制。
- 月份總覽使用 `list_coach_schedule_admin_month()` 已授權來源，只從保存的 assignment 與 profile IDs 顯示教練；不以比賽原始教練文字或草稿推斷指派。
- 新 forward migration 只修改兩個 private helper；固定 `search_path`、撤銷 PUBLIC／anon／authenticated 直接執行，保留現有 public RPC ACL。
- 未建立新表，不進行資料回填，不保存任何假單原因、登入憑證或敏感 profile 資料。

## 4. 驗證計畫

| 範圍 | 驗證 |
| --- | --- |
| Unit | 全月日期／時間穩定排序、同日多活動、未指派／取消、已保存名單、獨立快照、草稿保留、失敗重試與請求競爭 |
| SQL | SCHEDULINGCOACH listing/save/template/preview/confirm、active／access windows、請假移除／取消不恢復、撞班、權限與原因隔離、通知 VIEW 收件及撤回 |
| 全域 | `pnpm check`、`git diff --check` |
| 瀏覽器 | 真實 Vue／Element Plus、360／390／767px，原 162 項回歸及新名單／全月總覽操作 |
| 正式 SQL | 唯讀前置 hash／資格／權限、指定 migration、history 與檔名對齊、兩 helper 及 ACL post-check、既有其他 function hash 保留 |

使用 project-workflow、coach-schedules、coach-leave、auth-permissions、delivery-workflow 與 Supabase skills。

## 5. Release Manifest

- 新 SQL：`supabase/migrations/20261002180340_coach_schedule_scheduling_coach_eligibility.sql`，依賴已部署教練請假核心與通知 migration；CLI 原產生版本 `20261002175454` 已更名對齊正式 history，不可重跑舊名。
- 順序：資格 migration → 前端。worker／排程／環境變數不變。
- 正式 Supabase 目標：`qwxzwomzoyfkorbwsscv`；migration 已套用，兩 private helper 的固定 search_path／ACL 保留，其他 14 支函式 definition hash 全部不變；有效排班教練及安全 list RPC 均回傳 3 位，角色與既有 11 項相關權限保留。
- Git／前端：本輪後續授權的修補版為 1.1.70，提交本次功能、測試與文件並推送目前 main；package 與公開版本鏡像由正常 build 同步。Supabase CLI 暫存快取不納入產品提交，保留工作區內容；Git push 不作為 Vercel、角色 SQL 或通知 worker 部署成功的證據。
- DB 回復採經驗證 forward-fix 恢復原 helper，不刪除已建立排班／假單；前端可回復先前版本。

## 6. 驗證證據與剩餘事項

- 最終 targeted 4 files／29 tests（全月 helper 6、Dialog 4、父頁 10、分組 helper 9）通過，新增未指派交集、草稿保留、取消標示、成功保存後移出／零結果與總覽不受篩選 regression。
- 未指派篩選後完整 `pnpm check` 通過 262 files／1427 tests、教練 SQL 508 checks、角色 SQL 155 checks、完整付款 SQL、型別與 production build；最終紀錄 `/tmp/jg-coach-unassigned-filter-check.log`。較早月份總覽與顏色 gate 紀錄 `/tmp/jg-coach-month-overview-check.log`／`/tmp/jg-coach-month-overview-final-check.log`（1425 tests），顏色分隔線修補後另有 27 tests 及 `/tmp/jg-coach-month-overview-final-build.log`。migration 更名後再次通過 73 項 SQL，內容不變；原版本鏡像已保留。
- 正式 post-check 證據 `/tmp/jg-coach-scheduling-eligibility-production-evidence.json`：兩 helper source MD5 分別 `68e5278659d4f704104fabac73e59d35`／`c83180f89f22a00aa9768f5a14a38d67`，private ACL 精確 `{postgres=X/postgres}`、search_path 空值，anon／authenticated 不可直接執行；其他 14 支函式 definition hash 保留、4 張業務表 raw DML 全 false。security advisor findings 排除觀測時間後完全相同，未新增警告。未寫正式排班／範本／假單測試資料。
- 最終 Chromium 真實 Vue／Element Plus／AppGlobalSelect 全流程在 360／390／767px 通過 330 checks（各 110 項，保留原 162 項），61 張截圖；無 console/browser errors、外部請求或水平溢出。證據 `/tmp/jg-coach-unassigned-month-overview-ui/evidence.json`，重跑見 `tests/browser/README.md`。涵蓋有效排班教練分組／指派 ID、六來源與未指派交集／筆數、取消空指派、第一觸控保存後移出、未儲存草稿保留、獨立全月總覽、同日不同場地、月初／月底／換月、blue／amber 的背景／徽章／兄弟行色條、正常 footer 僅關閉、前景更新與錯誤區唯一重試。三尺寸錯誤態量測 Dialog top 0／height 844、overlay scrollTop 0，兩個關閉控制可見且 elementFromPoint 可觸及。已目視 360／767px 來源顏色與 360px 錯誤重試、390px 月初畫面。
- 頁首補充截圖使用同一凍結產品程式在 360／767px 僅重跑新情境，112 checks 通過，無外部請求或瀏覽器錯誤；證據 `/tmp/jg-coach-unassigned-overview-final-shots/evidence.json`。已目視兩尺寸「未指派教練」與來源切換、月份總覽入口及統計移除後的佈局。
- 1.1.70 升版後再次完成完整 `pnpm check`：262 files／1427 tests、角色 SQL 155、教練 SQL 508、完整付款 SQL、型別與 production build 通過，紀錄 `/tmp/jg-release-1.1.70-check.log`；建置後 package／version mirror 均為 1.1.70。本次 Git 發布沒有追加遠端 SQL 或 worker 部署。
- 1.1.70 追加唯讀確認：正式 `create_app_role(text,text,text)`／`update_app_role_weight(text,integer)` 已存在，body MD5 與本機兩份角色 migration 完全一致、SECURITY INVOKER／空 search_path／anon 拒絕及 authenticated EXECUTE 正確。migration history 尚未記錄兩個版本／名稱，僅修正文件現況，不補寫 ledger 或重播一次性權重 SQL；詳見 `docs/MIGRATIONS.md`。
- Chromium 模擬尺寸與隔離 PGlite 不代表實體手機 IME／鍵盤／safe area、staging 多連線鎖競爭、GitHub CI／Secret scan 或 Vercel Preview 已驗收。
