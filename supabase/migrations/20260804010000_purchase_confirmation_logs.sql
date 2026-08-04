-- Idempotência do e-mail de compra confirmada por pagamento.

CREATE TABLE public.purchase_confirmation_logs (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.purchase_confirmation_logs TO service_role;
