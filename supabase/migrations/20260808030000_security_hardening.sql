-- Fecha gaps de segurança: role, RLS faltante.
-- auth.uid()/auth.role() sempre entre parênteses — (select ...) avalia uma
-- vez por consulta em vez de por linha (mesmo padrão da migration de perf).

-- 1) Trigger anti-escalação robusto (auth.role() + jwt.claims JSON).
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    jwt_role := coalesce(
      nullif(auth.role(), ''),
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
        ''
      )
    );

    IF jwt_role IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Não é permitido alterar role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Policy de UPDATE em users não pode mudar role (defense in depth).
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid())
    AND role = (SELECT u.role FROM public.users u WHERE u.id = (select auth.uid()))
  );

-- 3) health_records
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_records_own ON public.health_records;
CREATE POLICY health_records_own ON public.health_records
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- 4) content_access
ALTER TABLE public.content_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_access_own ON public.content_access;
CREATE POLICY content_access_own ON public.content_access
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- 5) professionals — SELECT só própria linha ou admin (via service_role no admin).
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professionals_own ON public.professionals;
CREATE POLICY professionals_own ON public.professionals
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS professionals_admin_read ON public.professionals;
CREATE POLICY professionals_admin_read ON public.professionals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid()) AND u.role = 'admin'
    )
  );
