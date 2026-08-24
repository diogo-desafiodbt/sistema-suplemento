\set ON_ERROR_STOP on
\pset pager off

-- Entrega 2 do suporte com IA: decisão tipada e flag de envio automático.
-- `triagem_ia` já existe (entrega 1) — não recriar.

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS decisao_ia jsonb,
  ADD COLUMN IF NOT EXISTS enviado_automaticamente boolean NOT NULL DEFAULT false;

-- Revoga amplo e concede estreito. Conceder estreito por cima de amplo
-- não tira o que já estava lá — mesma armadilha do users.cpf e do
-- support_access_log.
REVOKE ALL ON public.support_threads FROM app_web;
GRANT SELECT, INSERT, UPDATE ON public.support_threads TO app_web;

\echo '=== colunas novas ==='
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'support_threads'
   AND column_name IN ('decisao_ia', 'enviado_automaticamente', 'triagem_ia')
 ORDER BY column_name;

\echo ''
\echo '=== app_web pode SELECT/INSERT/UPDATE e NÃO pode DELETE? ==='
SELECT
  has_table_privilege('app_web', 'public.support_threads', 'SELECT') AS pode_select,
  has_table_privilege('app_web', 'public.support_threads', 'INSERT') AS pode_insert,
  has_table_privilege('app_web', 'public.support_threads', 'UPDATE') AS pode_update,
  has_table_privilege('app_web', 'public.support_threads', 'DELETE') AS pode_delete;

\echo ''
\echo '=== DELETE sob app_web tem que falhar (com ROLLBACK) ==='
BEGIN;
SET LOCAL ROLE app_web;
-- Se o DELETE passar, este script aborta no próximo passo. Esperamos
-- permission denied / insufficient_privilege.
DO $$
BEGIN
  DELETE FROM public.support_threads WHERE false;
  RAISE EXCEPTION 'FALHOU: app_web conseguiu DELETE em support_threads';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok: DELETE negado sob app_web';
END
$$;
ROLLBACK;
