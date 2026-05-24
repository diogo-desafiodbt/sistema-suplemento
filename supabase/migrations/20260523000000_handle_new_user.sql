-- Função que cria o perfil público automaticamente após cadastro
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
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'patient'
    ),
    new_client_code,
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Permissões para jobs e webhooks server-side
GRANT SELECT, INSERT, UPDATE ON public.users TO service_role;
GRANT SELECT, INSERT ON public.user_login_history TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_entitlements TO service_role;

-- Permissões para usuários autenticados (RLS filtra as linhas)
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.addresses TO authenticated;
GRANT SELECT, INSERT ON public.user_login_history TO authenticated;
GRANT SELECT ON public.user_entitlements TO authenticated;
GRANT SELECT, INSERT ON public.quiz_responses TO authenticated;
GRANT SELECT, INSERT ON public.protocols TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.protocol_items TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.health_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.content_access TO authenticated;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.system_config TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.system_config TO anon;
GRANT INSERT ON public.quiz_sessions TO anon;
