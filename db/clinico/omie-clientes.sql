-- Ligação entre o cliente daqui e o cadastro dele no Omie.
--
-- Tabela à parte em vez de coluna em `users`: é dado de integração, não do
-- cliente. Se a integração com o Omie um dia sair, some esta tabela e o
-- cadastro do paciente continua intacto — e enquanto ela existe, os grants
-- dela são só dela.
--
-- A chave que amarra os dois lados é o nosso próprio id: o Omie aceita um
-- "código de integração" escolhido por quem chama, e usar o id do usuário faz
-- a inclusão ser idempotente sem precisar consultar antes. Guardamos o código
-- deles mesmo assim, porque o pedido e a nota fiscal vão pedi-lo depois.

BEGIN;

CREATE TABLE IF NOT EXISTS public.omie_clientes (
  user_id            uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  codigo_cliente     bigint      NOT NULL,
  sincronizado_em    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.omie_clientes IS
  'user_id daqui ↔ codigo_cliente_omie lá. Escrita pelo job que sincroniza a venda.';

CREATE UNIQUE INDEX IF NOT EXISTS omie_clientes_codigo
  ON public.omie_clientes (codigo_cliente);

GRANT SELECT, INSERT, UPDATE ON public.omie_clientes TO app_web;

COMMIT;
