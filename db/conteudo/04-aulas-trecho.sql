-- Trechos das transcrições do canal, com o momento exato.
--
-- Cada linha da transcrição traz o segundo e o link direto, então o trecho
-- aponta o instante — `?t=272` — em vez do vídeo inteiro. É a diferença entre
-- "essa aula fala sobre isso" e "ele fala sobre isso aos 4:32".
--
-- Busca por texto em português, não por vetor. Motivo: o acervo é pequeno e
-- muito temático, não exige serviço externo de embedding, não custa nada e
-- reindexar é de graça. Se a busca se mostrar fraca durante o período de
-- observação, dá para acrescentar vetor DEPOIS sem mudar a ferramenta —
-- ela devolve título, link e segundo de qualquer forma.
CREATE TABLE IF NOT EXISTS public.aulas_trecho (
  id         bigserial PRIMARY KEY,
  tipo       text NOT NULL,          -- aula | podcast | receita
  titulo     text NOT NULL,
  url        text,                   -- nulo enquanto o link não for confirmado
  inicio_seg integer NOT NULL,
  texto      text NOT NULL,
  busca      tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', texto)) STORED
);

CREATE INDEX IF NOT EXISTS aulas_trecho_busca_idx ON public.aulas_trecho USING gin (busca);
CREATE INDEX IF NOT EXISTS aulas_trecho_titulo_idx ON public.aulas_trecho (titulo);

GRANT SELECT ON public.aulas_trecho TO job_conteudo;
