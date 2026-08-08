-- Postgres concede EXECUTE a PUBLIC por padrão na criação da função; revogar
-- apenas de anon/authenticated não basta, pois ambos herdam de PUBLIC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
