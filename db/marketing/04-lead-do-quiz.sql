-- Lead capturado no quiz, antes da prescrição.
--
-- Quem preenche o quiz está pedindo uma recomendação, não pedindo newsletter.
-- Então o cadastro passa a existir sem consentimento de marketing: o lead
-- grava sempre, e a linha de consentimento só nasce se a pessoa marcar a
-- caixa. Sem essa separação, ou a gente deixa de captar quem abandonou, ou
-- capta gente que nunca autorizou — e é essa segunda que gera reclamação de
-- spam e queima o domínio de envio.
--
-- REGRA QUE VALE PARA SEMPRE: segmentação de campanha só pode olhar lead que
-- TEM linha em `marketing.consentimento`. Lead sem consentimento existe para
-- a ficha do cliente e para contato sobre a própria compra, não para disparo.

INSERT INTO marketing.origem (codigo, descricao) VALUES
  ('quiz-suplemento', 'Última tela do quiz de suplementos, antes da prescrição')
ON CONFLICT (codigo) DO NOTHING;

DROP FUNCTION IF EXISTS marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION marketing.captar_lead(
  p_email               TEXT,
  p_nome                TEXT,
  p_telefone            TEXT,
  p_origem              TEXT,
  p_origem_detalhe      TEXT,
  p_texto_consentimento TEXT,
  p_origem_coleta       TEXT,
  p_aceita_marketing    BOOLEAN DEFAULT TRUE
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketing, pg_temp
AS $$
DECLARE
  v_email    TEXT;
  v_nome     TEXT;
  v_telefone TEXT;
  v_id       BIGINT;
BEGIN
  v_email    := lower(btrim(coalesce(p_email, '')));
  v_nome     := nullif(btrim(coalesce(p_nome, '')), '');
  v_telefone := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');

  IF v_email = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN NULL;
  END IF;

  -- Aceitou marketing sem texto é erro de quem chamou: o texto é a prova, e
  -- prova vazia não vale. Recusa em vez de gravar consentimento fantasma.
  IF p_aceita_marketing AND coalesce(btrim(p_texto_consentimento), '') = '' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM marketing.supressao s WHERE lower(s.email) = v_email) THEN
    RETURN NULL;
  END IF;

  INSERT INTO marketing.lead (email, nome, telefone, origem, origem_detalhe)
  VALUES (v_email, v_nome, v_telefone, p_origem,
          nullif(btrim(coalesce(p_origem_detalhe, '')), ''))
  ON CONFLICT (LOWER(email)) DO UPDATE
    SET nome     = coalesce(marketing.lead.nome, EXCLUDED.nome),
        telefone = coalesce(marketing.lead.telefone, EXCLUDED.telefone)
  RETURNING id INTO v_id;

  IF p_aceita_marketing THEN
    INSERT INTO marketing.consentimento (lead_id, texto, origem_coleta)
    VALUES (v_id, p_texto_consentimento, p_origem_coleta);
  END IF;

  RETURN v_id;
END $$;

ALTER FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  OWNER TO marketing_owner;
REVOKE ALL ON FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO captacao_lead;
