-- job_type do consumidor da caixa de saída de protocolo.
-- Cada ADD VALUE em instrução própria (ADD VALUE + transação em Postgres antigo).

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'processar_protocolos';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
END $$;
