-- Garante valor 'pending' no status de subscriptions (enum ou text).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'subscription_status' AND n.nspname = 'public'
  ) THEN
    BEGIN
      ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'pending';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
