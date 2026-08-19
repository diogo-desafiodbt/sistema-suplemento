-- VIGIA — pergunta se o cliente está sendo prejudicado agora.
--
-- Não checa "o job está saudável?", checa o resultado no negócio. Em 19/08 a
-- camada assíncrona ficou dias parada sem gerar um único erro; nenhuma checagem
-- de saúde de job teria visto. Estas viram.
--
-- Imprime SÓ o que é novo. O que persiste fica registrado em `alertas` e não
-- grita de novo. O que some é fechado sozinho.

BEGIN;

CREATE TEMP TABLE achados (digital text, tipo text, detalhe jsonb) ON COMMIT DROP;

-- 1) pagamento pago sem pedido
INSERT INTO achados
SELECT 'pagamento-sem-pedido:' || p.id, 'pagamento-sem-pedido',
       jsonb_build_object('email', u.email, 'valor', p.amount,
         'minutos', round(extract(epoch FROM (now() - p.paid_at))/60))
FROM payments p
JOIN subscriptions s ON s.id = p.subscription_id
JOIN users u         ON u.id = s.user_id
LEFT JOIN orders o   ON o.subscription_id = s.id
WHERE p.status = 'paid' AND p.paid_at < now() - interval '10 minutes'
  AND o.id IS NULL;

-- 2) prescrição assinada sem despacho para a farmácia
INSERT INTO achados
SELECT 'assinada-sem-despacho:' || pr.id, 'assinada-sem-despacho',
       jsonb_build_object('email', u.email,
         'minutos', round(extract(epoch FROM (now() - pr.signed_at))/60))
FROM protocols pr
JOIN users u         ON u.id = pr.user_id
JOIN subscriptions s ON s.id = pr.creation_subscription_id
JOIN orders o        ON o.subscription_id = s.id
WHERE pr.status = 'signed' AND pr.signed_at < now() - interval '15 minutes'
  AND o.pharmacy_sent_at IS NULL;

-- 3) job por horário atrasado (job_type é ENUM: o cast é obrigatório)
INSERT INTO achados
WITH esperado(job_type, limite) AS (VALUES
  ('rfm_recalc'::job_type,              interval '2 hours'),
  ('hotmart_sales_sync'::job_type,      interval '26 hours'),
  ('omie_financeiro_sync'::job_type,    interval '26 hours'),
  ('youtube_analytics_sync'::job_type,  interval '26 hours'),
  ('pharmacy_reconciliation'::job_type, interval '26 hours')
)
SELECT 'job-atrasado:' || e.job_type, 'job-atrasado',
       jsonb_build_object('job', e.job_type,
         'horas', round(extract(epoch FROM (now() - max(b.started_at)))/3600, 1))
FROM esperado e
LEFT JOIN background_jobs b ON b.job_type = e.job_type
GROUP BY e.job_type, e.limite
HAVING max(b.started_at) IS NULL OR max(b.started_at) < now() - e.limite;

-- 4) job cuja última execução falhou
INSERT INTO achados
SELECT 'job-falhou:' || job_type || ':' || started_at, 'job-falhou',
       jsonb_build_object('job', job_type, 'status', status, 'quando', started_at)
FROM (SELECT DISTINCT ON (job_type) job_type, status, started_at
      FROM background_jobs ORDER BY job_type, started_at DESC) t
WHERE status <> 'completed';

-- 5) cliente de suporte sem resposta
INSERT INTO achados
SELECT 'suporte-sem-resposta:' || t.id, 'suporte-sem-resposta',
       jsonb_build_object('email', t.from_email, 'situacao', t.status,
         'horas', round(extract(epoch FROM (now() - t.last_message_at))/3600, 1))
FROM support_threads t
WHERE t.status <> 'respondido' AND t.last_message_at < now() - interval '24 hours';

-- 6) assinatura ativa com validade vencida
INSERT INTO achados
SELECT 'assinatura-vencida:' || s.id, 'assinatura-vencida',
       jsonb_build_object('email', u.email, 'venceu_em', s.expires_at)
FROM subscriptions s JOIN users u ON u.id = s.user_id
WHERE s.status = 'active' AND s.expires_at < now();

-- ---------------------------------------------------------------------------
-- Contabilidade
-- ---------------------------------------------------------------------------

-- some da lista = problema acabou
UPDATE alertas a SET resolvido_em = now()
 WHERE a.resolvido_em IS NULL
   AND NOT EXISTS (SELECT 1 FROM achados x WHERE x.digital = a.digital);

-- já conhecido = só atualiza o carimbo, não notifica de novo
UPDATE alertas a SET ultima_vez_em = now(), detalhe = x.detalhe
  FROM achados x
 WHERE a.digital = x.digital AND a.resolvido_em IS NULL;

-- novo = entra para notificar
INSERT INTO alertas (digital, tipo, detalhe)
SELECT x.digital, x.tipo, x.detalhe FROM achados x
 WHERE NOT EXISTS (
   SELECT 1 FROM alertas a WHERE a.digital = x.digital AND a.resolvido_em IS NULL
 );

\echo '=== NOVOS (viram alarme) ==='
SELECT 'ALERTA ' || tipo AS alerta, detalhe
  FROM alertas WHERE notificado_em IS NULL AND resolvido_em IS NULL
 ORDER BY tipo;

UPDATE alertas SET notificado_em = now()
 WHERE notificado_em IS NULL AND resolvido_em IS NULL;

\echo ''
\echo '=== abertos, ja notificados (nao gritam de novo) ==='
SELECT tipo, count(*) FROM alertas
 WHERE resolvido_em IS NULL AND notificado_em IS NOT NULL
 GROUP BY tipo ORDER BY tipo;

\echo ''
\echo '=== resolvidos nesta execucao ==='
SELECT tipo, count(*) FROM alertas
 WHERE resolvido_em > now() - interval '1 minute' GROUP BY tipo;

COMMIT;
