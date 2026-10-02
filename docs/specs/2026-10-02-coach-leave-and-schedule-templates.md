# 教練請假、通知與固定範本排班

- 日期：2026-10-02
- 狀態：核心／通知及新增日期快選批次 migration 均已套用正式資料庫；前端納入後續授權的 1.1.70 main Git 發布。worker／Vault 設定與實際業務通知驗收尚未完成，託管部署狀態另行確認。
- Delivery 目標：`IMPLEMENTED`
- 需求：教練請假立即生效，已指派教練從排班移除；提供角色權限、站內／瀏覽器通知及固定範本帶入。
- 範本後續更新：2026-10-03 改為「場地＋教練」，最新規則及發布證據見 [場地範本規格](2026-10-03-coach-schedule-venue-templates.md)；下方歷史驗證仍保留原執行結果。

## 功能與驗收規則

| 情境 | 最終行為 |
| --- | --- |
| 我的教練假單 | `/my-coach-leave-requests`，登入 profile 決定本人，不能指定其他人；預設有效總教練／教練的 `my_coach_leave_requests` 四種 action |
| 管理假單 | `/coach-leave-requests`，`coach_leave_requests` 四種 action 預設 ADMIN；教練、月份、有效／取消篩選，通知可 highlight 指定假單 |
| 新增日期模式 | 上課日期快選（預設）、單日、連續多日、固定週期；教練一次選一人，快選預載本月／次月、可追加月份與切換有效訓練項目，保留已選日期 |
| 多日期送出 | 快選／固定週期展開各日，可全日／上午／下午；連續跨日一筆全日假。每批最多 365 筆、一次日期範圍最多 365 天；批次任一失敗全部回滾，重試不重複假單、通知或指派移除 |
| 假單時間 | 台灣日期；新範圍今天起，全日／上午／下午，以 13:00 分界，連續多日只能全日；原因選填最多 500 字 |
| 新增／修改 | 同交易寫入假單、版本與 private audit，移除有效排班中重疊教練指派，更新排班版本及 Outbox 事件 |
| 修改縮短／取消 | 留存 audit，不恢復被移除的指派；管理者重新安排 |
| 進行中的跨日假單 | 結束日仍在今天起可修改／取消；修改表單從今天起帶入，原範圍留 audit；已完全結束的假單唯讀 |
| 手動排班 | 資料庫拒絕請假、同時段撞班、失效教練及過期版本；來源欄位以目前資料庫為準 |
| 範本 | 四欄位：場地、固定教練、選填名稱、啟用；場地共用安全常用清單，可自訂並與範本原子保存；活動卡片只預填場地與教練 |
| 自動帶入 | 選月份→預覽→確認；只處理今天起、有效來源且尚無指派的訓練活動，保留有指派及取消活動 |
| 排除與缺額 | 顯示請假、已有排班、帳號失效原因與待補人數；全空列不能確認，部分可用者可帶入後補人 |
| 時間不完整 | 請假與排班衝突均採全日保守檢查，預覽明確提示；場地配對不要求開始時間完整 |
| 批次確認 | 按日期、開始時間、活動識別固定順序檢查同批撞班；確認重算 fingerprint，有資料異動整批拒絕；相同成功批次重送回傳原 ID，不重複建立 |

範本只按啟用實體場地配對，不比對星期、時間、來源類型或課程標題；每場地最多一啟用範本。一般訓練日場地只從活動地點精確解析；未確定場地則跳過。活動仍沿用既有來源 UUID、合班 resolver 與唯一約束。

## 安全、資料與通知

- 教練使用 `profiles.id`，不從姓名或 `team_members` 推算；教練假單不接入球員假單、點名、隊費或比賽費。
- 新表 `coach_leave_requests`、`coach_schedule_templates` 開啟 RLS，但不授予 authenticated raw SELECT／DML。只走 security definer RPC；private audit、移除紀錄與批次 receipts 不對一般登入者開放。
- RPC 檢查有效帳號、登入期間、feature/action、本人 UUID、`updated_at` 與交易鎖。過期排班表單不能重新寫回已被請假移除的教練；有未儲存內容時保留表單並在送出前比對遠端版本。
- `list_coach_leave_training_dates()` 只回有效訓練項目的 key／label／月份日期，不回私人 note；不使用球員綁定資料推導教練項目。`create_coach_leave_requests()` 檢查 CREATE 與同一有效教練，私有 actor／batch UUID receipt 正規化排序與原因空白；同內容回原 IDs，異內容拒絕，已取消假單不還原。表單失敗保留內容，同內容重試保持 UUID，改內容用新 UUID。
- 私人原因只在本人／假單管理 RPC 中回傳；排班與通知僅帶教練、日期、時段、異動資訊。
- 通知收件人是有效 `coach_leave_requests:VIEW` 管理者與有效教練的 `coach_schedules:VIEW` 聯集，依帳號與 subscription 去重。本人只有自己的假單權限，不會因此收到全隊通知。
- 新增、修改、取消事件使用 `coach_leave:<leave_id>:<revision>:<operation>`；取消提示「已取消請假，可重新安排排班」。無訂閱者仍可由 `get_notification_feed()` 讀站內通知。
- 管理者連結 `/coach-leave-requests?highlight_leave_id=...`，教練連結 `/coach-schedules?month=YYYY-MM`。排班、首頁與通知中心於前景切換／重新整理更新；同頁請假成功也觸發刷新，不宣稱跨裝置即時訂閱。
- Worker 每批最多 25 events、100 deliveries，逐裝置 claim、最多 6 次重試、5 分鐘過期鎖回收。每次發送重新驗證權限與訂閱；中斷最終派送、舊 worker 清理或記錄成功後中斷，都會在下輪收斂事件狀態。網路成功但尚未寫回 ledger 時中斷仍有 Web Push 至少一次派送的固有限制。

## 修改面與測試

| 修改面 | 驗證 |
| --- | --- |
| 假單 View／Dialog／API／utils | 同名 Vitest：本人／管理範圍、表單、多日、版本、取消、錯誤及成功通知事件 |
| 排班 View／拆分元件／composable／範本 API／utils | 同名 Vitest：複製範本、預覽缺額、確認錯誤、權限及 dirty draft 保護 |
| Router／權限清單／Layout／首頁／通知中心 | 既有與新增測試涵蓋 route guard、入口、來源及前景刷新／已撤銷通知清理 |
| 新 migration | 隔離 PGlite 執行真實 SQL；涵蓋 raw table／RPC 防繞過、13:00、09:00–12:30、移除／不恢復、失效帳號、過期表單、範本匹配／衝突／重送及 Outbox 權限／恢復 |
| Worker | `logic.test.ts` 涵蓋 HTTP handler、secret、缺少 VAPID、目前權限／URL、重試、無訂閱、404/410、subscription shape 及 generic error；`index.ts` 僅作 Deno runtime adapter，另以 Deno check 與 module 載入驗證 |
| 純型別／文件／config／migration | 不另造 unit test；以型別檢查、SQL 實際執行、既有流程與設定審查驗證 |
| 局部 `coachFeatureTheme.css` | 以真實瀏覽器 computed style 與手機 screenshot 驗證品牌色及布局，沿用既有色票；元件／View 測試涵蓋 class 接線 |

`CoachSchedulesView` 拆成四個單一職責元件與 editor composable；`RolePermissionsManager` 將 feature 清單移入可測試 utils。既有 `MainLayout`、`HomeView` 本身過長，本次刷新邏輯抽至 `useForegroundRefresh`，只新增導航／通知來源接線；避免跨全站 Layout／首頁資料流的大規模重構。

本機指令：

```sh
pnpm check
node tests/browser/verify-coach-ui.mjs
npx --yes deno check --no-lock supabase/functions/process-coach-leave-notification-outbox/index.ts
git diff --check
```

`pnpm check` 包含型別、全量 Vitest、既有教練來源／合班與新增假單／範本／通知 SQL、全部付款 SQL 與 production build。PGlite 不連遠端，也不能證明多連線真正競爭；部署前另以 staging 同時執行請假與排班／來源刪除，檢查無殘留指派、無重複活動及無死鎖。

## Release manifest

2026-10-02 使用者明確授權「幫我套用sql」後，已將核心及通知 migration 依序套用至正式專案 `qwxzwomzoyfkorbwsscv`。新增四模式需求沿用前述 SQL 授權，已追加批次請假 migration。此次不升版、不 commit／push；未部署 worker／前端、未設定 Vault，亦未套用 staging。

| 順序 | 發布項目 | 相依／post-check | 遠端狀態 |
| --- | --- | --- | --- |
| 1 | `supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql` | 既有教練排班、合班 migration、profiles／permissions 與 push Outbox 基線；檢查新 feature、raw grant、RPC EXECUTE、來源 statement lock、版本與 audit | 已套用，schema／ACL post-check 通過 |
| 2 | `supabase/migrations/20261002150855_coach_leave_notification_outbox.sql` | 第 1 檔及現有通知 feed、web subscriptions、deliveries、cron／net／Vault；檢查 legacy feed 保留、service-only RPC、cron 及缺設定保留 pending | 已套用，原 feed hash／權限與 cron post-check 通過 |
| 3 | `supabase/migrations/20261002155846_coach_leave_batch_create_and_training_dates.sql` | 教練請假核心及既有訓練 program 月份日期 RPC；驗證 private receipt / RPC ACL / 全交易回滾與安全日期來源 | 已套用；history／ACL／核心及通知函式 hash／唯讀日期 probe 通過 |
| 4 | `process-coach-leave-notification-outbox` worker／secrets／排程 | `supabase/config.toml` 明訂 `verify_jwt=true`；Vault 設定完成後每分鐘派送。只部署此 function，勿 deploy-all | cron 已建立；worker／Vault 尚未完成 |
| 5 | 前端 | DB 與 worker驗收後發布；重新載入舊頁，避免未持版本的舊表單寫入 | 未發布 |

### SQL Editor 安裝順序與缺欄位排查

新環境安裝時，兩份 SQL 都必須從 `BEGIN` 到 `COMMIT` 完整執行。先執行 `20261002150832_coach_leave_and_schedule_templates.sql`，看到成功結果，再執行 `20261002150855_coach_leave_notification_outbox.sql`；不要只執行選取片段。上方正式專案已成功安裝，不能重跑。

新環境日期快選增強另需完整執行 `20261002155846_coach_leave_batch_create_and_training_dates.sql`，再發布新增表單；此為新的 forward migration，不修改或重跑前兩份已成功 migration。

若第二份出現 `42703: column e.coach_leave_payload does not exist`，代表它使用的前置欄位未建立。2026-10-02 唯讀檢查目前綁定專案，教練假單／範本表、請假 RPC、payload 欄位及新通知 RPC 都不存在，但既有合班鎖、排班表、共用 delivery 與通知 feed 已存在；此次應先套用完整第一份，不能只新增欄位就當成教練請假已安裝。

通知 migration 已加入前置檢查：core 物件或 payload 缺少時，以 `55000` 與完整檔名提示停止，不建立通知函式或搬移既有 feed。先前此 `42703` 若發生於完整交易中，該次通知安裝未提交，補齊 core 後可重新執行通知檔；若仍在同一連線的失敗交易，先 `ROLLBACK`。**已成功套用的 migration 不要再次整份執行**，尤其通知檔會保存原始 feed，重複執行不是一般更新流程。

### 正式資料庫部署證據

- Supabase migration history 已記錄 `20261002150832 / coach_leave_and_schedule_templates` 與 `20261002150855 / coach_leave_notification_outbox`；本機檔名與所有文件／測試引用已對齊，舊未部署檔名不再保留，避免 CLI 再次安裝。
- 教練假單／範本與三張 private audit／receipt 表均開啟 RLS，anon／authenticated 沒有 raw table／欄位寫入權限；14 支新增 public RPC 的 anon EXECUTE 皆拒絕，6 支 worker RPC 僅供 service role。本人／管理預設權限與四張來源的 BEFORE statement shared-lock trigger 均符合規則，範本 partial unique index 已 valid／ready。
- 原通知 feed 移至 private 後保持同一 OID 與 `prosrc` MD5（`8ce16d18e3cc32767da368ae7e305512`）；private base 不授予 anon／authenticated EXECUTE，public wrapper 只授予 authenticated。
- 已用回滾交易確認既有排班表的匿名 raw INSERT 受 RLS 拒絕，未留下測試排班或通知。
- 每分鐘 cron 已 active；只查 Vault 名稱存在性，三個教練通知設定皆未建立，未讀取任何 secret 值，cron 會跳過派送。尚未驗證真實測試帳號 CRUD、通知收件或瀏覽器推播。
- 日期快選追加 migration 已套用並對齊遠端 history `20261002155846`。private batch receipt RLS 啟用且 authenticated 無 raw SELECT／DML，兩支新 RPC anon EXECUTE 拒絕、authenticated 授權及固定空 search_path 確認通過；原單筆假單、public feed及private legacy feed來源 hash與套用前相同。以有效教練範圍執行唯讀日期 probe 回傳 2 個有效項目，日期均在指定月份，只有項目名稱與日期且沒有 note；未建立正式假單或通知，receipt count仍0。
- 此次 advisor 比對新增 1 個 private receipt [RLS 無 policy 提示](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 與 2 個 [authenticated security-definer RPC 提示](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)，符合禁止 raw grants／RPC 內檢查 active、feature、本人與管理範圍的設計；既有其他 findings 不變。
- Security advisor 已比對套用前後：新增五張表的 [RLS 無 policy 提示](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 為 RPC-only 與撤銷 raw grants 的設計；新增八支 [authenticated security-definer RPC 提示](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) 已檢查內部有效帳號／feature／本人範圍及固定 search_path。既有不相關警示維持原狀。

Edge secrets：`COACH_LEAVE_OUTBOX_SECRET`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`；Supabase runtime 提供 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。Vault：`coach_leave_outbox_function_url`、`coach_leave_outbox_authorization`、`coach_leave_outbox_secret`。Vault secret 與 Edge secret 必須相同；JWT header 必須符合目標環境 gateway。不得在 SQL、指令記錄或文件放入值。

既有發布阻擋仍見 `docs/EDGE_FUNCTIONS.md` 與 `docs/DELIVERY_WORKFLOW.md`：歷史 hard-coded private VAPID material 需撤銷／旋轉並完成 Secret scan。新 worker 只讀 Edge secrets，不使用帶舊憑證的共用 helper。若更換公鑰，必須驗證現有訂閱是否需重新註冊。

## 遠端 smoke 與 rollback

1. 以一般教練驗證僅本人假單 CRUD，MANAGER／ADMIN 驗證管理 action；停權、未開始與過期帳號拒絕。由直接 RPC／REST 驗證不能繞過。
2. 建立上午 09:00–12:30 指派，送出上午假：左側摘要、右側已選與首頁不再列出教練，audit 與版本存在；取消後不恢復。以 13:00 起迄與多日假複測。
3. 以至少兩位管理者／教練、重疊權限及多裝置驗證三種通知；訂閱為零仍有站內 feed，停用／取消權限不派送，deep link 正確，原因不出現在 payload。觀察 ledger及HTTP失敗重試。
4. 固定範本預覽後並行新增請假、修改來源或排班；整批 stale拒絕，重新預覽排除衝突；成功重送不重複。真正多連線鎖競爭與 Deno／gateway 必須在 staging 驗證。
5. 前端異常回滾到已知正常版本；暫停 cron／worker可停止瀏覽器派送，但保留 Outbox及站內通知。DB採 forward-fix，不刪 audit／receipts、不自動還原已移除指派。若回滾前端，舊客戶端依然受最新 RPC 權限、版本與衝突限制。

## 驗證證據

- 2026-10-02：最終本機 `pnpm check` 通過：254 files／1296 tests、220 教練 SQL checks、完整付款 SQL 與 production build；`git diff --check` 通過。版本維持 1.1.69，建置後確認 package／version mirror 相同，已還原產物時間戳。
- 2026-10-02：新增 worker 的 `deno check` 通過，web-push 固定版本 namespace 的 `setVapidDetails`／`sendNotification` 載入為 function；未啟動遠端 worker或實際派送。
- 2026-10-02：後續 SQL Editor 缺 `coach_leave_payload` 排查，唯讀確認 core 尚未部署；通知檔新增前置檢查與失敗交易保護。`pnpm test:coach-schedules:sql` 通過 243 checks（29 來源＋52 合班＋121 假單／範本及真實 migration 串接＋41 通知），包含缺 core／缺 payload／缺共用 delivery 提示與回滾，及 15 項真實 core→notification 的 enqueue／feed／worker／隱私檢查。此次未執行遠端 DDL 或 DML。
- 2026-10-02：後續按使用者授權套用兩份正式 migration，遠端 history 與本機檔名完成對齊，上方部署 post-check 通過。對齊後重跑教練 SQL 243 checks 全通過；隔離測試的 event／leave helper 改用資料庫 `updated_at::text` 保留微秒，避免 JS Date 截斷造成假性過期版本失敗，正式 SQL 的版本檢查未放寬。Worker 未部署，Vault 三項設定未建立，未驗證實際推播。
- 2026-10-02：真實 Vue／Element Plus 的 Chromium 手機尺寸回歸通過 60 checks，涵蓋 360／390／767 px、四種 Dialog、44 px 控制、單一捲動區、中文搜尋、多日假、固定本人、範本儲存及帶入。更多選單與完成教練選取後儲存均使用第一次觸控，不重試；各尺寸只送出一次帶入確認。沒有 console／page error、橫向溢出或外部網路請求。可重跑流程與隔離方式見 `tests/browser/README.md`，本輪證據位於 `/tmp/jg-coach-ui-verification/evidence.json`。
- 2026-10-02：依後續需求新增四模式日期快選及原子批次。`pnpm check` 完整通過；`tests/database/coachLeaveBatchCreate.integration.mjs` 89 checks，使教練 SQL suite 共 332 checks，涵蓋後段失敗回滾、13:00 邊界、365／366 筆、排序／原因正規化重試、取消後重試不恢復、授權撤回、真實 program 月份日期、私人 note 隱藏與 receipt ACL。新版 Chromium 手機流程於 360／390／767 px 通過 84 checks，無 console error／外部請求／橫向溢出；root 目視 360 px 快選與 767 px 連續多日截圖，證據 `/tmp/jg-coach-quick-leave-ui/evidence.json`。新增 migration 已遠端套用並對齊 history，前兩份已部署 migration 未改；版本維持 1.1.69，保留本輪開始前已有的其他工作區修改。
- 2026-10-03：範本管理新增獨立「新增範本」入口，直接建立訓練日範本或帶入本月訓練活動；前端 CREATE／必填及場地檢查、未儲存提示、失敗保留內容有同名測試。沿用已部署 RPC，無新 SQL／raw table 存取；既有排班不隨範本儲存變更。完整 `pnpm check` 通過 258 files／1349 tests、332 教練 SQL checks、角色及完整付款 SQL 與 production build；最後補正手機開關寬度後，相關 4 files／16 tests、型別檢查與 build 再次通過。Chromium 360／390／767px 共 105 checks 通過，六份空白／場地帶入表單的控制皆至少 44×44px、輸入文字 16px；無 browser error、外部請求及橫向溢出，證據 `/tmp/jg-coach-direct-template-touch-ui/evidence.json`，已目視 360px 直接新增與 767px 場地帶入。`git diff --check` 通過，版本 1.1.69，保留既有修改並還原建置時間戳；前端未 commit／push／發布。
- 尚未取得 GitHub CI／Secret scan、Vercel Preview、Supabase staging、實體 iPhone／Android與真實 Web Push 送達證據，不將本機通過視為發布或實機驗收。
