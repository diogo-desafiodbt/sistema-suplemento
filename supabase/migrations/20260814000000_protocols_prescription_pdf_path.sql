-- Caminho do objeto no bucket prescricoes. A URL assinada passa a ser
-- gerada na entrega (pull / admin), não na assinatura.
ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS prescription_pdf_path text;

-- Extrai o caminho do objeto a partir da URL assinada já gravada.
--
-- O filtro por 'storage/v1/object' não é decoração: a única linha com URL neste
-- banco veio de um sistema anterior e aponta para storage.desafiodiabetes.com,
-- domínio que nem resolve mais. Sem o filtro, o backfill grava um caminho que
-- não existe no bucket — dado que parece certo e não abre nada.
UPDATE public.protocols
SET prescription_pdf_path = NULLIF(
  split_part(split_part(prescription_pdf_url, '/prescricoes/', 2), '?', 1),
  ''
)
WHERE prescription_pdf_url IS NOT NULL
  AND prescription_pdf_url <> ''
  AND prescription_pdf_url LIKE '%/storage/v1/object/%'
  AND prescription_pdf_path IS NULL;
