-- A busca do acervo, numa função — para a ferramenta ser uma chamada só e a
-- regra de ranqueamento viver aqui, versionada, e não espalhada no código.
--
-- O QUE ESTAVA ERRADO: `plainto_tsquery` liga os termos com E. "metformina dá
-- efeito colateral" exigia as quatro palavras no MESMO trecho de 45 segundos,
-- e voltava vazio — apesar de existirem duas aulas inteiras sobre metformina.
-- Cliente não escreve palavra-chave, escreve frase; exigir todas é garantir
-- que a maioria não ache nada.
--
-- Aqui os termos entram com OU e o ranqueamento decide. Recall alto, precisão
-- pela nota.
--
-- A NOTA NÃO PROTEGE CONTRA PERGUNTA FORA DO ACERVO. Medido em 24/08/2026:
--
--   "quando meu pedido chega"          0,295
--   "metformina dá efeito colateral"   0,274
--
-- Uma pergunta de logística pontua MAIS que uma pergunta clínica de verdade.
-- Não existe limiar que corte uma e mantenha a outra — o acervo fala de comida
-- e rotina o tempo todo, então quase tudo encontra eco.
--
-- Portanto: quem protege é a CATEGORIA, não o número. Esta função só deve ser
-- chamada quando a triagem disser `tecnico`. O limiar serve apenas para cortar
-- o que não tem eco nenhum ("meu cartão foi recusado" dá 0,000).
CREATE OR REPLACE FUNCTION public.buscar_aula(pergunta text, minimo real DEFAULT 0.15)
RETURNS TABLE (titulo text, url text, inicio_seg integer, nota real)
LANGUAGE sql STABLE AS $$
  WITH termos AS (
    -- to_tsvector já tira pontuação e palavra vazia; só religo com OU.
    SELECT array_to_string(
             tsvector_to_array(to_tsvector('portuguese', pergunta)), ' | '
           ) AS q
  )
  SELECT t.titulo, t.url, t.inicio_seg,
         ts_rank(t.busca, to_tsquery('portuguese', termos.q)) AS nota
    FROM aulas_trecho t, termos
   WHERE termos.q <> ''
     AND t.url IS NOT NULL          -- trecho sem link não serve para apontar
     AND t.busca @@ to_tsquery('portuguese', termos.q)
     AND ts_rank(t.busca, to_tsquery('portuguese', termos.q)) >= minimo
   ORDER BY nota DESC
   LIMIT 3;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_aula(text, real) TO job_conteudo;
