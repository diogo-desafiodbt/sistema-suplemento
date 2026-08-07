-- O enum plan_type no banco só tinha 1mes/3meses/1ano (nunca foi criado via
-- migration rastreada — provavelmente criado direto no dashboard). A
-- reestruturação de compliance introduziu o plano '6meses' na aplicação sem
-- essa migration, e 'assinatura_mensal' já era referenciado no código como
-- plano legado mas nunca existiu de fato no enum (só não deu erro porque
-- nenhuma subscription com esse plano chegou a ser inserida ainda).
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS '6meses';
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'assinatura_mensal';
