-- Triagem clínica: years_diagnosed deixa de ser obrigatório;
-- novas colunas de segurança clínica em quiz_responses.

ALTER TABLE public.quiz_responses
  ALTER COLUMN years_diagnosed DROP NOT NULL;

ALTER TABLE public.quiz_responses
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS is_pregnant_or_breastfeeding boolean,
  ADD COLUMN IF NOT EXISTS renal_conditions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hepatic_conditions text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quiz_responses_sex_check'
  ) THEN
    ALTER TABLE public.quiz_responses
      ADD CONSTRAINT quiz_responses_sex_check
      CHECK (sex IS NULL OR sex IN ('homem', 'mulher'));
  END IF;
END $$;
