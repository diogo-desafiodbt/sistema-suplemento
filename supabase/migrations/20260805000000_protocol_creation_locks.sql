-- Idempotência da criação de protocolo (corrida checkout + webhook).

CREATE TABLE public.protocol_creation_locks (
  subscription_id uuid PRIMARY KEY REFERENCES public.subscriptions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.protocol_creation_locks TO service_role;
