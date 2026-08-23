-- De qual conta Hotmart veio cada venda.
--
-- São DUAS contas vendendo o MESMO guia, com ids de produto diferentes
-- (a antiga e a 7700976, cadastrada em 23/08/2026). Sem esta coluna você vê o
-- total do "Primeiro Passo" e não consegue dizer quanto veio de cada uma — nem
-- perceber se uma delas parou de sincronizar.
--
-- Uso o próprio id do produto como origem: já vem em cada venda, não depende
-- de rótulo que alguém precise lembrar de preencher, e não tem como divergir
-- do dado.
ALTER TABLE public.hotmart_sales
  ADD COLUMN IF NOT EXISTS conta_product_id bigint;

-- As linhas que já existem são todas da conta antiga.
UPDATE public.hotmart_sales SET conta_product_id = product_id
 WHERE conta_product_id IS NULL;

CREATE INDEX IF NOT EXISTS hotmart_sales_conta_idx
  ON public.hotmart_sales (conta_product_id);

-- job_conteudo já tem SELECT/INSERT/UPDATE na tabela inteira, então a coluna
-- nova entra coberta. Conferido depois, não suposto.
