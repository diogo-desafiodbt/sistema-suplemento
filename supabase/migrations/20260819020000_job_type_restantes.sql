-- job_type dos 8 jobs que ainda não deixavam rastro em background_jobs.
-- payment_retry já existe no enum — não repetir.
-- Cada ADD VALUE em instrução própria (ADD VALUE + transação em Postgres antigo).

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'support_inbox_poll';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'support_pending_reminder';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'support_analyze';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'purchase_confirmed';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'pharmacy_order';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'create_shipping_label';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'avulso_renewal_reminder';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;
