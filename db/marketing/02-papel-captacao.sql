-- Papel do formulário público da live.
--
-- Este é o primeiro papel do sistema que atende a internet aberta sem sessão
-- nenhuma. Por isso ele não recebe privilégio de tabela: recebe EXECUTE em UMA
-- função, e mais nada.
--
-- Com GRANT direto (INSERT em lead, SELECT em supressao) a função de captação
-- funcionaria igual, e um comprometimento da Lambda daria ao atacante um
-- SELECT na base de leads. Com a função como única porta, o que ele alcança é
-- exatamente o que a função devolve: um id.

DO $$ BEGIN
  CREATE ROLE captacao_lead WITH LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT rds_iam TO captacao_lead;
GRANT CONNECT ON DATABASE clinico TO captacao_lead;
GRANT USAGE ON SCHEMA marketing TO captacao_lead;

-- A única porta.
--
-- Devolve NULL para e-mail inválido ou suprimido, e o chamador responde 200 do
-- mesmo jeito nos três casos. Resposta diferente para e-mail já cadastrado
-- entregaria uma forma de descobrir quem está na base, uma consulta por vez.
CREATE OR REPLACE FUNCTION marketing.captar_lead(
  p_email               TEXT,
  p_nome                TEXT,
  p_origem              TEXT,
  p_origem_detalhe      TEXT,
  p_texto_consentimento TEXT,
  p_origem_coleta       TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketing, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_nome  TEXT;
  v_id    BIGINT;
BEGIN
  v_email := lower(btrim(coalesce(p_email, '')));
  v_nome  := nullif(btrim(coalesce(p_nome, '')), '');

  IF v_email = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN NULL;
  END IF;

  IF coalesce(btrim(p_texto_consentimento), '') = '' THEN
    RETURN NULL;
  END IF;

  -- Quem saiu não volta pela porta da frente.
  IF EXISTS (SELECT 1 FROM marketing.supressao s WHERE lower(s.email) = v_email) THEN
    RETURN NULL;
  END IF;

  -- A origem NÃO é sobrescrita em conflito: quem já estava na base entrou por
  -- outro caminho, e a primeira origem é a que ordena a segmentação depois.
  INSERT INTO marketing.lead (email, nome, origem, origem_detalhe)
  VALUES (v_email, v_nome, p_origem, nullif(btrim(coalesce(p_origem_detalhe, '')), ''))
  ON CONFLICT (LOWER(email)) DO UPDATE
    SET nome = coalesce(marketing.lead.nome, EXCLUDED.nome)
  RETURNING id INTO v_id;

  -- Sempre insere, mesmo em cadastro repetido: cada aceite é um fato novo,
  -- com seu próprio horário.
  INSERT INTO marketing.consentimento (lead_id, texto, origem_coleta)
  VALUES (v_id, p_texto_consentimento, p_origem_coleta);

  RETURN v_id;
END $$;

ALTER FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  OWNER TO marketing_owner;

-- Sem isto, todo papel do banco poderia chamar a função.
REVOKE ALL ON FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO captacao_lead;

-- Nada de futuro por padrão: tabela nova em marketing não nasce visível.
ALTER DEFAULT PRIVILEGES IN SCHEMA marketing REVOKE ALL ON TABLES FROM captacao_lead;
