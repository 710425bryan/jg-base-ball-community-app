# 固定排班範本：場地＋教練

- 日期：2026-10-03（台灣）
- 狀態：實作、本機驗證與正式 migration 套用完成；前端納入後續授權的 1.1.70 main Git 發布，託管部署狀態另行確認。
- 本次更新取代 2026-10-02 範本的星期／來源／時間／標題匹配；教練請假、通知與來源合班規則維持。

## 功能與驗收

- 新增／編輯表單只有場地（必填，可搜尋或自訂）、固定教練（必填，多選）、範本名稱（選填，空白用場地名）、啟用（預設開）。沿用共用 Element Plus Select／Dialog、金橘品牌色及手機 44×44px 控制。
- 常用場地共用 training_venues，不受當月活動限制；已有中港國小、輔大棒球場地、新泰國中可直接選。自訂名稱只在範本成功儲存時原子建立，去首尾空白後沿用 exact name；不修改已有地址／地圖／啟用，取消或失敗不留下新名稱，刪除範本保留常用場地。
- 每個場地最多一個啟用範本；同場地不同星期、時間、活動類型及課程標題都使用同組教練，不要求標題相同。活動卡片「存成範本」僅預填場地與教練，不複製活動 ID／版本；未知場地可開草稿，保存前必選。
- 自動帶入維持選月份→預覽→選取確認；只處理台灣今天起有效、未指派的訓練日／場地訓練，保留已有指派與取消活動。請假、失效帳號、既有及同批撞班排除並顯示缺額；未知時間採全日保守檢查，並不再因缺開始時間而無法匹配範本。

## 資料與權限

- 新 migration：`supabase/migrations/20261002171951_coach_schedule_venue_templates.sql`；不修改已部署核心、批次請假及通知 migration。套用前檢查舊範本空表，非空即整筆拒絕，不猜測或合併不同教練組合。
- 範本模型只保存 venue ID、name、coach_profile_ids、is_active 及原有 ID／actor／版本／時間 metadata，移除舊匹配欄位與 index，新增每場地一啟用範本約束。list 回 venue_name／venue_is_active 及 `match_mode: 'venue'`；save 同簽名要求新版 mode、CREATE／EDIT及精確 updated_at，delete 保留 DELETE／版本檢查。
- `list_coach_schedule_template_venues()` 限有效 `coach_schedules:VIEW`，只回啟用場地 ID／name。範本保存依原 CREATE／EDIT 原子解析或建立名稱；不需要 training_locations 權限，亦不授予其管理能力。範本表維持 RPC-only、撤銷 raw grants，固定 search_path／限制 RPC 執行權限。
- 共用 enrich 對 training_location 使用權威來源 venue ID，training_date 僅以活動地點首尾去空白後與啟用場地 name 精確對應；不模糊匹配、不以雙側 trim 任取首筆、不改候選來源／合班 resolver。未確定場地則跳過。
- 預覽 fingerprint 使用 `venue-v2:` 並加入排序場地 ID／name／is_active／updated_at；confirm 先檢查新版 prefix 再查 receipt，防止舊確認回傳繞過新版規則。成功重送不重建排班、不恢復請假移除的指派。training_venues BEFORE INSERT／UPDATE／DELETE statement trigger 在 row locks 前先拿原 shared advisory lock，防止字典異動與範本／確認的反序鎖及競爭。

## 驗證及發布紀錄

- 2026-10-03 唯讀正式專案 qwxzwomzoyfkorbwsscv：舊範本 0 筆，三常用場地均啟用，authenticated 範本 raw SELECT／INSERT／UPDATE／DELETE 全拒絕。已保存安全／效能 advisors 與原排班單筆儲存、假單儲存、通知 feed、private 月份／首頁 base 函式定義 hash 作 post-check 基準；未建立真實範本或排班。
- `pnpm check` 通過：型別、259 files／1393 unit tests、155 項角色 SQL、435 項教練 SQL、完整付款 SQL／四種換行矩陣與 production build。範本相關 targeted suite 為 6 files／37 tests；完整檢查首輪遇到既有角色排序測試選取過廣，並行修正為僅取角色卡片後通過，未更改角色產品行為。完整 log：`/tmp/jg-coach-venue-template-check.log`。
- 新 `tests/database/coachScheduleVenueTemplates.integration.mjs` 通過 103 checks，涵蓋真實 migration、非空拒絕／原子回滾、場地唯一／停用、VIEW-only 安全清單及 CRUD 權限／帳號期限／raw 寫表防繞過、舊 mode／prefix／receipt、跨星期／時間／課程配對、generic 精確解析與來源權威 ID、過去／既有指派／取消保留、請假／13:00／同批撞班／缺額、版本及成功重試不恢復指派。檔名對齊遠端 migration history 後重跑 103 checks 通過；PGlite 不含真正多連線鎖競爭。
- 真實 Vue／Element Plus／AppGlobalSelect 的 Chromium 在 360／390／767px 通過 117 checks（各 39 項），涵蓋四欄位、中文場地／教練搜尋與多選、取消不建立、儲存失敗草稿保留、成功重開沿用場地 ID、同場地不同課程／同批撞班、自動帶入及既有四種請假模式／手動排班。控制至少 44×44px、輸入字級 16px，無 browser error／外部請求／水平溢出；已目視 360px 場地與失敗表單、390px 預覽及 767px 四欄位。證據：`/tmp/jg-coach-venue-template-ui/evidence.json`，重跑方式見 `tests/browser/README.md`。
- 正式套用前再次確認舊範本 0 筆、三常用場地均啟用；2026-10-03 沿用使用者先前「幫我套用sql」授權，僅套用本次 migration，遠端 history 為 `20261002171951_coach_schedule_venue_templates`，本地檔名與引用已對齊。未套用其他角色 migrations，未建立實際範本／教練指派。
- 正式 post-check：舊 weekday／source_type／start_time／title 欄位已移除、venue_id NOT NULL、啟用 venue partial unique index 與 BEFORE statement trigger（tgtype 30）符合；五支新版 RPC 均固定空 search_path、anon 不可執行，authenticated 可執行但函式內檢查功能權限，範本 raw 四種存取及 private enrich 執行皆拒絕。以有效 ADMIN 上下文及 authenticated role 在唯讀交易讀取，清單有 7 個啟用場地且只回 ID／name、三常用場地可用、範本 0 筆及預覽 `venue-v2:` 正常。
- 五支基準函式定義 hash 前後一致：單筆排班保存、單筆假單保存、通知 feed、private 月份與 Dashboard base；通知 worker 未修改。安全／效能 advisors 比對只新增安全場地 RPC 的預期 authenticated SECURITY DEFINER 提示，其 VIEW／有效帳號 guard、固定 search_path、最小回傳及匿名禁用已確認；無新增匿名／mutable search_path 或效能提示，未擴大修復既有 unrelated 項目。權限設計依 [Supabase 函式權限文件](https://supabase.com/docs/guides/database/functions)。
- 發布順序：migration（已完成）→ 前端；通知 worker 不受場地範本變更影響。初次功能驗證版本為 1.1.69，後續使用者明確授權升版、commit 與 push，納入 1.1.70；保留既有功能修改及 CLI 暫存內容。
- 未取得 GitHub CI／Secret scan、Vercel Preview、staging 多連線鎖競爭、實體 iPhone／Android 鍵盤／IME／safe area 或正式帳號操作證據；本機瀏覽器與隔離 PGlite 不等同這些驗收。

## 後續：固定教練與指派教練分組排序

- 固定範本、活動卡片及手動排班的教練下拉使用既有可搜尋 Element Plus 多選與 option group；依角色權限設定的 weight 升冪、同分 role_key 排序，群組標題取 role_name，組內依暱稱／姓名／ID 穩定排序。
- `coachScheduleCoachOptions.ts` 只整理來源 RPC 已提供的教練，不新增角色資格或修改授權；canonical／歷史中文角色合併，metadata 缺失使用既有 shared fallback。父排班頁載入及範本開啟／重載時沿用 permission store 取得角色清單，卡片不逐筆查詢；store 更新即重排，不改選取的 profile IDs。
- 卡片原請假註記及停用保留，搜尋只保留有結果的群組，跨組多選與一次儲存維持。此次為前端分類展示，不需新增 migration 或修改既有 RPC。
- 相關 unit suite 7 files／53 tests 通過（helper 8、共用排序 12、permission store 6、範本 15、卡片 5、手動排班 4、父頁 3）。完整 `pnpm check` 通過 260 files／1409 tests、教練 SQL 435 checks、角色 SQL 155 checks、完整付款 SQL、型別與 production build；紀錄 `/tmp/jg-coach-template-role-groups-check.log`。
- 手動 Dialog 在手機尺寸原有 40px／14px 控制，補上局部手機樣式後重跑 4 files／32 tests 與 `pnpm build`（含型別）通過。最終 Chromium 360／390／767px 各 54 checks、共 162 checks 通過，驗證角色改排序／改名、組內姓名、中文搜尋空組隱藏、跨組多選保存、請假禁選與既有流程；卡片與手動選單／選項至少 44px、輸入 16px，外部請求與 browser errors 均 0。
- 瀏覽器證據 `/tmp/jg-coach-template-role-groups-ui/evidence.json`，已目視 360px 卡片及 767px 範本分組；修補前量測保存於同目錄 `manual-control-metrics.json`。此為隔離 mock 資料的 Chromium 驗證，實體手機 IME／鍵盤／safe area 仍待驗收。前端未發布，版本維持 1.1.69。
