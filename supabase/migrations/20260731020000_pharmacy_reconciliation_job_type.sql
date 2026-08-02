-- Adiciona job_type 'pharmacy_reconciliation' ao enum usado em background_jobs
-- (para a reconciliação diária da API da farmácia deixar rastro consultável).

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE 'pharmacy_reconciliation';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
  WHEN duplicate_object THEN
    NULL;
END $$;
