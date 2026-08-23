\set ON_ERROR_STOP on
\pset pager off

-- No primeiro login o sistema PRECISA criar o perfil, e nesse momento ainda
-- não existe nome: ele chega depois, pelo quiz ou pelo checkout.
--
-- Até hoje `garantirPerfil` tirava o nome de `user_metadata` do Supabase — que
-- às vezes vinha vazio, e o INSERT falhava com "null value in column full_name
-- violates not-null constraint". Estava no log da entrada em 21/08.
--
-- A Fase 8 tira o Supabase do caminho, e o Cognito também não guarda esse
-- campo. Então a coluna passa a dizer a verdade: no começo não se sabe o nome.
--
-- O código já vive com isso: 31 lugares tratam full_name como possivelmente
-- nulo. Só cinco tipos de TypeScript assumiam o contrário, e todos sobre
-- junções que já podiam devolver nada.
ALTER TABLE public.users ALTER COLUMN full_name DROP NOT NULL;

\echo '=== como ficou ==='
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name = 'users' AND column_name IN ('full_name','email');

\echo ''
\echo '=== e agora o primeiro login funciona? (com ROLLBACK) ==='
BEGIN;
SET LOCAL ROLE app_web;
INSERT INTO users (id, email, full_name, client_code)
VALUES (gen_random_uuid(), 'primeiro-login@exemplo.com', NULL,
        'DD-' || lpad(nextval('public.client_code_seq')::text, 6, '0'))
ON CONFLICT (id) DO NOTHING;
SELECT email, full_name IS NULL AS sem_nome FROM users WHERE email = 'primeiro-login@exemplo.com';
ROLLBACK;
