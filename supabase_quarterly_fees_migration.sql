-- 季費表單新增欄位
ALTER TABLE public.quarterly_fees ADD COLUMN IF NOT EXISTS remittance_date DATE;
ALTER TABLE public.quarterly_fees ADD COLUMN IF NOT EXISTS payment_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.quarterly_fees ADD COLUMN IF NOT EXISTS other_item_note TEXT;

-- 將原本必填的 amount_type 解除限制 (如果原本有的話)，我們改為將明細存入 payment_items
ALTER TABLE public.quarterly_fees ALTER COLUMN amount_type DROP NOT NULL;
