-- =========================================
-- 1. 費率設定表 (Fee Settings)
-- 用於紀錄校隊各別球員的計次費用（防呆預設 500）
-- =========================================
CREATE TABLE IF NOT EXISTS public.fee_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  per_session_fee integer NOT NULL DEFAULT 500,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(member_id)
);

-- =========================================
-- 2. 校隊月費結算表 (Monthly Fees)
-- 紀錄每位校隊球員每個月的結算結果
-- =========================================
CREATE TABLE IF NOT EXISTS public.monthly_fees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  year_month varchar(10) NOT NULL, -- e.g., '2024-03'
  total_sessions integer DEFAULT 0,
  leave_sessions integer DEFAULT 0,
  attended_sessions integer DEFAULT 0,
  per_session_fee integer DEFAULT 500,
  payable_amount integer DEFAULT 0, -- (出席 * 費率) - 應扣
  deduction_amount integer DEFAULT 0, -- 應扣金額 (手動微調)
  status varchar(20) DEFAULT 'unpaid', -- unpaid, paid
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(member_id, year_month)
);

-- =========================================
-- 3. 球員季費表單 (Quarterly Fees)
-- 紀錄一般球員的季費繳交紀錄 (依照 Google 表單設計)
-- =========================================
CREATE TABLE IF NOT EXISTS public.quarterly_fees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  year_quarter varchar(10) NOT NULL, -- e.g., '2024-Q1'
  amount_type varchar(50) NOT NULL, -- 10500 / 16500 / 3000 / other
  amount integer NOT NULL DEFAULT 0,
  note text,
  payment_method varchar(50), -- 匯款 / 現金交給謝準教練 / 其他
  account_last_5 varchar(10),
  proof_image_url text,
  status varchar(20) DEFAULT 'pending_review', -- pending_review, paid, unpaid
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 啟用 RLS
ALTER TABLE public.fee_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarterly_fees ENABLE ROW LEVEL SECURITY;

-- 只有 ADMIN 或 MANAGER 允許進行 CRUD 操作
CREATE POLICY "Enable all metadata management for admins" ON public.fee_settings
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'MANAGER')));

-- monthly_fees policies
CREATE POLICY "Enable all monthly fees management for admins" ON public.monthly_fees
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'MANAGER')));

-- quarterly_fees policies
CREATE POLICY "Enable all quarterly fees management for admins" ON public.quarterly_fees
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'MANAGER')));
