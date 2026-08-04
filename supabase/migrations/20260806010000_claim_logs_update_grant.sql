-- markClaimCompleted precisa UPDATE em completed_at.

GRANT UPDATE ON public.purchase_confirmation_logs TO service_role;
GRANT UPDATE ON public.shipping_notification_logs TO service_role;
