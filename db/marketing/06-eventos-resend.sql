-- Eventos de e-mail vindos da Resend, e a supressão que eles alimentam.
--
-- Direção: a Resend empurra, o sistema grava. Nada aqui consulta a Resend.
-- Quem devolve e quem reclama precisa entrar na supressão no momento em que
-- acontece — descobrir no disparo seguinte é repetir o erro e dobrar o dano na
-- reputação do domínio.

-- ---------------------------------------------------------------------------
-- Alcance da supressão
-- ---------------------------------------------------------------------------
-- Decidido em 28/08/2026: quem pede para sair sai de tudo, hoje e em qualquer
-- canal que venha depois. Mas endereço que devolve é outra coisa — significa
-- que a caixa morreu, não que a pessoa não quer mais falar com a gente. Sem
-- essa distinção, um e-mail antigo quebrado apagaria o WhatsApp de um cliente
-- ativo no dia em que existir WhatsApp.
--
-- O padrão é 'todos', que é o lado seguro: na dúvida, não procurar a pessoa.
ALTER TABLE marketing.supressao
  ADD COLUMN IF NOT EXISTS alcance TEXT NOT NULL DEFAULT 'todos';

ALTER TABLE marketing.supressao DROP CONSTRAINT IF EXISTS supressao_alcance_check;
ALTER TABLE marketing.supressao
  ADD CONSTRAINT supressao_alcance_check CHECK (alcance IN ('todos', 'email'));

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------
-- Só insere. `lead_id` aceita nulo porque a Resend também avisa sobre e-mail
-- que não está na nossa base — disparo de teste, por exemplo.
CREATE TABLE IF NOT EXISTS marketing.evento_email (
  id               BIGSERIAL PRIMARY KEY,
  lead_id          BIGINT REFERENCES marketing.lead(id),
  email            TEXT NOT NULL,
  tipo             TEXT NOT NULL,
  subtipo          TEXT,
  resend_email_id  TEXT,
  broadcast_id     TEXT,
  ocorrido_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dados            JSONB
);

CREATE INDEX IF NOT EXISTS idx_evento_lead  ON marketing.evento_email (lead_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_evento_tipo  ON marketing.evento_email (tipo, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_evento_email ON marketing.evento_email (LOWER(email));

-- A mesma entrega chega mais de uma vez quando a Resend repete. Sem isto, um
-- reenvio contaria abertura duas vezes e inflaria o engajamento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_evento_unico
  ON marketing.evento_email (resend_email_id, tipo, ocorrido_em)
  WHERE resend_email_id IS NOT NULL;

ALTER TABLE marketing.evento_email OWNER TO marketing_owner;
