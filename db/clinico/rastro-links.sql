-- Catálogo de apelidos de origem.
--
-- Não guarda dado de pessoa: é uma lista de rótulos e para onde cada um
-- aponta. Existe porque o apelido é digitado à mão na descrição do vídeo, e
-- apelido digitado à mão vira "yt-aula7", "yt_aula_7" e "ytaula7" — três
-- origens no relatório para o mesmo vídeo. A tela lê daqui e monta o endereço
-- pronto para copiar.
--
-- Não existe encurtador nem subdomínio: o endereço é a própria página com
-- `?o=apelido`. Um serviço só para contar clique e mandar para o mesmo lugar
-- seria mais uma peça, mais um custo e mais uma coisa para cair.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rastro_links (
  apelido    text        PRIMARY KEY
             CHECK (apelido ~ '^[a-z0-9][a-z0-9.-]{0,59}$'),
  destino    text        NOT NULL,
  descricao  text,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rastro_links IS
  'Apelidos de origem e seus destinos. Sem dado pessoal.';
COMMENT ON COLUMN public.rastro_links.apelido IS
  'Minúsculas, número, ponto e hífen. É o que vai em ?o= e o que aparece no relatório.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastro_links TO app_web;

COMMIT;
