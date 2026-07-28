-- Fix: service_role was missing grants on tables used by backend jobs.
-- Found via audit: farmacia/enviar and pharmacy-order (Inngest) read
-- system_config with the admin/service client and were getting permission
-- denied (403), silently blocking every pharmacy dispatch.

GRANT SELECT ON public.system_config TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.background_jobs TO service_role;

GRANT SELECT, INSERT ON public.sunday_dispatch_logs TO service_role;

GRANT INSERT ON public.notification_logs TO service_role;
