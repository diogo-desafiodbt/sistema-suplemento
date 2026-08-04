-- Distingue claim concluída com sucesso de claim abandonada (reclaim).

ALTER TABLE public.pharmacy_order_dispatch_logs ADD COLUMN completed_at timestamptz;
ALTER TABLE public.purchase_confirmation_logs ADD COLUMN completed_at timestamptz;
ALTER TABLE public.shipping_notification_logs ADD COLUMN completed_at timestamptz;
ALTER TABLE public.support_messages ADD COLUMN completed_at timestamptz;
