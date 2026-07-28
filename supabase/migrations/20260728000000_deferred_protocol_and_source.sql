-- Deferred protocol: create only after payment; track checkout draft + origin
ALTER TABLE public.subscriptions
  ALTER COLUMN protocol_id DROP NOT NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_checkout jsonb;

ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'full_quiz';

COMMENT ON COLUMN public.subscriptions.pending_checkout IS
  'Draft quiz + protocol_items kept until payment is confirmed; then cleared.';
COMMENT ON COLUMN public.protocols.source IS
  'full_quiz | mini_quiz — origin of clinical data for the professional fila.';
