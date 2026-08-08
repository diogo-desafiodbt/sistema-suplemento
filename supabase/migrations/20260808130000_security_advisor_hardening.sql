-- Unifica as duas políticas permissivas de SELECT em professionals numa só
-- (mesmo resultado de acesso, uma avaliação por query em vez de duas).
DROP POLICY IF EXISTS professionals_admin_read ON public.professionals;
DROP POLICY IF EXISTS professionals_own ON public.professionals;

CREATE POLICY professionals_select ON public.professionals
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'::user_role
  )
);

-- Funções de trigger/event trigger não precisam ser chamáveis via RPC público.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- Fixa search_path (boa prática, mesmo sem SECURITY DEFINER nessas duas).
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_ryuza_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$function$;
