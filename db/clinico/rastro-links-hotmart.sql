-- O destino do link agora pode ser o checkout da Hotmart, além de um caminho
-- interno.
--
-- Por quê: o guia é vendido lá fora, e o parâmetro de origem que a Hotmart
-- entende é `src`, não o nosso `o`. Se os apelidos vivessem em duas listas
-- separadas, a mesma aula viraria "yt-aula-07" de um lado e "ytaula7" do
-- outro, e o relatório mostraria duas origens para um vídeo só.
--
-- A restrição de host é a mesma de antes por outro caminho: caminho interno
-- começando com barra, ou o checkout da Hotmart. Nada além disso — apelido
-- apontando para host arbitrário transforma o construtor num redirecionador
-- aberto com o nosso domínio na frente.

BEGIN;

ALTER TABLE public.rastro_links
  DROP CONSTRAINT IF EXISTS rastro_links_destino_conhecido;

ALTER TABLE public.rastro_links
  ADD CONSTRAINT rastro_links_destino_conhecido CHECK (
    destino LIKE '/%'
    OR destino LIKE 'https://pay.hotmart.com/%'
  );

COMMENT ON COLUMN public.rastro_links.destino IS
  'Caminho interno (/...) ou checkout da Hotmart. O parâmetro sai ?o= no primeiro caso e ?src= no segundo.';

COMMIT;
