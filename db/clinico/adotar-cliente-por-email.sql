\set ON_ERROR_STOP on
\pset pager off

-- Permite ao sistema ADOTAR um cliente que já existe, no primeiro login.
--
-- Quem comprou o guia pela Hotmart existe como cliente sem conta de acesso.
-- Quando essa pessoa cria conta, o sistema precisa preencher o código de
-- login na linha que já existe, em vez de criar uma segunda pessoa.
--
-- Concede UPDATE em DUAS COLUNAS, não na tabela. `users` guarda CPF, e um
-- GRANT de tabela inteira daria à aplicação o direito de reescrever o CPF de
-- qualquer cliente para atender a um login. A permissão tem que ser do
-- tamanho da tarefa.

GRANT UPDATE (cognito_sub, full_name) ON public.users TO app_web;

\echo '=== pode atualizar as duas, e nada além ==='
SELECT
  has_column_privilege('app_web','public.users','cognito_sub','UPDATE') AS login,
  has_column_privilege('app_web','public.users','full_name','UPDATE')   AS nome,
  has_column_privilege('app_web','public.users','cpf','UPDATE')         AS cpf,
  has_column_privilege('app_web','public.users','email','UPDATE')       AS email,
  has_table_privilege('app_web','public.users','DELETE')                AS apaga;
