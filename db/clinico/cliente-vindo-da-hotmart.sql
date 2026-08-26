\set ON_ERROR_STOP on
\pset pager off

-- Permite ao sistema criar cliente a partir de uma compra da Hotmart.
--
-- Quem compra o guia hoje entra só na tabela de vendas da Hotmart, e não
-- existe como cliente. Isso deixa o suporte cego para ele e a aba de clientes
-- vazia. A sincronização passa a criar a pessoa.
--
-- INSERT em QUATRO COLUNAS, não na tabela. Fora da lista ficam `cpf` e
-- `role`: uma venda não pode criar administrador, e não pode gravar CPF sem
-- passar pelo caminho que valida. O papel vem do padrão da coluna, que é
-- paciente.

GRANT INSERT (id, email, full_name, client_code) ON public.users TO app_web;
GRANT USAGE, SELECT ON SEQUENCE public.client_code_seq TO app_web;

\echo '=== pode criar cliente, e nao pode escolher papel nem CPF ==='
SELECT
  has_column_privilege('app_web','public.users','email','INSERT')       AS email,
  has_column_privilege('app_web','public.users','full_name','INSERT')   AS nome,
  has_column_privilege('app_web','public.users','client_code','INSERT') AS codigo,
  has_column_privilege('app_web','public.users','role','INSERT')        AS papel,
  has_column_privilege('app_web','public.users','cpf','INSERT')         AS cpf;
