-- Catálogo e funil são públicos: a rota não precisa da chave que ignora RLS.
-- INSERT anônimo só dos tipos que a rota já aceita — contornar o código
-- não contorna o banco. Sem SELECT: quem envia evento não lê o funil alheio.

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- `authenticated` também precisa: a rota usa o client de sessão, e quem já está
-- logado ao abrir o checkout envia `checkout_started` como authenticated, não
-- como anon. Sem isto o evento sumiria em silêncio — a rota engole erro e não
-- confere o resultado do upsert, então ninguém perceberia o funil furado.
GRANT USAGE ON TYPE public.funnel_event_type TO anon, authenticated;
GRANT INSERT ON public.funnel_events TO anon, authenticated;

-- Sem SELECT em nenhum dos dois: quem envia evento não lê o funil alheio.
DROP POLICY IF EXISTS funnel_events_anon_insert ON public.funnel_events;
CREATE POLICY funnel_events_anon_insert ON public.funnel_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Hoje o enum já tem exatamente estes quatro valores, então esta lista é
    -- redundante. Fica porque acrescentar um valor ao enum não deve, sozinho,
    -- abrir escrita anônima para ele.
    event_type IN (
      'quiz_started',
      'quiz_completed',
      'quiz_eligible',
      'checkout_started'
    )
  );
