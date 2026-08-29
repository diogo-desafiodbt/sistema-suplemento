-- Telefone no lead.
--
-- A live é divulgada e entregue por grupo de WhatsApp, então o telefone vale
-- tanto quanto o e-mail para esta origem. Guardado só em dígitos: máscara é
-- coisa de tela, e formato misto no banco quebra qualquer cruzamento depois.

ALTER TABLE marketing.lead ADD COLUMN IF NOT EXISTS telefone TEXT;

-- A assinatura muda, então a função antiga sai. CREATE OR REPLACE criaria uma
-- sobrecarga e a Lambda passaria a ter duas portas — uma delas sem telefone.
DROP FUNCTION IF EXISTS marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION marketing.captar_lead(
  p_email               TEXT,
  p_nome                TEXT,
  p_telefone            TEXT,
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

  IF coalesce(btrim(p_texto_consentimento), '') = '' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM marketing.supressao s WHERE lower(s.email) = v_email) THEN
    RETURN NULL;
  END IF;

  -- Nome e telefone existentes não são apagados por um cadastro repetido que
  -- venha vazio; a origem nunca é sobrescrita.
  INSERT INTO marketing.lead (email, nome, telefone, origem, origem_detalhe)
  VALUES (v_email, v_nome, v_telefone, p_origem,
          nullif(btrim(coalesce(p_origem_detalhe, '')), ''))
  ON CONFLICT (LOWER(email)) DO UPDATE
    SET nome     = coalesce(marketing.lead.nome, EXCLUDED.nome),
        telefone = coalesce(marketing.lead.telefone, EXCLUDED.telefone)
  RETURNING id INTO v_id;

  INSERT INTO marketing.consentimento (lead_id, texto, origem_coleta)
  VALUES (v_id, p_texto_consentimento, p_origem_coleta);

  RETURN v_id;
END $$;

ALTER FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  OWNER TO marketing_owner;
REVOKE ALL ON FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing.captar_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO captacao_lead;
