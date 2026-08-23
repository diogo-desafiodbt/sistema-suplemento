-- Papel do satélite de ajustes (Zona 2) — cupons e configuração.
--
-- É o primeiro satélite que ESCREVE, e por isso o alcance é apertado aqui, não
-- só no formulário. Formulário é conveniência; privilégio é o que sobra quando
-- alguém contorna o formulário.
--
--   sem DELETE em lugar nenhum
--       cupom que não vale mais se desativa, não some. Apagar cupom apaga o
--       rastro de um desconto que já foi usado.
--
--   system_config sem INSERT
--       mudar valor de chave existente é operação normal. CRIAR chave é mudar
--       como o sistema funciona — e as 27 de hoje incluem o endereço de quem
--       despacha e as medidas das caixas. Isso não é trabalho de satélite.
--
-- Entra por token IAM, como os outros. Nenhum segredo de banco na função.

CREATE ROLE satelite_ajustes WITH LOGIN;
GRANT rds_iam TO satelite_ajustes;

GRANT CONNECT ON DATABASE clinico TO satelite_ajustes;
GRANT USAGE   ON SCHEMA public    TO satelite_ajustes;

GRANT SELECT, INSERT, UPDATE ON public.discount_coupons TO satelite_ajustes;
GRANT SELECT, UPDATE         ON public.system_config    TO satelite_ajustes;

-- discount_coupons.id é gerado por sequência? Se for, precisa da sequência.
-- Descoberto na marra no app_entrada: INSERT sem USAGE na sequência falha com
-- "permission denied for sequence", e o erro não menciona a tabela.
DO $$
DECLARE s text;
BEGIN
  SELECT pg_get_serial_sequence('public.discount_coupons','id') INTO s;
  IF s IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SEQUENCE %s TO satelite_ajustes', s);
  END IF;
END
$$;

-- Tabela nova não nasce visível para ele.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM satelite_ajustes;
