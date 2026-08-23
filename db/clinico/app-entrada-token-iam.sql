-- app_entrada era o ÚLTIMO usuário de banco com senha. app_web e job_conteudo
-- já entravam por token de 15 minutos gerado na hora; ele ficou para trás
-- porque a Fase 4 corria, e virou dívida declarada.
--
-- Senha em segredo é senha que existe: quem alcançar o Secrets Manager entra.
-- Token IAM não existe até ser pedido, e só o papel da tarefa consegue pedir.
GRANT rds_iam TO app_entrada;
ALTER ROLE app_entrada WITH PASSWORD NULL;

-- Falta o outro lado, que não é SQL:
--   1. ecsTaskRoleSistema precisa de rds-db:connect para app_entrada
--   2. sistema/DATABASE_URL_ENTRADA perde a senha da URL
-- Sem os dois, o contêiner sobe e falha com "PAM authentication failed" — erro
-- que NÃO distingue credencial inválida de permissão ausente.
