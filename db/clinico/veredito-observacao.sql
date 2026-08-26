\set ON_ERROR_STOP on
\pset pager off

-- O que estava errado na sugestão, nas palavras do Pedro.
--
-- O texto que ele envia mostra O QUE era certo. A observação mostra POR QUÊ
-- a sugestão errou — e é a segunda que ensina. Sem ela, daqui a três semanas
-- teríamos duzentos pares de textos e ninguém saberia dizer o padrão do erro.
--
-- Nasceu do caso da Vera em 26/08/2026: a IA leu uma tabela vazia como se
-- fosse falha de acesso e escreveu para a cliente que a empresa tinha
-- confirmado um problema que não existe. Ler os dois textos lado a lado não
-- explicaria isso; uma linha do Pedro explicaria.

ALTER TABLE public.sugestao_veredito
  ADD COLUMN IF NOT EXISTS observacao text;

\echo '=== coluna criada ==='
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name='sugestao_veredito' AND column_name='observacao';
