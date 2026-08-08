-- Idade informada na triagem (sem fabricar birth_date fictício).
ALTER TABLE public.quiz_responses
  ADD COLUMN IF NOT EXISTS age integer;

COMMENT ON COLUMN public.quiz_responses.age IS
  'Idade informada pelo paciente na triagem (anos). Preferir este campo a birth_date quando preenchido.';
