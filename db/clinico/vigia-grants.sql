-- Papel do vigia: pergunta, não age.
--
-- O vigia rodava como `postgres` (tarefa db-admin), que pode tudo. Poder demais
-- para quem só precisa perguntar: se o SQL tiver defeito, ele roda de hora em
-- hora, sozinho, contra o banco clínico inteiro.
--
-- Aqui ele ganha identidade própria, no mesmo princípio das zonas: credencial
-- por serviço, com o alcance mínimo. Se o SQL errar, o pior que acontece é
-- escrever besteira em `alertas`.

-- Sem senha nesta migração de propósito: a senha é definida à parte e guardada
-- no Secrets Manager. Nada de credencial em arquivo versionado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vigia') THEN
    CREATE ROLE vigia LOGIN;
  END IF;
END
$$;

GRANT CONNECT  ON DATABASE clinico TO vigia;
GRANT TEMPORARY ON DATABASE clinico TO vigia;   -- a tabela temporária dos achados
GRANT USAGE    ON SCHEMA public   TO vigia;

-- ---------------------------------------------------------------------------
-- Leitura: só as sete tabelas que as perguntas usam.
-- NÃO recebe quiz_responses, health_records, protocol_items, prescription_audit_logs
-- nem nada com conteúdo clínico. O vigia não precisa saber o que a pessoa tem.
-- ---------------------------------------------------------------------------
GRANT SELECT ON
  payments, subscriptions, users, orders,
  protocols, support_threads, background_jobs
TO vigia;

-- De `users` e `protocols` ele lê pouco, mas o privilégio por coluna
-- complicaria a manutenção sem ganho real: são e-mail, nome e status, dados
-- que ele já precisa imprimir no alerta.

-- ---------------------------------------------------------------------------
-- Escrita: uma tabela só, a dele.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON alertas TO vigia;

-- Sem DELETE em lugar nenhum, nem em `alertas`: alerta resolvido é marcado
-- com `resolvido_em`, nunca apagado. O histórico é a prova de que o vigia
-- estava acordado.

-- Explicitamente negado por omissão: tudo o mais. Sem GRANT ALL, sem
-- ALL TABLES IN SCHEMA. Tabela nova nasce invisível para o vigia — e isso é
-- proposital: quem acrescentar pergunta nova concede o SELECT junto.
