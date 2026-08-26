\set ON_ERROR_STOP on
\pset pager off

-- O aviso de envio ao cliente virou job do Inngest, e todo job registra início
-- e fim em `background_jobs.job_type`, que é enum.
--
-- Sem estes dois valores o INSERT falha. `registrarInicio` engole o erro e
-- devolve id vazio, então o e-mail sai e o job simplesmente não existe para o
-- vigia — a falha some justamente no lugar que existe para não deixar falha
-- sumir.

ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'shipping_etiqueta_gerada';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'shipping_rastreio_atualizado';

\echo '=== os dois valores novos precisam aparecer no fim da lista ==='
SELECT string_agg(enumlabel, ' | ' ORDER BY enumsortorder)
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'job_type';
