-- Registro de aceite dos Termos de Uso no checkout (versão + hash do texto).

CREATE TABLE public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  terms_version text NOT NULL,
  terms_hash text NOT NULL,
  ip_address text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.terms_acceptances TO service_role;
-- UPDATE necessário para desvincular o aceite quando a subscription é
-- descartada após falha de pagamento (mantendo a evidência de consentimento).
GRANT UPDATE (subscription_id) ON public.terms_acceptances TO service_role;
