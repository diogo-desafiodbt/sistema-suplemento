-- Privilégios do banco clínico no RDS.
--
-- Com RLS fora (decisão de 15/08/2026), é aqui que a defesa mora. Não é
-- tradução dos grants da Supabase: `service_role` tinha tudo em tudo, e era
-- exatamente esse o problema.
--
-- Aplicar com:  ./scripts/rodar-sql.sh clinico db/clinico/grants.sql
-- Idempotente: pode rodar de novo sem estragar nada.

-- ---------------------------------------------------------------------------
-- 1. Fecha o padrão
-- ---------------------------------------------------------------------------

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- O banco clínico não recebe conexão de quem cuida de conteúdo. Satélite não
-- ganha cópia da chave do cofre — nem para script pontual.
REVOKE CONNECT ON DATABASE clinico FROM PUBLIC;
REVOKE ALL ON DATABASE clinico FROM app_conteudo;

GRANT CONNECT ON DATABASE clinico TO app_web, job_interno;
GRANT USAGE ON SCHEMA public TO app_web, job_interno;

-- ---------------------------------------------------------------------------
-- 2. app_web — o que a aplicação faz atendendo requisição
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_web;

-- DELETE só onde o código realmente apaga hoje — todas no caminho de desfazer
-- checkout pela metade. Quando `withTransaction` substituir esse rollback à
-- mão, esta lista deve encolher, não crescer.
GRANT DELETE ON
  orders, order_items, payments, protocols, protocol_items,
  quiz_responses, subscriptions, terms_acceptances
TO app_web;

-- ---------------------------------------------------------------------------
-- 3. O rastro de auditoria não se reescreve
-- ---------------------------------------------------------------------------

-- Era o endurecimento de 13/08: a credencial que o sistema inteiro usa perdeu
-- UPDATE e DELETE aqui. Some o RLS, a propriedade continua.
REVOKE UPDATE, DELETE ON prescription_audit_logs FROM app_web, job_interno;
GRANT SELECT, INSERT ON prescription_audit_logs TO app_web, job_interno;

-- ---------------------------------------------------------------------------
-- 4. Ninguém se promove a profissional
-- ---------------------------------------------------------------------------

-- Substitui `trg_prevent_role_escalation`, que lia `auth.role()` e não existe
-- no RDS. Em vez de gatilho conferindo intenção, o privilégio simplesmente não
-- está lá: app_web recebe UPDATE em toda coluna de `users` menos `role`.
DO $$
DECLARE
  colunas text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO colunas
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name <> 'role';

  EXECUTE format('REVOKE UPDATE ON public.users FROM app_web');
  EXECUTE format('GRANT UPDATE (%s) ON public.users TO app_web', colunas);

  -- O mesmo vale para o INSERT, e isso passou batido até 19/08/2026: a
  -- aplicação podia criar um usuário JÁ administrador. `garantirPerfil`
  -- omite a coluna e o DEFAULT 'patient' resolve o caso legítimo.
  --
  -- Revogar só a coluna não adianta: a concessão de INSERT era de tabela
  -- inteira, e concessão ampla continua cobrindo a coluna revogada. Tem que
  -- revogar amplo e conceder estreito — como acima.
  EXECUTE format('REVOKE INSERT ON public.users FROM app_web');
  EXECUTE format('GRANT INSERT (%s) ON public.users TO app_web', colunas);
END
$$;

-- ---------------------------------------------------------------------------
-- 5. job_interno — rotina de fundo, sem requisição na frente
-- ---------------------------------------------------------------------------

GRANT SELECT ON ALL TABLES IN SCHEMA public TO job_interno;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO job_interno;

-- Escreve onde a rotina de fundo é dona: fila, trava, log, reconciliação.
GRANT INSERT, UPDATE, DELETE ON
  background_jobs, protocol_creation_locks, webhook_logs,
  pharmacy_api_logs, pharmacy_order_dispatch_logs,
  purchase_confirmation_logs, shipping_notification_logs,
  notification_logs, sunday_dispatch_logs, user_rfm_scores
TO job_interno;

-- E o que ela precisa alterar no fluxo do pedido.
GRANT INSERT, UPDATE ON orders, payments, subscriptions, protocols TO job_interno;

-- A promoção de papel é dela, não do app_web.
GRANT UPDATE ON public.users TO job_interno;

-- ---------------------------------------------------------------------------
-- 6. Tabela nova nasce fechada
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO app_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO job_interno;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_web, job_interno;
