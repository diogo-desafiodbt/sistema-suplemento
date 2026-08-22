-- Papel do primeiro satélite (Zona 2).
--
-- Enxerga UMA tabela. Não é o `vigia`: aquele lê 8, porque precisa cruzar
-- pagamentos, pedidos e protocolos para DETECTAR problema. Este só MOSTRA o
-- que já foi detectado — e mostrar exige muito menos do que descobrir.
--
-- Reusar o `vigia` teria sido mais rápido e daria ao satélite acesso a
-- `users`, `payments`, `orders` e `protocols` sem nenhum motivo.
--
-- Sem senha: entra por token IAM, como `app_web`. Não existe segredo de banco
-- para vazar da função.

CREATE ROLE satelite_alertas WITH LOGIN;
GRANT rds_iam TO satelite_alertas;

-- Precisa poder chegar ao schema antes de ler qualquer coisa dele.
GRANT CONNECT ON DATABASE clinico TO satelite_alertas;
GRANT USAGE   ON SCHEMA public    TO satelite_alertas;

-- A única tabela. E só leitura: quem escreve em `alertas` é o vigia.
GRANT SELECT ON public.alertas TO satelite_alertas;

-- Nada de futuro por padrão: tabela nova não nasce visível para ele.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM satelite_alertas;
