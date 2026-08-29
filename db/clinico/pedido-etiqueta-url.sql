-- URL do PDF da etiqueta, guardada no pedido.
--
-- A etiqueta passa a ser emitida logo após a compra (27/08/2026): a Envie
-- Agora configurou o atraso de D+2 do lado deles, então o sistema não precisa
-- mais dormir dois dias para produzir a data de retirada.
--
-- Guardar a URL evita chamar `/pdfetiqueta` a cada leitura da API da farmácia,
-- que devolve vários pedidos por requisição. Se vier vazia, a leitura busca na
-- hora e grava — a coluna é cache, não fonte de verdade.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;

GRANT SELECT (shipping_label_url), UPDATE (shipping_label_url)
  ON public.orders TO app_web;
