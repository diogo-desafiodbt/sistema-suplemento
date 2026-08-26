\set ON_ERROR_STOP on
\pset pager off

-- A ficha do cliente passa a mostrar a compra do guia, e procura por e-mail em
-- minúsculas — a mesma chave que a consolidação usa. Sem este índice a consulta
-- varre a tabela inteira a cada ficha aberta.
--
-- Funcional em lower(buyer_email) porque é assim que a consulta compara; um
-- índice na coluna crua não seria usado.

CREATE INDEX IF NOT EXISTS hotmart_sales_buyer_email_idx
    ON public.hotmart_sales (lower(buyer_email));

\echo '=== o indice novo precisa aparecer aqui ==='
SELECT indexname FROM pg_indexes
 WHERE tablename = 'hotmart_sales' AND indexname = 'hotmart_sales_buyer_email_idx';
