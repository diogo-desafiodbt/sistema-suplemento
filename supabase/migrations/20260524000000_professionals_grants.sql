-- GRANTs para professionals e audit logs (server-side via service_role)
GRANT SELECT, INSERT, UPDATE ON public.professionals TO service_role;
GRANT SELECT ON public.professionals TO authenticated;
GRANT SELECT, INSERT ON public.prescription_audit_logs TO service_role;
