-- Adiciona valores ao enum diagnosis_type.
-- Em arquivo separado: ADD VALUE não pode ser usado na mesma transação
-- em que o valor novo é referenciado (Parte 1.2).

ALTER TYPE diagnosis_type ADD VALUE IF NOT EXISTS 'type1';
ALTER TYPE diagnosis_type ADD VALUE IF NOT EXISTS 'lada_avancado';
