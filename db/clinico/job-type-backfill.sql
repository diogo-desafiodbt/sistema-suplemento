-- `job_type` é ENUM. Registrar execução com valor inexistente falha — e como
-- `registrarFim` engole o erro de propósito (telemetria não pode derrubar o
-- job), a falha seria SILENCIOSA: o backfill rodaria e o vigia nunca veria.
--
-- Terceira vez que o enum morde neste projeto. As duas primeiras foram o 42883
-- de agosto e o VALUES sem ::job_type no vigia.
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'hotmart_backfill';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'omie_backfill';
