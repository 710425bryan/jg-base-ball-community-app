# 新增角色與複製權限瀏覽器回歸

從專案根目錄執行 `node tests/browser/verify-role-permissions.mjs`，可傳入輸出資料夾。

角色排序回歸執行 `node tests/browser/verify-role-order.mjs`，同樣可傳入輸出資料夾。`?view=users` 模式掛載真實 UsersView，以本機 profile 名單與八個預設角色加一個長名稱自訂角色驗證排序數字、儲存 RPC、loading 防重複、失敗後保留草稿、反覆儲存、同分角色識別碼排序，以及 UsersView 網格／表格群組同步重排。桌機選中角色與手機 Drawer 使用同一個實際 RoleSortEditor。

角色顯示名稱回歸執行 `node tests/browser/verify-role-name.mjs [output-directory]`，直接使用 Playwright Chromium 操作 360、390、700、1280 px；前三種寬度以第一次觸控操作角色卡片、儲存及選項。真實 RoleNameEditor 經 `update_app_role_name` 本機 mock 驗證 trim／儲存成功、防重複、失敗保留與重試、空白／超長輸入不送出、唯讀識別碼、ADMIN 改名後權限鎖定，以及 UsersView 網格／表格群組、角色徽章及新增使用者的角色選項同步。名稱與排序交叉儲存不可清掉另一欄草稿，桌機儲存中切換角色後仍需同步原角色結果且不覆蓋目前角色。100 字連續英文、長中文自訂名稱與文字放大另檢查 44px 控制、16px 手機輸入字級、水平溢出、Drawer 實際觸控捲動、底部到達與關閉可觸及性。完成後確認角色 key／weight／is_system、profiles 及權限列保留；除用來驗證草稿的排序調整與復原外，mutation 只有名稱 RPC。輸出 evidence.json 和截圖；不讀取或更新正式資料。

Runner 依既有 coach-ui fixture 的 standalone Vite 模式啟動 `127.0.0.1:5179`，先以 agent-browser 驗證載入，再以 Playwright Chromium 操作 360、390、700 與 1280 px 寬度。需要現有 pnpm dependencies、Chromium 與可由 npx 呼叫的 agent-browser。

Fixture 使用實際 RolePermissionsManager、Element Plus、AppGlobalSelect、AppGlobalDialog、permissions store、角色 service 與全域樣式。Supabase import 被替換為本機 in-memory query/RPC；未預期 API 會直接失敗，所有外部請求均阻擋並要求為零。沒有 production session、key 或 remote 寫入，Vite 不讀專案環境變數，也不載入 PWA／版本寫入 plugin。

回歸涵蓋預設不複製、既有角色來源、停用 ADMIN 複製、RPC 參數、loading 防重複、成功後選取新角色和權限矩陣、可指派角色 store 刷新、失敗後保留表單、手機滿版 Dialog、固定 footer、44 px 控制、橫向溢出，以及文字放大模式下長角色名稱。輸出 evidence.json、agent-browser snapshot 與截圖，失敗時保留畫面與文字診斷。

這是 Chromium 模擬尺寸驗證，不能取代實體 iPhone／Android、硬體 safe area 或正式 Supabase RPC 授權驗收。
