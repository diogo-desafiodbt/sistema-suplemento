-- O funil passa a aceitar o mesmo evento mais de uma vez por pessoa.
--
-- Havia `UNIQUE (session_id, event_type)`, e ele fazia sentido enquanto o
-- identificador vinha de `sessionStorage` e morria com a aba: cada visita era
-- uma sessão nova, e o único risco era gravar duas vezes o mesmo passo da
-- mesma visita.
--
-- Com o identificador virando cookie de um ano, a mesma pessoa atravessa
-- meses. Quem faz o quiz em setembro e refaz em dezembro tem duas intenções de
-- compra, não uma — e com a restrição no lugar a segunda simplesmente não
-- existiria. Pior: seria uma perda silenciosa, porque o `ON CONFLICT DO
-- NOTHING` da rota engole sem erro.
--
-- Quem conta pessoas agora conta `DISTINCT session_id`; quem conta intenções
-- conta linhas. As duas perguntas passam a ter resposta, e antes só a primeira
-- tinha — mal.

ALTER TABLE funnel_events DROP CONSTRAINT IF EXISTS funnel_events_session_id_event_type_key;

-- Sem a restrição, a busca por pessoa numa etapa precisa de índice próprio.
CREATE INDEX IF NOT EXISTS idx_funnel_sessao_tipo
  ON funnel_events (session_id, event_type, created_at DESC);
