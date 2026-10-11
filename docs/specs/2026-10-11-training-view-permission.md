# 特訓報名必須勾選檢視權限

- 狀態：後端已部署並驗證；前端納入 1.1.76 發布。Git／CI／Vercel 結果以該版本的提交與部署紀錄為準。
- Delivery 目標：正式發布（使用者已授權全部工作區修改、Supabase 部署及 VAPID 輪替）。
- 日期：2026-10-11
- 需求：使用者確認「新泰太陽社區」未勾選特訓權限仍可使用，要求「沒勾選就不能使用」。

## 規則與範圍

`training:VIEW` 是特訓功能的必要入口權限。有效 ADMIN 保留既有 bypass；其他角色即使綁定球員，也不得繞過此權限。CREATE / EDIT / DELETE 為管理操作權限，不能單獨代替 VIEW。現有權限矩陣勾選管理操作時會自動帶入 VIEW。

有 VIEW 的一般使用者仍只可替本人綁定球員報名、查看自己的點數與報名；VIEW 不授予教練管理或點數調整能力。取消 VIEW 不刪除既有報名、點數或歷史紀錄，不自動授予任何角色權限。其他功能的綁定球員例外與一般賽事日曆維持原規則。

本次涵蓋選單、路由、首頁特訓入口／點數卡、特訓 RPC 與 raw-table RLS、通知中心與三支特訓通知 Edge Functions。依使用者「以上兩者都要」指示，原有通知刷新、auth、維運文件與腳本一併納入版本；保存歷史維運腳本不表示重跑。

## 驗收條件

- [x] 未勾 VIEW 且有綁定球員：桌機／手機不顯示特訓入口，直接網址導回大廳，不載入特訓 workspace。
- [x] 只有 CREATE / EDIT / DELETE 而無 VIEW，仍不能進入或呼叫特訓功能。
- [x] 有 VIEW 且有綁定球員：個人報名可用，仍受綁定範圍、時間窗、點數與禁報檢查。
- [x] VIEW 不開放全隊管理；有效 ADMIN 保留原能力，停權／過期／匿名不放行。
- [x] 後端拒絕未授權的 RPC 與直接 table 操作，既有歷史與點數資料不變，背景自動化可繼續。
- [x] 特訓通知收件人必須有 VIEW；保留原本 targeted 範圍與管理 action 限制。
- [x] 非特訓功能與通知不受影響，原有未提交工作完整保留。

## 實作與驗證

使用 `jg-baseball-project-workflow`、`jg-baseball-auth-permissions`、`jg-baseball-training`、`jg-baseball-push-notifications`、`jg-baseball-delivery-workflow` 與 Supabase skill。

| 層級 | 內容 | 驗證 |
| --- | --- | --- |
| 前端 | VIEW gate、路由、workspace 生命週期、首頁入口、權限文案 | Vue / router / 元件回歸、手機與桌機隔離瀏覽器 |
| Database | 新 migration 保留最新 function shape，追加權限 gate 與 RLS | 隔離 SQL 回歸、授權／拒絕／歷史資料保留 |
| Notifications | VIEW 收件資格、個人目標範圍、feed 過濾 | Edge 純邏輯與 feed 單元測試，測試不派送真實通知 |
| 全域 | 型別、既有回歸、建置 | 完整 Vitest、Node、SQL、build 與 diff 檢查；Node observer 測試由正確的 Node runner 執行 |

`TrainingView.vue` 原本超過 1,800 行，本次將既有內容完整搬至 `TrainingWorkspace.vue`，以小型 route wrapper 控制授權生命週期。權限刷新時先卸載內容；確定無 VIEW 才導回大廳，仍有 VIEW 則重建內容。角色、帳號或綁定球員變更也會重建，避免舊請求恢復先前畫面。workspace 的內部表單流程本次不重構，後續可分拆個人報名、教練管理及點數管理。

其他既有大型檔案（MainLayout、HomeView、myHome、notification feed 與通知 Edge Functions）只加入必要 gate，保留原本資料流與未提交的刷新工作，避免把授權修正擴大成全面重構；通知共用資格已抽至 `trainingNotificationAccess.ts`。migration 與 SQL fixture 以隔離整合測試驗證，文件及產物不另寫單元測試。

## 發布清單與邊界

- 版本：1.1.76；`package.json`、Vite 產生的 `public/version.json`／`dist/version.json` 一致。
- Supabase 正式專案：`qwxzwomzoyfkorbwsscv`。
- `20261011161249_training_view_permission_gate.sql` 已於 2026-10-12 台灣時間套用。套用前比對 26 支線上 function 定義；套用後確認 17 支使用者 RPC gate、6 支 unchecked helper 的 service-only ACL、4 項 restrictive RLS 與 8 項特訓點名 policies。
- 正式唯讀權限 probe：未勾選 VIEW 的 COMMITTEE（新泰太陽社區）三支讀取 RPC 均回 42501，raw table 與 feed 隱藏；VIEW-only linked 可讀自己的資料、未綁定不放行。目前受入口收緊影響的是 1 個有效且綁定球員的 COMMITTEE 帳號；MEMBER 的 87 個有效綁定帳號已有 VIEW。
- 前後比對點數交易 348 筆、角色權限 441 筆及其 fingerprint 均未變；特訓設定、報名、禁報資料原為零筆，套用後一致。不替任何角色勾選權限、不刪除歷史。
- `20261011161534_profile_last_seen_write_throttle.sql` 已套用以補齊 migration history。五分鐘本人更新節流在套用前已存在；前後 function 定義、owner／ACL 一致，這次不是首次啟用該 DB 行為。前端 session 隔離與去重納入 1.1.76。
- 既有 retention 已於 10/09 部署；本次未重跑維護啟用或歷史教練通知處置腳本，也未部署不存在的教練請假 worker／節日通知。
- 使用者明確選擇更換 VAPID 金鑰並接受重新啟用推播。新私鑰只存 Supabase secrets；前端只保存 public key。三項 secret 已比對摘要，私鑰不同於退役值，public key 與前端一致。
- 原有 105 筆啟用中的舊訂閱已停用並保留記錄。更新前端後，使用者須到推播設定按「重新啟用推播」；開啟對話框只讀取狀態，不自動解除訂閱或要求通知權限。
- 12 支通知函式完成部署；三支特訓套用 VIEW gate，其餘九支保留線上行為，只替換 VAPID 初始化與共用 secrets helper。原 gateway `verify_jwt` 模式保持不變。詳見 `docs/EDGE_FUNCTIONS.md`。
- 先完成 DB／Edge，再發布前端；DB 用 forward-fix。若需回滾前端／Edge，須保留嚴格 VIEW 邊界與新金鑰，不可恢復已退役私鑰或 linked-only bypass。

## 驗證證據與剩餘項目

- 完整 `pnpm check` 通過：278 個 Vitest files／1,592 tests；Node observer 13 tests；roles SQL 216、training SQL 394、coach-schedules SQL 508、payments SQL 613；typecheck 與 production build 成功。僅有既有 bundle 大小／Browserslist 警告。
- `package.json` 將 observer 從 Vitest 排除後接續 Node runner，沒有省略既有測試。特訓 SQL 已納入 `pnpm check`。
- 維運 SQL 額外 129 項檢查通過（last-seen 13、retention 76、歷史通知處置 40）。只在隔離 fixture 執行，沒有重跑正式維運。
- 特訓 SQL 覆蓋 LF／CRLF 最新 RPC 定義、未知形狀整筆回滾、無 VIEW／僅 CRUD／停權／存取期間／匿名拒絕、綁定所有權、有效 ADMIN、RLS、function metadata、歷史 fingerprint、server／cron 及一般點名。
- 瀏覽器：真實本機 App 搭配隔離 Auth／REST／Realtime，390px 與 1365px 共 12 項檢查通過、8 張截圖、零 pageErrors；外部請求全部攔截。這不是手機實機或正式使用者登入驗收。
- 推播更新：16 項 mounted UI／subscription helper 測試涵蓋舊 key、缺失 key、新 key、唯讀開啟、重新訂閱失敗與成功；共用 secret／特訓通知另有 31 項測試，涵蓋收件條件、target 與授權。12/12 部署 bundle 編譯成功且無退役私鑰 literal。
- 正式 DB advisor 前後比較沒有新增問題；既有 policy／search-path／password 設定提示仍存在，本次不擴大處理。
- 正式 Edge：12 支 ACTIVE 且下載 source 逐檔 hash 完全相符；30 項冷啟動／gateway 負測試通過（無 auth 與無效 JWT 均被 9 支 JWT=true 函式拒絕）。這不代替有效使用者完整操作驗收。
- 驗證沒有發送真實測試通知。實機推播須在使用者重新啟用後驗收；不能以 bundle、gateway 或 RPC 成功代替實際送達。
- 本機完整 log：`/tmp/jg-release-1.1.76-rotation-check.log`；瀏覽器證據：`/tmp/jg-training-permission-browser/evidence.json`；key rotation 摘要：`/tmp/jg-vapid-rotation-evidence.json`。暫存證據不作為 Git 交付檔案。
