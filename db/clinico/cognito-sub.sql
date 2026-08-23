\set ON_ERROR_STOP on
\pset pager off

-- O Cognito emite um identificador próprio (`sub`), diferente do que o
-- Supabase emitia. `users.id` NÃO muda: é ela que está em orders,
-- subscriptions, protocols e mais uma dúzia de tabelas.
--
-- Esta coluna é a ponte. `sessaoAtual()` recebe o sub, troca por users.id, e
-- os 31 lugares do passo 1 continuam sem saber de nada.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cognito_sub text;
CREATE UNIQUE INDEX IF NOT EXISTS users_cognito_sub_uidx
  ON public.users (cognito_sub) WHERE cognito_sub IS NOT NULL;

-- app_web precisa ler e gravar (o cadastro grava na criação).
-- Revogar amplo e conceder estreito: a concessão por coluna não cobre coluna
-- nova sozinha.
DO $$
DECLARE cols_update text; cols_insert text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols_update
  FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
    AND column_name NOT IN ('role','cpf','email');
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols_insert
  FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
    AND column_name NOT IN ('role','cpf');
  EXECUTE format('REVOKE UPDATE ON public.users FROM app_web');
  EXECUTE format('GRANT UPDATE (%s) ON public.users TO app_web', cols_update);
  EXECUTE format('REVOKE INSERT ON public.users FROM app_web');
  EXECUTE format('GRANT INSERT (%s) ON public.users TO app_web', cols_insert);
END
$$;

\echo '=== a coluna e o indice ==='
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name='users' AND column_name='cognito_sub';

\echo ''
\echo '=== app_web enxerga a coluna nova? ==='
SELECT has_column_privilege('app_web','users','cognito_sub','SELECT') AS le,
       has_column_privilege('app_web','users','cognito_sub','UPDATE') AS escreve,
       has_column_privilege('app_web','users','cpf','UPDATE')         AS ainda_barra_cpf;

\echo ''
\echo '=== e os satelites NAO enxergam (esperado: f) ==='
SELECT has_column_privilege('satelite_pedidos','users','cognito_sub','SELECT') AS satelite_pedidos;
