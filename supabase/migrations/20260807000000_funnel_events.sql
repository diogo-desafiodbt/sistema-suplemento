-- Eventos do funil admin (quiz/checkout), independentes de pagamento.

CREATE TYPE funnel_event_type AS ENUM (
  'quiz_started',
  'quiz_completed',
  'quiz_eligible',
  'checkout_started'
);

CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type funnel_event_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, event_type)
);

GRANT SELECT, INSERT ON public.funnel_events TO service_role;

-- quiz_sessions nunca mais é escrita por nenhum código — descarta.
DROP TABLE IF EXISTS public.quiz_sessions;
