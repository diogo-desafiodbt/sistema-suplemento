\set ON_ERROR_STOP on
\pset pager off

-- Julgamento do Pedro sobre cada sugestão da IA.
--
-- É o modo sombra com sinal limpo: em vez de eu comparar textos depois e
-- adivinhar se ele "mandou mais ou menos o mesmo", ele diz na hora se a
-- sugestão servia. Quando a taxa de acerto subir, esse é o número que
-- justifica ligar o envio automático.
--
-- Guarda os dois textos porque a informação está na DIFERENÇA entre eles.
-- Saber que ele aprovou mexendo numa frase vale mais que saber que aprovou:
-- ler quais frases ele troca é o que aponta o que corrigir na IA.

CREATE TABLE IF NOT EXISTS public.sugestao_veredito (
  id            bigserial   PRIMARY KEY,
  thread_id     uuid        NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  veredito      text        NOT NULL CHECK (veredito IN ('aprovada','rejeitada')),
  sugestao      text        NOT NULL,
  enviado       text,
  -- 0 = idêntico, 1 = nada a ver. Calculado no servidor, sem clique a mais.
  distancia     real,
  -- Segundos entre abrir a conversa e decidir. Aprovação em 3 segundos não
  -- é leitura; é carimbo. Sem isto, a taxa de acerto engana.
  segundos      integer,
  categoria     text,
  origem        text,
  decidido_por  uuid,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sugestao_veredito_quando
  ON public.sugestao_veredito (criado_em DESC);

-- Insere e lê; não altera nem apaga. Julgamento que pode ser reescrito não
-- serve para decidir nada.
REVOKE ALL ON public.sugestao_veredito FROM app_web;
GRANT SELECT, INSERT ON public.sugestao_veredito TO app_web;
GRANT USAGE, SELECT ON SEQUENCE public.sugestao_veredito_id_seq TO app_web;

\echo '=== insere e le, nao altera nem apaga ==='
SELECT has_table_privilege('app_web','public.sugestao_veredito','SELECT') AS le,
       has_table_privilege('app_web','public.sugestao_veredito','INSERT') AS insere,
       has_table_privilege('app_web','public.sugestao_veredito','UPDATE') AS altera,
       has_table_privilege('app_web','public.sugestao_veredito','DELETE') AS apaga;
