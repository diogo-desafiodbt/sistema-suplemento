-- Auto-recuperação de claim em shipping_notification_logs (claimOnce precisa DELETE).

GRANT DELETE ON public.shipping_notification_logs TO service_role;
