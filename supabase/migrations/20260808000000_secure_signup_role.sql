-- Signup sempre patient — ignora role vinda do client metadata.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_client_code TEXT;
BEGIN
  SELECT 'DD-' || LPAD(
    (COUNT(*) + 1)::TEXT, 6, '0'
  )
  INTO new_client_code
  FROM public.users;

  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    client_code,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'patient',
    new_client_code,
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- Impede auto-promoção de role via UPDATE autenticado.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
      RAISE EXCEPTION 'Não é permitido alterar role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.users;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_role_escalation();
