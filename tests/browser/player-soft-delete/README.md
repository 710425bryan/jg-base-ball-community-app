# 球員軟刪除隔離瀏覽器驗證

在專案根目錄執行 `node tests/browser/verify-player-soft-delete.mjs`，使用已安裝的 Chromium 與 `127.0.0.1:5194`。預設證據輸出至 `output/playwright/player-soft-delete/`，此目錄須保持 Git ignored。

Fixture 使用真實 `PlayersView`、Element Plus、共用 Dialog／Select、名單 Pinia store 與軟刪除 service；只有登入／權限及 Supabase 邊界使用隔離資料。Vite 不讀 `.env`、不啟用版本寫入與 PWA。所有外部網路請求阻擋，沒有正式 session 或遠端寫入。

390／1365px 驗證刪除二次確認使用已保存姓名、取消及關閉、失敗後保留草稿及當前畫面可見的持續錯誤、執行中防重送及關閉、重試成功只傳球員 ID。模擬 RPC 保留主檔及關聯紀錄，讀取來源與 meta 包含軟刪除列，由真實 `playerRosterApi` 過濾。確認在隊、退隊、全部、搜尋與匯出皆不可見；缺 DELETE／唯讀不可操作。要求零實體 DELETE、零意外 UPDATE、零外部請求與瀏覽器錯誤。

初始 fixture 同時保留一位已軟刪除手足與雙向 `sibling_ids`，在隊球員設為 `is_half_price=true`、`is_primary_payer=false`。驗證名單不誤顯示手動半價、編輯手足選單顯示空且不洩漏已刪除姓名／ID；刪除仍只送成員 ID，既有手足連結和另一位成員的完整資料不變。

這是隔離 UI 驗證，不能替代正式 RPC／RLS、資料庫 migration 或實體手機 safe area 驗收。
