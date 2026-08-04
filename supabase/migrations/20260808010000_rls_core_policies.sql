-- RLS nas tabelas sensíveis. service_role continua bypass.
-- Políticas: usuário só acessa a própria linha.
-- auth.uid() sempre entre parênteses — (select auth.uid()) avalia uma vez
-- por consulta em vez de por linha (mesmo padrão da migration de performance).

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Revoga leitura anônima de config operacional.
REVOKE ALL ON public.system_config FROM anon;
GRANT SELECT ON public.system_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.system_config TO service_role;

-- users
-- Retira a política antiga (FOR ALL) — substituída pelas duas abaixo,
-- mais estritas (sem INSERT/DELETE) e sem reavaliar auth.uid() por linha.
DROP POLICY IF EXISTS users_own ON public.users;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- addresses
DROP POLICY IF EXISTS addresses_own ON public.addresses;
CREATE POLICY addresses_own ON public.addresses
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- login history
DROP POLICY IF EXISTS login_history_own ON public.user_login_history;
CREATE POLICY login_history_own ON public.user_login_history
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS login_history_insert_own ON public.user_login_history;
CREATE POLICY login_history_insert_own ON public.user_login_history
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- entitlements
DROP POLICY IF EXISTS entitlements_own ON public.user_entitlements;
CREATE POLICY entitlements_own ON public.user_entitlements
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- quiz
DROP POLICY IF EXISTS quiz_own ON public.quiz_responses;
CREATE POLICY quiz_own ON public.quiz_responses
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- protocols
DROP POLICY IF EXISTS protocols_own ON public.protocols;
CREATE POLICY protocols_own ON public.protocols
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- protocol_items via protocol ownership
DROP POLICY IF EXISTS protocol_items_own ON public.protocol_items;
CREATE POLICY protocol_items_own ON public.protocol_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.protocols p
      WHERE p.id = protocol_items.protocol_id AND p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.protocols p
      WHERE p.id = protocol_items.protocol_id AND p.user_id = (select auth.uid())
    )
  );

-- subscriptions / payments / orders
DROP POLICY IF EXISTS subscriptions_own ON public.subscriptions;
CREATE POLICY subscriptions_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS payments_own ON public.payments;
CREATE POLICY payments_own ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = payments.subscription_id AND s.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS orders_own ON public.orders;
CREATE POLICY orders_own ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS order_items_own ON public.order_items;
CREATE POLICY order_items_own ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS terms_own ON public.terms_acceptances;
CREATE POLICY terms_own ON public.terms_acceptances
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS notification_logs_own ON public.notification_logs;
CREATE POLICY notification_logs_own ON public.notification_logs
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- system_config: só admin (a subquery em users já é auto-restrita à própria
-- linha pela política users_select_own, então checar a própria role aqui é
-- seguro — nunca enxerga role de outro usuário).
DROP POLICY IF EXISTS system_config_authenticated_read ON public.system_config;
CREATE POLICY system_config_authenticated_read ON public.system_config
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid()) AND u.role = 'admin'
    )
  );
