-- Congela composição do protocolo para o paciente (só SELECT).
-- Escrita fica no service_role (checkout/protocolo/farmácia).

-- protocol_items: SELECT only
REVOKE INSERT, UPDATE, DELETE ON public.protocol_items FROM authenticated;
GRANT SELECT ON public.protocol_items TO authenticated;

DROP POLICY IF EXISTS protocol_items_own ON public.protocol_items;
CREATE POLICY protocol_items_select_own ON public.protocol_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.protocols p
      WHERE p.id = protocol_items.protocol_id
        AND p.user_id = (select auth.uid())
    )
  );

-- protocols: SELECT only (criação só via service_role)
REVOKE INSERT, UPDATE, DELETE ON public.protocols FROM authenticated;
GRANT SELECT ON public.protocols TO authenticated;

DROP POLICY IF EXISTS protocols_own ON public.protocols;
CREATE POLICY protocols_select_own ON public.protocols
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- users: UPDATE só em campos de perfil (não client_code/role/email/…)
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (full_name, phone, birth_date, updated_at)
  ON public.users TO authenticated;
