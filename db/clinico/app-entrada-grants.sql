-- app_entrada — a credencial da Zona 0-E (enclave).
--
-- Onde entra estranho, a credencial não lê prontuário. Isso deixa de ser
-- convenção do código e passa a ser recusa do banco: mesmo com execução de
-- código no processo de entrada, o SELECT não volta.
--
-- Levantado seguindo os imports das 18 rotas de entrada até os módulos de lib.
-- Cada tabela abaixo está aqui porque alguma rota comprovadamente precisa —
-- não há GRANT ALL nem ALL TABLES: tabela nova nasce invisível, e quem
-- acrescentar rota concede junto, de propósito.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_entrada') THEN
    CREATE ROLE app_entrada LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE clinico TO app_entrada;
GRANT USAGE   ON SCHEMA public    TO app_entrada;

-- ---------------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------------
GRANT SELECT ON orders, payments, products, subscriptions, users TO app_entrada;

-- protocols: TRÊS COLUNAS. As rotas da farmácia precisam achar o PDF e filtrar
-- por assinado. `status` é estado de fluxo, não diagnóstico. Ler qualquer outra
-- coluna — signed_by, quiz_response_id — passa a ser permission denied.
GRANT SELECT (id, status, prescription_pdf_path) ON protocols TO app_entrada;

-- ---------------------------------------------------------------------------
-- Escrita
-- ---------------------------------------------------------------------------
GRANT INSERT, UPDATE ON
  addresses, funnel_events, orders, payments, pharmacy_api_logs,
  subscriptions, terms_acceptances, user_entitlements,
  user_login_history, webhook_logs
TO app_entrada;

-- users: mesma regra que vale para app_web desde 19/08 — pode criar e editar,
-- NÃO pode escrever `role`. Sem isso a entrada cunha administrador.
-- Revoga amplo e concede estreito: concessão de tabela inteira continuaria
-- cobrindo a coluna revogada.
DO $$
DECLARE colunas text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO colunas
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name <> 'role';

  EXECUTE format('REVOKE INSERT, UPDATE ON public.users FROM app_entrada');
  EXECUTE format('GRANT INSERT (%s) ON public.users TO app_entrada', colunas);
  EXECUTE format('GRANT UPDATE (%s) ON public.users TO app_entrada', colunas);
END
$$;

-- client_code sai de sequence (garantirPerfil)
GRANT USAGE, SELECT ON SEQUENCE public.client_code_seq TO app_entrada;

-- ---------------------------------------------------------------------------
-- O que NÃO é concedido, e é o ponto de tudo isto
-- ---------------------------------------------------------------------------
-- quiz_responses          respostas clínicas
-- protocol_items          o que foi prescrito
-- health_records          exames
-- prescription_audit_logs quem assinou o quê
-- professionals           o prescritor
-- protocol_creation_locks a trava do núcleo
--
-- Nenhum DELETE, em tabela nenhuma.
