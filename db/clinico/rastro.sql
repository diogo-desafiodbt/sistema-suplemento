-- Rastro do Cliente — as duas tabelas de Zona 1.
--
-- Ficam dentro do núcleo, no `clinico`, por decisão escrita em
-- `docs/arquitetura/rastro-zona-1.md`: ligar comportamento a pessoa é dado
-- pessoal, e o conjunto "clicou em vídeo sobre diabetes e comprou" permite
-- inferência sobre saúde mesmo com nome de etapa neutro. A proteção não é o
-- dado ser inofensivo; é ele estar atrás das mesmas camadas do prontuário.
--
-- O redirecionador de links e o catálogo dele NÃO estão aqui. São Zona 2, num
-- serviço separado, e não conhecem pessoa.
--
-- O vocabulário de etapa é neutro por regra: o nome não pode revelar o
-- conteúdo da decisão. `quiz_eligible` do funil antigo vira
-- `triagem_concluida` — que a triagem aconteceu é fato de navegação; que ela
-- deu apto é leitura clínica, e essa continua só no núcleo, na tabela certa.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rastro_ligacoes (
  anonimo_id  text        PRIMARY KEY,
  pessoa_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ligado_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rastro_ligacoes IS
  'Costura: este navegador é esta pessoa. Escrita no login, por quem já conhece users.';

-- Uma pessoa tem vários navegadores (celular, desktop, o do trabalho). O
-- caminho contrário é que não pode: um navegador não vira duas pessoas.
CREATE INDEX IF NOT EXISTS idx_rastro_ligacoes_pessoa
  ON public.rastro_ligacoes (pessoa_id);

CREATE TABLE IF NOT EXISTS public.rastro_eventos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  anonimo_id  text        NOT NULL,
  -- Nulo até o login. Depois dele o evento nasce já com dono; os anteriores
  -- são alcançados pela ligação, sem reescrever histórico.
  pessoa_id   uuid        REFERENCES public.users(id) ON DELETE CASCADE,
  evento      text        NOT NULL,
  -- Apelido do link que trouxe a pessoa, quando houve um. Texto livre de
  -- propósito: quem cria o apelido é a tela de links, não uma migração.
  origem      text,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rastro_eventos IS
  'Passos da jornada. Vocabulário neutro: o nome da etapa não revela o conteúdo da decisão.';

-- A consulta que a tela do fluxo faz: a jornada de um navegador em ordem.
CREATE INDEX IF NOT EXISTS idx_rastro_eventos_anonimo
  ON public.rastro_eventos (anonimo_id, ocorrido_em);

-- A consulta da fila de contato: quem parou, e há quanto tempo.
CREATE INDEX IF NOT EXISTS idx_rastro_eventos_etapa
  ON public.rastro_eventos (evento, ocorrido_em DESC);

-- A da ficha do cliente: tudo que esta pessoa fez.
CREATE INDEX IF NOT EXISTS idx_rastro_eventos_pessoa
  ON public.rastro_eventos (pessoa_id, ocorrido_em DESC)
  WHERE pessoa_id IS NOT NULL;

-- Grants à mão, como manda a decisão de 15/08 de não usar RLS por titular.
-- `app_web` escreve (é ele quem atende o clique e o login) e lê (é ele quem
-- desenha o fluxo no admin). Nenhum satélite entra aqui: pela decisão de
-- Zona 1, a tela do fluxo e a fila são telas do núcleo.
GRANT SELECT, INSERT ON public.rastro_eventos  TO app_web;
GRANT SELECT, INSERT ON public.rastro_ligacoes TO app_web;

-- A exclusão do titular tem que alcançar o Rastro. O ON DELETE CASCADE acima
-- resolve quando a linha de `users` some; este DELETE cobre o caso de apagar
-- o rastro sem apagar a pessoa.
GRANT DELETE ON public.rastro_eventos  TO app_web;
GRANT DELETE ON public.rastro_ligacoes TO app_web;

COMMIT;

-- A costura no login precisa dar dono aos eventos que ficaram sem. É a única
-- escrita de UPDATE que o Rastro tem, e ela é só nesta coluna: um grant de
-- tabela inteira deixaria reescrever a etapa e o horário depois do fato, que é
-- exatamente o que um registro de jornada não pode permitir.
GRANT UPDATE (pessoa_id) ON public.rastro_eventos TO app_web;
