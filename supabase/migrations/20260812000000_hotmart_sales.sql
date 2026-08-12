-- Sync diário de vendas Hotmart (Guia Primeiro Passo).
-- Só armazenamento/relatório — sem side-effects no app.

CREATE TABLE public.hotmart_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_code text NOT NULL UNIQUE,
  product_id bigint NOT NULL,
  product_name text,
  buyer_name text,
  buyer_email text,
  buyer_ucode text,
  status text NOT NULL,
  order_date timestamptz,
  approved_date timestamptz,
  price_value numeric,
  price_currency text,
  payment_method text,
  is_subscription boolean,
  recurrency_number integer,
  commission_as text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hotmart_sales_order_date_idx ON public.hotmart_sales (order_date);
CREATE INDEX hotmart_sales_status_idx ON public.hotmart_sales (status);

ALTER TABLE public.hotmart_sales ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.hotmart_sales TO service_role;

-- job_type usado em background_jobs pelo cron hotmart-sales-sync
DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE 'hotmart_sales_sync';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
  WHEN duplicate_object THEN
    NULL;
END $$;
