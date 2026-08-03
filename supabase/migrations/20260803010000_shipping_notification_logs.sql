-- Idempotência de e-mails de novidade no frete (despacho / rastreio / entrega).

CREATE TABLE IF NOT EXISTS public.shipping_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event_id)
);

GRANT SELECT, INSERT ON public.shipping_notification_logs TO service_role;
