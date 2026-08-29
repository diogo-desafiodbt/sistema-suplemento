-- Zona de marketing: a base de leads.
--
-- Schema próprio, e não mais uma tabela em `public`. Os satélites de hoje se
-- protegem por GRANT estreito — o de pedidos até por coluna — e isso depende
-- de escrever o grant certo toda vez. Aqui a proteção é estrutural: o papel
-- não recebe USAGE em `public`, e `REVOKE ALL ON SCHEMA public FROM PUBLIC`
-- (grants.sql:14) garante que ninguém herda esse acesso por descuido.
--
-- Lead e cliente são zonas de dado diferentes. A tela que dispara e-mail em
-- massa nunca tem motivo para tocar em prontuário.

CREATE SCHEMA IF NOT EXISTS marketing;

-- Dono da zona. NOLOGIN: ninguém entra como ele, ele só existe para ser o
-- proprietário do schema e o "definer" da função de captação.
DO $$ BEGIN
  CREATE ROLE marketing_owner NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lista fechada de origens. Texto livre vira "youtube", "YouTube" e "yt" em
-- três meses, e a segmentação morre junto.
CREATE TABLE IF NOT EXISTS marketing.origem (
  codigo    TEXT PRIMARY KEY,
  descricao TEXT NOT NULL
);
INSERT INTO marketing.origem (codigo, descricao) VALUES
  ('newsletter',  'Cadastro antigo na newsletter do Desafio Diabetes'),
  ('live-14-09',  'Inscrição no popup da página /especial da live de 14/09/2026')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS marketing.lead (
  id                BIGSERIAL PRIMARY KEY,
  uuid              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  email             TEXT NOT NULL,
  nome              TEXT,
  origem            TEXT NOT NULL REFERENCES marketing.origem(codigo),
  origem_detalhe    TEXT,
  captado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  situacao          TEXT NOT NULL DEFAULT 'ativo',
  enviados          INT NOT NULL DEFAULT 0,
  abertos           INT NOT NULL DEFAULT 0,
  clicados          INT NOT NULL DEFAULT 0,
  ultimo_evento_em  TIMESTAMPTZ
);

-- Unicidade sem diferenciar maiúscula. Sem isto, Joao@ e joao@ viram dois
-- leads — e quem descadastrou por um continua recebendo pelo outro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_email
  ON marketing.lead (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_lead_origem_captado
  ON marketing.lead (origem, captado_em DESC);

-- Só insere, nunca atualiza. Prova que se sobrescreve deixa de ser prova.
CREATE TABLE IF NOT EXISTS marketing.consentimento (
  id             BIGSERIAL PRIMARY KEY,
  lead_id        BIGINT NOT NULL REFERENCES marketing.lead(id),
  texto          TEXT NOT NULL,
  origem_coleta  TEXT NOT NULL,
  aceito_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consentimento_lead
  ON marketing.consentimento (lead_id);

-- Indexada por e-mail, não por id de lead: é isso que torna a reimportação de
-- CSV segura. Quem descadastrou continua bloqueado mesmo entrando como
-- registro novo.
CREATE TABLE IF NOT EXISTS marketing.supressao (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  motivo       TEXT NOT NULL,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supressao_email
  ON marketing.supressao (LOWER(email));

ALTER SCHEMA marketing OWNER TO marketing_owner;
ALTER TABLE marketing.origem        OWNER TO marketing_owner;
ALTER TABLE marketing.lead          OWNER TO marketing_owner;
ALTER TABLE marketing.consentimento OWNER TO marketing_owner;
ALTER TABLE marketing.supressao     OWNER TO marketing_owner;
