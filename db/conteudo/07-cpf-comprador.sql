\set ON_ERROR_STOP on
\pset pager off

-- CPF do comprador da Hotmart.
--
-- O Diogo passou a exigir o CPF no checkout em 25/08/2026. O dado chega junto
-- com a venda e cai em `raw_payload`, mas lá dentro ninguém consulta. Esta
-- coluna existe para tirá-lo de lá.
--
-- Vale só para quem comprar A PARTIR de agora: as 1.066 compras que já estão
-- no banco não têm CPF, e a Hotmart não guarda o que não pediu. Elas seguem
-- casando por e-mail e pelo identificador do comprador.

ALTER TABLE public.hotmart_sales
  ADD COLUMN IF NOT EXISTS buyer_document text;

-- Só dígitos, para casar com o CPF do sistema sem esbarrar em ponto e traço.
CREATE INDEX IF NOT EXISTS hotmart_sales_documento
  ON public.hotmart_sales (buyer_document)
  WHERE buyer_document IS NOT NULL;

\echo '=== a coluna existe e está vazia, como esperado ==='
SELECT count(*) AS compras,
       count(buyer_document) AS com_cpf
  FROM public.hotmart_sales;
