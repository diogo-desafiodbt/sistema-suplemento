\set ON_ERROR_STOP on
\pset pager off

-- O controle de duplicidade do aviso de envio precisa apagar reserva travada.
--
-- `shipping_notification_logs` é tabela de controle: guarda que um aviso já
-- foi disparado, para o mesmo evento não gerar dois e-mails. Quando o processo
-- morre no meio, a reserva fica presa — e o mecanismo a remove depois de dois
-- minutos para que o próximo evento consiga passar.
--
-- Sem DELETE, esse caminho falhava com "permission denied", e a falha subia
-- até derrubar o webhook inteiro com 500. Achado em 26/08/2026 testando o
-- rastreio com o payload real da Envie Agora.
--
-- Não guarda dado de cliente: só identificador do pedido, do evento e
-- carimbos de hora.

GRANT DELETE ON public.shipping_notification_logs TO app_web;

\echo '=== agora o controle consegue liberar reserva travada ==='
SELECT has_table_privilege('app_web','public.shipping_notification_logs','SELECT') AS le,
       has_table_privilege('app_web','public.shipping_notification_logs','INSERT') AS insere,
       has_table_privilege('app_web','public.shipping_notification_logs','UPDATE') AS altera,
       has_table_privilege('app_web','public.shipping_notification_logs','DELETE') AS apaga;
