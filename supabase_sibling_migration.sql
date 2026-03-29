-- 先移除先前的 boolean 欄位
ALTER TABLE public.team_members 
DROP COLUMN IF EXISTS is_half_fee_sibling;

-- 新增 sibling_id (關聯到主要繳費的哥哥/姊姊)
ALTER TABLE public.team_members 
ADD COLUMN sibling_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;

-- 說明：
-- sibling_id 用來綁定這位球員的「主要繳費手足」。
-- 若此欄位有值（不為 NULL），代表他是第二位，系統將在結算月費時自動給予單次費率半價的優惠。
