-- Amarra protocolo em criação à subscription (crash recovery sem órfão cross-user).

ALTER TABLE public.protocols
  ADD COLUMN creation_subscription_id uuid REFERENCES public.subscriptions(id);

CREATE INDEX protocols_creation_subscription_id_idx
  ON public.protocols (creation_subscription_id)
  WHERE creation_subscription_id IS NOT NULL;
