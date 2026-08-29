-- Papel e porta do webhook da Resend.
--
-- Mesmo desenho da captação: o papel público não recebe privilégio de tabela
-- nenhum, só EXECUTE numa função. Se a Lambda for comprometida, o atacante
-- consegue registrar eventos falsos — não consegue ler a base de leads.

CREATE OR REPLACE FUNCTION marketing.registrar_evento(
  p_tipo            TEXT,
  p_email           TEXT,
  p_subtipo         TEXT DEFAULT NULL,
  p_resend_email_id TEXT DEFAULT NULL,
  p_broadcast_id    TEXT DEFAULT NULL,
  p_ocorrido_em     TIMESTAMPTZ DEFAULT NULL,
  p_dados           JSONB DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketing, pg_temp
AS $$
DECLARE
  v_email   TEXT;
  v_lead    BIGINT;
  v_quando  TIMESTAMPTZ;
  v_id      BIGINT;
  v_softs   INT;
BEGIN
  v_email  := lower(btrim(coalesce(p_email, '')));
  v_quando := coalesce(p_ocorrido_em, now());
  IF v_email = '' OR p_tipo IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_lead FROM marketing.lead WHERE lower(email) = v_email;

  -- Repetição da Resend não vira evento novo. Sem isto, uma reentrega contaria
  -- a mesma abertura duas vezes e inflaria o engajamento.
  INSERT INTO marketing.evento_email
    (lead_id, email, tipo, subtipo, resend_email_id, broadcast_id, ocorrido_em, dados)
  VALUES
    (v_lead, v_email, p_tipo, p_subtipo, p_resend_email_id, p_broadcast_id, v_quando, p_dados)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN RETURN NULL; END IF;

  -- Contadores na própria linha do lead: é assim que a pergunta "quem são os
  -- mais engajados" não precisa varrer a tabela de eventos.
  IF v_lead IS NOT NULL THEN
    UPDATE marketing.lead SET
      enviados         = enviados + CASE WHEN p_tipo = 'delivered' THEN 1 ELSE 0 END,
      abertos          = abertos  + CASE WHEN p_tipo = 'opened'    THEN 1 ELSE 0 END,
      clicados         = clicados + CASE WHEN p_tipo = 'clicked'   THEN 1 ELSE 0 END,
      ultimo_evento_em = greatest(coalesce(ultimo_evento_em, v_quando), v_quando)
    WHERE id = v_lead;
  END IF;

  -- Política de bounce, decidida em 27/08 comparando com o listmonk:
  --   reclamação  → suprime na primeira, e vale para todos os canais, porque
  --                 a pessoa disse que não quer
  --   hard bounce → suprime na primeira, mas só e-mail: a caixa morreu, a
  --                 pessoa não pediu nada
  --   soft bounce → não suprime; caixa cheia não é endereço morto. Na segunda
  --                 ocorrência passa a valer como morto.
  IF p_tipo = 'complained' THEN
    INSERT INTO marketing.supressao (email, motivo, alcance)
    VALUES (v_email, 'reclamacao', 'todos')
    ON CONFLICT (LOWER(email)) DO NOTHING;

  ELSIF p_tipo = 'bounced' AND coalesce(p_subtipo, '') = 'hard' THEN
    INSERT INTO marketing.supressao (email, motivo, alcance)
    VALUES (v_email, 'bounce', 'email')
    ON CONFLICT (LOWER(email)) DO NOTHING;

  ELSIF p_tipo = 'bounced' THEN
    SELECT count(*) INTO v_softs
      FROM marketing.evento_email
     WHERE lower(email) = v_email AND tipo = 'bounced'
       AND coalesce(subtipo, '') <> 'hard';

    IF v_softs >= 2 THEN
      INSERT INTO marketing.supressao (email, motivo, alcance)
      VALUES (v_email, 'bounce', 'email')
      ON CONFLICT (LOWER(email)) DO NOTHING;
    END IF;

  ELSIF p_tipo = 'unsubscribed' THEN
    INSERT INTO marketing.supressao (email, motivo, alcance)
    VALUES (v_email, 'descadastro', 'todos')
    ON CONFLICT (LOWER(email)) DO NOTHING;
  END IF;

  RETURN v_id;
END $$;

ALTER FUNCTION marketing.registrar_evento(TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,JSONB)
  OWNER TO marketing_owner;
REVOKE ALL ON FUNCTION marketing.registrar_evento(TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,JSONB)
  FROM PUBLIC;

DO $$ BEGIN
  CREATE ROLE ingestao_marketing WITH LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT rds_iam TO ingestao_marketing;
GRANT CONNECT ON DATABASE clinico TO ingestao_marketing;
GRANT USAGE ON SCHEMA marketing TO ingestao_marketing;
GRANT EXECUTE ON FUNCTION marketing.registrar_evento(TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,JSONB)
  TO ingestao_marketing;

ALTER DEFAULT PRIVILEGES IN SCHEMA marketing REVOKE ALL ON TABLES FROM ingestao_marketing;

-- A tela lê os eventos para mostrar métrica de campanha.
GRANT SELECT ON marketing.evento_email TO satelite_comercial;
