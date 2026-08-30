-- Registro de quem leu prontuário de quem.
--
-- Até 30/08/2026 só a assinatura deixava rastro. Leitura, não. Depois de um
-- incidente a única pergunta que importa é "o que foi acessado", e ela ficava
-- sem resposta — o que também define o que se comunica à ANPD e aos titulares:
-- sem registro, a notificação vira "possivelmente tudo".
--
-- Somente inserção, como o log de assinatura: quem lê não apaga o próprio
-- rastro.

CREATE TABLE IF NOT EXISTS leitura_prontuario (
  id          BIGSERIAL PRIMARY KEY,
  quem        UUID NOT NULL,
  papel       TEXT NOT NULL,
  -- `ficha` é o admin abrindo um cliente; `protocolo` é o profissional
  -- abrindo o quadro clínico de uma prescrição.
  o_que       TEXT NOT NULL,
  alvo        UUID NOT NULL,
  ip          TEXT,
  lido_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A pergunta de incidente é sempre "quem tocou neste titular" ou "o que esta
-- pessoa abriu na semana passada". Os dois índices existem para essas duas.
CREATE INDEX IF NOT EXISTS idx_leitura_alvo ON leitura_prontuario (alvo, lido_em DESC);
CREATE INDEX IF NOT EXISTS idx_leitura_quem ON leitura_prontuario (quem, lido_em DESC);

GRANT SELECT, INSERT ON leitura_prontuario TO app_web;
GRANT USAGE, SELECT ON SEQUENCE leitura_prontuario_id_seq TO app_web;
REVOKE UPDATE, DELETE ON leitura_prontuario FROM app_web, job_interno;

-- O vigia enxerga, para poder alertar sobre volume fora do normal mais adiante.
GRANT SELECT ON leitura_prontuario TO vigia;
