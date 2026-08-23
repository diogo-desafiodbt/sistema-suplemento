-- Papel do satélite de pedidos (Zona 2) — a LISTA, não os botões.
--
-- Primeiro papel com privilégio POR COLUNA. É a diferença que dispensa uma API
-- de contrato aqui: a lista precisa de nome, e-mail e código do cliente, que
-- moram na mesma tabela do CPF e da data de nascimento.
--
-- Contrato serve quando a fronteira é a LINHA — "este pedido é seu, aquele
-- não" — porque isso nenhum privilégio expressa. Quando a fronteira é COLUNA,
-- o Postgres já responde, e é uma peça a menos para manter.

CREATE ROLE satelite_pedidos WITH LOGIN;
GRANT rds_iam TO satelite_pedidos;

GRANT CONNECT ON DATABASE clinico TO satelite_pedidos;
GRANT USAGE   ON SCHEMA public    TO satelite_pedidos;

-- `orders`: os campos operacionais da lista. Nada de pharmacy_json nem de
-- shipping_json, que carregam o pacote inteiro do parceiro — endereço,
-- documento, itens.
GRANT SELECT (id, status, created_at, tracking_code, total_amount,
              shipping_request_id, user_id, subscription_id)
  ON public.orders TO satelite_pedidos;

-- `users`: TRÊS colunas e o id. `cpf` e `birth_date` não existem para ele.
GRANT SELECT (id, full_name, email, client_code)
  ON public.users TO satelite_pedidos;

-- Nada mais: sem addresses, sem protocol_items, sem payments, sem escrita em
-- lugar nenhum. Quem grava são os botões, e eles ficaram no núcleo.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM satelite_pedidos;
