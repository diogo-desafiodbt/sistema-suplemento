-- Área Comercial: papel da tela e marcação de conversão.
--
-- O papel enxerga `marketing` e nada mais. Não recebe USAGE em `public`, então
-- prontuário, pedido e pagamento não existem para ele — nem por erro de grant
-- futuro, porque o schema inteiro está fora do alcance.
--
-- PENDÊNCIA REGISTRADA (28/08/2026): a Regra 2 do documento de arquitetura
-- v5 diz que satélite não recebe credencial do banco do núcleo. Esta zona
-- segue o padrão dos satélites já em produção (alertas, pedidos, ajustes), que
-- também divergem da letra. A regra foi escrita quando existia uma credencial
-- única que podia tudo; hoje cada serviço tem papel próprio. Decidido em
-- 28/08 evoluir o documento para v6 depois, não bloquear a entrega aqui.

-- Origem nova, ainda sem ninguém: a captura na página do Guia não existe.
INSERT INTO marketing.origem (codigo, descricao) VALUES
  ('visitante-guia', 'Visitante da página do Guia Digital (captura ainda não implantada)')
ON CONFLICT (codigo) DO NOTHING;

-- Quando o lead virou compra. Carimbado pelo núcleo, nunca calculado pela
-- tela: o satélite não pode perguntar "esse e-mail comprou?", porque isso
-- exigiria ler `public.users`.
ALTER TABLE marketing.lead ADD COLUMN IF NOT EXISTS convertido_em TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_lead_convertido ON marketing.lead (convertido_em);

-- A porta do núcleo para dentro de marketing. Recebe só o e-mail e devolve
-- se achou. Nenhum privilégio de tabela é concedido ao núcleo.
CREATE OR REPLACE FUNCTION marketing.marcar_conversao(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketing, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_n     INT;
BEGIN
  v_email := lower(btrim(coalesce(p_email, '')));
  IF v_email = '' THEN RETURN FALSE; END IF;

  -- Só a primeira compra carimba. Recompra não reescreve a data, senão o
  -- tempo entre virar lead e virar cliente deixa de ser mensurável.
  UPDATE marketing.lead
     SET convertido_em = now()
   WHERE lower(email) = v_email AND convertido_em IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END $$;

ALTER FUNCTION marketing.marcar_conversao(TEXT) OWNER TO marketing_owner;
REVOKE ALL ON FUNCTION marketing.marcar_conversao(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing.marcar_conversao(TEXT) TO app_web;

-- Papel da tela.
DO $$ BEGIN
  CREATE ROLE satelite_comercial WITH LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT rds_iam TO satelite_comercial;
GRANT CONNECT ON DATABASE clinico TO satelite_comercial;
GRANT USAGE ON SCHEMA marketing TO satelite_comercial;

GRANT SELECT ON marketing.lead        TO satelite_comercial;
GRANT SELECT ON marketing.origem      TO satelite_comercial;
GRANT SELECT (lead_id) ON marketing.consentimento TO satelite_comercial;
GRANT SELECT (email)   ON marketing.supressao     TO satelite_comercial;

-- Tabela nova em marketing não nasce visível para a tela.
ALTER DEFAULT PRIVILEGES IN SCHEMA marketing REVOKE ALL ON TABLES FROM satelite_comercial;
