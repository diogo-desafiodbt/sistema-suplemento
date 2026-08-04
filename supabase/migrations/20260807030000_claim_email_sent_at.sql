-- Evidência de e-mail enviado na própria claim (não depende de notification_logs genérico).
ALTER TABLE public.shipping_notification_logs
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

ALTER TABLE public.purchase_confirmation_logs
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
