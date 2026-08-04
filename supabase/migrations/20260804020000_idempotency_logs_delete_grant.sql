-- DELETE nas tabelas de idempotência (retry libera a claim após falha).
-- Idempotente se as migrations 040000/040100 já tiverem o grant.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_order_dispatch_logs TO service_role;
GRANT SELECT, INSERT, DELETE ON public.purchase_confirmation_logs TO service_role;
