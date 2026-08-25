\set ON_ERROR_STOP on
\pset pager off

-- Histórico de desenvolvimento: a linha do tempo do que foi construído.
--
-- Não guarda NENHUM dado de cliente. É o satélite mais isolado do sistema, e
-- por isso ganha papel próprio com acesso a uma tabela só: se um dia essa
-- tela for comprometida, o que vaza é o assunto dos nossos commits.
--
-- A parte retroativa (antes de 12/08/2026) veio do git local e da API de
-- deployments do GitHub, porque a Vercel registrou lá cada publicação. Daqui
-- pra frente a fonte é a AWS.

CREATE TABLE IF NOT EXISTS public.dev_evento (
  id          bigserial PRIMARY KEY,
  tipo        text        NOT NULL CHECK (tipo IN ('commit','deploy','build','config')),
  fonte       text        NOT NULL CHECK (fonte IN ('git','github','codebuild','ecs')),
  projeto     text        NOT NULL,
  quando      timestamptz NOT NULL,
  titulo      text,
  ref         text,
  autor       text,
  ambiente    text,
  status      text,
  arquivos    integer,
  inseridas   integer,
  removidas   integer,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- A carga é idempotente: rodar de novo não duplica. `ref` sozinho não serve
-- como chave porque um mesmo commit pode ter sido publicado várias vezes.
CREATE UNIQUE INDEX IF NOT EXISTS dev_evento_unico
  ON public.dev_evento (tipo, projeto, coalesce(ref,''), quando);

CREATE INDEX IF NOT EXISTS dev_evento_quando ON public.dev_evento (quando DESC);

-- Revoga amplo, concede estreito — como no resto do sistema.
REVOKE ALL ON public.dev_evento FROM app_web;
GRANT SELECT ON public.dev_evento TO app_web;
GRANT USAGE, SELECT ON SEQUENCE public.dev_evento_id_seq TO app_web;

\echo '=== a tela só lê? ==='
SELECT has_table_privilege('app_web','public.dev_evento','SELECT') AS le,
       has_table_privilege('app_web','public.dev_evento','INSERT') AS insere,
       has_table_privilege('app_web','public.dev_evento','UPDATE') AS altera,
       has_table_privilege('app_web','public.dev_evento','DELETE') AS apaga;
