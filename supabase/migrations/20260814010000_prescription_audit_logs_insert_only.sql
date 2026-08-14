-- Log de auditoria de prescrição: somente inserção via service_role.
-- postgres (dono) permanece com UPDATE/DELETE para manutenção via migração.
REVOKE UPDATE, DELETE ON public.prescription_audit_logs FROM service_role;
GRANT SELECT, INSERT ON public.prescription_audit_logs TO service_role;
