-- Idempotência do disparo pharmacy-order por pagamento (corrida cartão + webhook).

CREATE TABLE public.pharmacy_order_dispatch_logs (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id),
  order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_order_dispatch_logs TO service_role;
