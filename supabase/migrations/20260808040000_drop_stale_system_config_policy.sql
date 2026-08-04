-- Remove política antiga (USING true) que existia fora do repo e anulava
-- a restrição a admin de system_config_authenticated_read (OR entre
-- políticas permissivas = qualquer authenticated ainda lia tudo).
DROP POLICY IF EXISTS system_config_read ON public.system_config;
