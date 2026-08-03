-- Adiciona purchase_confirmed ao enum notification_type.
-- Em arquivo separado: ADD VALUE não pode ser usado na mesma transação
-- em que o valor novo é referenciado.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'purchase_confirmed';
