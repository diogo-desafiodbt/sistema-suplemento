\set ON_ERROR_STOP on
\pset pager off

-- DELETE nas tabelas de CONTROLE de duplicidade, e só nelas.
--
-- O mecanismo que impede aviso repetido precisa remover reserva travada: se o
-- processo morre no meio, a reserva fica presa e o próximo evento nunca passa.
-- A remoção é o caminho de recuperação — e sem permissão ele falhava com
-- "permission denied", derrubando a operação inteira.
--
-- O pior é quando isso morde: só depois de um travamento, que é exatamente
-- quando a recuperação precisa funcionar.
--
-- Estas duas guardam identificador de pedido e carimbo de hora, nada de
-- cliente. Ficam de FORA de propósito: `webhook_logs`,
-- `prescription_audit_logs` e `pharmacy_api_logs`, que são auditoria e não
-- podem ser apagáveis, e `support_messages`, que guarda o que o cliente
-- escreveu — lá o conserto foi no código, não na permissão.

GRANT DELETE ON public.purchase_confirmation_logs   TO app_web;
GRANT DELETE ON public.pharmacy_order_dispatch_logs TO app_web;

\echo '=== controle pode apagar; auditoria e mensagem de cliente, não ==='
SELECT t AS tabela, has_table_privilege('app_web','public.'||t,'DELETE') AS pode_apagar
  FROM unnest(ARRAY['purchase_confirmation_logs','pharmacy_order_dispatch_logs',
                    'shipping_notification_logs','protocol_creation_locks',
                    'support_messages','webhook_logs','prescription_audit_logs',
                    'pharmacy_api_logs']) AS t;
