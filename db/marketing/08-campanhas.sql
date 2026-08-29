-- Campanhas.
--
-- Uma tabela só, e não template separado como a v3 do desenho previa. A tela
-- aprovada em 28/08 monta o conteúdo dentro da própria campanha; biblioteca de
-- template reutilizável não foi pedida e tabela vazia é dívida.

CREATE TABLE IF NOT EXISTS marketing.campanha (
  id                  BIGSERIAL PRIMARY KEY,
  nome                TEXT NOT NULL,
  assunto             TEXT NOT NULL,
  -- Os blocos como o compositor os guarda. O HTML é derivado deles, nunca
  -- editado à mão: é isso que impede peça que quebra no Outlook.
  blocos              JSONB NOT NULL DEFAULT '[]',
  html                TEXT,
  -- O que o usuário escolheu no passo 3, guardado como foi escolhido. Sem
  -- isto, refazer a conta meses depois daria outro número, porque a base
  -- mudou.
  filtro              JSONB NOT NULL DEFAULT '{}',
  resend_audience_id  TEXT,
  resend_broadcast_id TEXT,
  situacao            TEXT NOT NULL DEFAULT 'rascunho',
  criada_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  publicada_em        TIMESTAMPTZ
);

ALTER TABLE marketing.campanha DROP CONSTRAINT IF EXISTS campanha_situacao_check;
ALTER TABLE marketing.campanha
  ADD CONSTRAINT campanha_situacao_check
  CHECK (situacao IN ('rascunho', 'publicada'));

-- Quem entrou no público, congelado no momento da criação.
--
-- A pergunta "quem recebeu esta campanha" não pode depender de os eventos da
-- Resend terem chegado. Se o webhook falhar por uma hora, a resposta ainda
-- precisa existir.
CREATE TABLE IF NOT EXISTS marketing.campanha_publico (
  campanha_id BIGINT NOT NULL REFERENCES marketing.campanha(id) ON DELETE CASCADE,
  lead_id     BIGINT NOT NULL REFERENCES marketing.lead(id),
  PRIMARY KEY (campanha_id, lead_id)
);

-- Testes enviados. O passo 3 da tela fica travado até existir uma linha aqui:
-- escolher público sem ter visto o e-mail chegar é o erro que não tem volta.
CREATE TABLE IF NOT EXISTS marketing.campanha_teste (
  id              BIGSERIAL PRIMARY KEY,
  campanha_id     BIGINT NOT NULL REFERENCES marketing.campanha(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  resend_email_id TEXT,
  enviado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teste_campanha ON marketing.campanha_teste (campanha_id);

ALTER TABLE marketing.campanha         OWNER TO marketing_owner;
ALTER TABLE marketing.campanha_publico OWNER TO marketing_owner;
ALTER TABLE marketing.campanha_teste   OWNER TO marketing_owner;

-- A tela escreve campanha, público e teste. Continua sem tocar em lead,
-- consentimento e supressão, que ela só lê.
GRANT SELECT, INSERT, UPDATE ON marketing.campanha         TO satelite_comercial;
GRANT SELECT, INSERT, DELETE ON marketing.campanha_publico TO satelite_comercial;
GRANT SELECT, INSERT         ON marketing.campanha_teste   TO satelite_comercial;
GRANT USAGE, SELECT ON SEQUENCE marketing.campanha_id_seq        TO satelite_comercial;
GRANT USAGE, SELECT ON SEQUENCE marketing.campanha_teste_id_seq  TO satelite_comercial;

-- ---------------------------------------------------------------------------
-- A conta de quem recebe
-- ---------------------------------------------------------------------------
-- Uma função só, para a tela e o envio usarem exatamente o mesmo critério. Se
-- a conta da tela e a do disparo divergirem, a tela vira mentira.
--
-- A regra que não pode ser esquecida está aqui dentro: só entra lead que TEM
-- linha em `marketing.consentimento`.
CREATE OR REPLACE FUNCTION marketing.publico_da_campanha(
  p_origens TEXT[],
  p_desde   TIMESTAMPTZ DEFAULT NULL,
  p_teto    INT DEFAULT NULL
) RETURNS TABLE (lead_id BIGINT, email TEXT, nome TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT l.id, l.email, l.nome
  FROM marketing.lead l
  WHERE l.origem = ANY(p_origens)
    AND (p_desde IS NULL OR l.captado_em >= p_desde)
    AND EXISTS (SELECT 1 FROM marketing.consentimento c WHERE c.lead_id = l.id)
    AND NOT EXISTS (
      SELECT 1 FROM marketing.supressao s WHERE lower(s.email) = lower(l.email)
    )
  ORDER BY l.captado_em DESC
  LIMIT coalesce(p_teto, 2147483647)
$$;

GRANT EXECUTE ON FUNCTION marketing.publico_da_campanha(TEXT[], TIMESTAMPTZ, INT)
  TO satelite_comercial;
