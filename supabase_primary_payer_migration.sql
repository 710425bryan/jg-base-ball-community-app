ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS is_primary_payer BOOLEAN DEFAULT false;

-- 說明：
-- 加入 is_primary_payer 可以讓教練手動指定這名球員為手足中「主要繳費」的代表（付全額）。
-- 沒有被勾選為「主要繳費」且互相綁定手足關係的球員，系統會在結算時自動算成半價。
