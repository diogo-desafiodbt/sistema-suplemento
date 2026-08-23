-- Papel dos jobs de conteúdo.
--
-- Vive no banco `conteudo` e NÃO existe no `clinico`. É a separação que a
-- Fase 1 do plano queria e que a saída do clínico para o RDS entregou: quem
-- sincroniza Hotmart, Omie e YouTube não tem como alcançar prontuário, nem por
-- engano nem por consulta mal escrita — não há credencial que atravesse.
--
-- Token IAM, como os outros. Sem senha.

CREATE ROLE job_conteudo WITH LOGIN;
GRANT rds_iam TO job_conteudo;

GRANT CONNECT ON DATABASE conteudo TO job_conteudo;
GRANT USAGE   ON SCHEMA public     TO job_conteudo;

-- Escreve nas 13 e lê de volta. Sem DELETE: sincronização que apaga esconde
-- erro de origem — se a API devolver menos do que devia, o certo é notar a
-- diferença, não sumir com o histórico.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO job_conteudo;

-- Tabela nova de conteúdo nasce acessível para ele; é o banco dele.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO job_conteudo;
