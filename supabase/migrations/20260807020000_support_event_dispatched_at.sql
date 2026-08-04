-- Evidência de dispatch Inngest pra heal sem reenvio nem drop silencioso.
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS event_dispatched_at timestamptz;
