-- O título estava fora da busca, e isso derrubava o caso óbvio.
--
-- "metformina dá efeito colateral" não achava nada — sendo que existe uma
-- "Aula 11 - 10 ERROS COMUNS AO TOMAR METFORMINA". O trecho de 45 segundos
-- pode não repetir a palavra que dá nome à aula inteira; quem carrega o
-- assunto é o título.
--
-- Peso A no título e B no texto: o título decide o empate, o texto localiza o
-- momento.
ALTER TABLE public.aulas_trecho DROP COLUMN IF EXISTS busca;
ALTER TABLE public.aulas_trecho
  ADD COLUMN busca tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(texto,  '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS aulas_trecho_busca_idx ON public.aulas_trecho USING gin (busca);
