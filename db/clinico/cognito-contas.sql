\set ON_ERROR_STOP on
\pset pager off
BEGIN;

-- Liga cada conta do Cognito ao perfil que já existe. `users.id` não muda:
-- é ela que está em pedidos, assinaturas e protocolos.
UPDATE users SET cognito_sub = '34288458-7061-70aa-adfb-069980b0abb1' WHERE email = 'diogo@desafiodiabetes.com';
UPDATE users SET cognito_sub = 'f4185468-3081-7080-96a5-aad699c50c68' WHERE email = 'contato@desafiodiabetes.com';

-- turionline@gmail.com é conta nova, a pedido do Diogo em 23/08.
INSERT INTO users (id, email, full_name, role, client_code, cognito_sub)
VALUES (gen_random_uuid(), 'turionline@gmail.com', 'Dr. Turí Souza', 'admin',
        'DD-' || lpad(nextval('public.client_code_seq')::text, 6, '0'),
        '24888498-40e1-70f4-2a25-498d8574d53e')
ON CONFLICT (email) DO UPDATE SET cognito_sub = EXCLUDED.cognito_sub, role = 'admin';

-- admin@ e suporte@ ficam para trás: caixas sem dono conhecido, e conta de
-- ADMINISTRADOR sem dono é porta aberta para quem controlar o e-mail. Não
-- apago — rebaixo e deixo sem ponte para o Cognito.
UPDATE users SET role = 'patient', cognito_sub = NULL
 WHERE email IN ('admin@desafiodiabetes.com','suporte@desafiodiabetes.com');

\echo '=== como ficou ==='
SELECT email, role, client_code, cognito_sub IS NOT NULL AS entra_pelo_cognito
  FROM users ORDER BY role, email;
COMMIT;
