-- 允許任何人 (包含 Google Apps Script 匿名程式) 寫入季費紀錄資料表
CREATE POLICY "Enable insert for anon" ON public.quarterly_fees
AS PERMISSIVE FOR INSERT
TO public
WITH CHECK (true);
