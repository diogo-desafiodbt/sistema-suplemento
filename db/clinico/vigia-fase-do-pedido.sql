-- Vigia: a regra de etiqueta por pedido vira contagem por fase.
--
-- Ver o comentário do bloco "Pedido travado numa fase" dentro da função.

CREATE OR REPLACE FUNCTION public.vigia_rodar()
RETURNS TABLE(alerta text, detalhe jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $vigia$
BEGIN
  -- VIGIA — pergunta se o cliente está sendo prejudicado agora.
  --
  -- Não checa "o job está saudável?", checa o resultado no negócio. Em 19/08 a
  -- camada assíncrona ficou dias parada sem gerar um único erro; nenhuma checagem
  -- de saúde de job teria visto. Estas viram.
  --
  -- Imprime SÓ o que é novo. O que persiste fica registrado em `alertas` e não
  -- grita de novo. O que some é fechado sozinho.
  CREATE TEMP TABLE IF NOT EXISTS achados (digital text, tipo text, detalhe jsonb);
    DELETE FROM achados;
  -- 1) pagamento pago sem pedido
  INSERT INTO achados
  SELECT 'pagamento-sem-pedido:' || p.id, 'pagamento-sem-pedido',
         jsonb_build_object('cliente', u.client_code, 'valor', p.amount,
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
         jsonb_build_object('cliente', u.client_code,
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
    -- youtube_analytics_sync saiu em 23/08/2026: o job foi desligado a pedido
    -- do Diogo. Cobrar cron que ninguém agendou acende alerta todo dia, e
    -- alerta que dispara à toa é alerta que se aprende a ignorar.
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
  --
  -- Só `failed`. NÃO alertar sobre `running`: três funções dormem de propósito —
  -- create-shipping-label espera D+2 úteis da compra, avulso-renewal-reminder
  -- espera D-5/D-1/D+3 da renovação, payment-retry espera entre tentativas.
  -- Ficar em `running` por dias é o trabalho acontecendo, não parando.
  --
  -- A primeira versão tratava `running` como falha e disparou sobre comportamento
  -- normal em 20/08. Alarme que grita sobre o que é correto é o que faz alguém
  -- desligar o alarme.
  --
  -- Cobertura do caso oposto — job que morre no meio e fica preso em `running`
  -- para sempre — vem da pergunta 6, que olha se ALGUM job rodou; e de `running`
  -- com mais de 30 dias, que nenhum sleepUntil daqui alcança.
  INSERT INTO achados
  SELECT 'job-falhou:' || job_type || ':' || started_at, 'job-falhou',
         jsonb_build_object('job', job_type, 'status', status, 'quando', started_at)
  FROM (SELECT DISTINCT ON (job_type) job_type, status, started_at
        FROM background_jobs ORDER BY job_type, started_at DESC) t
  WHERE status = 'failed';
  -- 4b) job preso: `running` velho demais para ser sono legítimo.
  -- O sleepUntil mais longo do sistema é D+3 de uma renovação; 30 dias é folga
  -- larga o bastante para não confundir sono com morte.
  INSERT INTO achados
  SELECT 'job-preso:' || job_type || ':' || started_at, 'job-preso',
         jsonb_build_object('job', job_type, 'desde', started_at,
           'dias', round(extract(epoch FROM (now() - started_at))/86400))
  FROM background_jobs
  WHERE status = 'running' AND started_at < now() - interval '30 days';
  -- 5) cliente de suporte sem resposta
  INSERT INTO achados
  SELECT 'suporte-sem-resposta:' || t.id, 'suporte-sem-resposta',
         jsonb_build_object('conversa', t.id, 'situacao', t.status,
           'horas', round(extract(epoch FROM (now() - t.last_message_at))/3600, 1))
  FROM support_threads t
  -- `encerrada` entrou junto com os cinco estados novos e é terminal. Sem ela
  -- aqui, toda conversa fechada volta a gritar 24h depois, para sempre — e
  -- alarme que dispara sobre o que está certo é o que faz alguém desligar o
  -- alarme.
  WHERE t.status NOT IN ('respondido', 'encerrada')
    AND t.last_message_at < now() - interval '24 hours';
  -- 6) A CAMADA ASSINCRONA PAROU
  -- Não pergunta por um job específico: pergunta se ALGUM job rodou. Se nenhum
  -- rodou em 20 minutos, o Inngest não está chamando o app — foi o que aconteceu
  -- duas vezes em 19/08, sem gerar um único erro, e nas duas o sintoma foi
  -- silêncio. Cobre a causa que eu ainda não sei explicar.
  -- O poll de suporte roda de 5 em 5 minutos, então 20 é folga de 4 ciclos.
  INSERT INTO achados
  SELECT 'inngest-parado:' || to_char(date_trunc('hour', now()), 'YYYY-MM-DD-HH24'),
         'inngest-parado',
         jsonb_build_object(
           'ultima_execucao', max(started_at),
           'minutos', round(extract(epoch FROM (now() - max(started_at)))/60))
  FROM background_jobs
  HAVING max(started_at) IS NULL OR max(started_at) < now() - interval '20 minutes';
  -- 7) assinatura ativa com validade vencida
  INSERT INTO achados
  SELECT 'assinatura-vencida:' || s.id, 'assinatura-vencida',
         jsonb_build_object('cliente', u.client_code, 'venceu_em', s.expires_at)
  FROM subscriptions s JOIN users u ON u.id = s.user_id
  WHERE s.status = 'active' AND s.expires_at < now();
  -- 8) JOB QUE SE DECLAROU CONCLUÍDO SEM TER FEITO O TRABALHO
  -- Em 24/08 o poll de suporte rodou de 5 em 5 minutos por DIAS sem ler um
  -- único e-mail: faltava uma das quatro credenciais, o código desistia no
  -- começo, e a saída registrava `completed`. Painel verde, vigia quieto,
  -- e-mail de cliente parado. No mesmo dia apareceram mais três caminhos de
  -- fuga iguais.
  --
  -- A lição: `completed` deixou de ser prova de trabalho feito. Quando o job
  -- registra por que desistiu, isso vira alerta.
  --
  -- Só a ÚLTIMA execução de cada job: pulou uma vez e se recuperou não é
  -- problema; pulando agora é.
  INSERT INTO achados
  SELECT 'job-pulou:' || job_type || ':' || to_char(started_at, 'YYYY-MM-DD'),
         'job-pulou',
         jsonb_build_object('job', job_type, 'quando', started_at,
           'motivo', coalesce(payload->>'skipped',
                              CASE WHEN payload->>'triagem_falhou' = 'true'
                                   THEN 'triagem_falhou' END))
  FROM (SELECT DISTINCT ON (job_type) job_type, status, started_at, payload
        FROM background_jobs ORDER BY job_type, started_at DESC) t
  WHERE status = 'completed'
    AND (payload->>'skipped' IS NOT NULL OR payload->>'triagem_falhou' = 'true');
  -- 9) assinatura paga que ficou sem protocolo
  -- A criação do protocolo é disparada pelo evento `pagamento/confirmado`. Se
  -- o evento se perder, ninguém percebe: o cliente pagou e não tem protocolo,
  -- logo não tem pedido, logo não recebe. Existia uma rota de varredura para
  -- isso, mas ela nasceu sem credencial e respondeu 401 a vida inteira — foi
  -- apagada em 24/08/2026. A varredura vira esta pergunta.
  INSERT INTO achados
  SELECT 'assinatura-sem-protocolo:' || s.id, 'assinatura-sem-protocolo',
         jsonb_build_object('assinatura', s.id, 'cliente', u.client_code,
           'pago_em', min(p.paid_at))
  FROM subscriptions s
  JOIN users u ON u.id = s.user_id
  JOIN payments p ON p.subscription_id = s.id AND p.status = 'paid'
  WHERE s.protocol_id IS NULL
    AND p.paid_at < now() - interval '30 minutes'
  GROUP BY s.id, u.client_code;
  -- 10) pedido sem etiqueta
  -- A etiqueta passou a ser emitida logo depois que o pedido é gravado
  -- (27/08/2026), disparada pelo evento `pedido/criado`. Antes, a função
  -- ---------------------------------------------------------------------------
  -- Pedido travado numa fase
  -- ---------------------------------------------------------------------------
  -- Substituiu `pedido-sem-etiqueta` em 02/09/2026. Aquela regra cobrava a
  -- etiqueta de todo pedido, e desde que a emissão saiu do nosso fluxo ela
  -- acusava o normal como se fosse defeito — quatro alertas abertos que não
  -- queriam dizer nada.
  --
  -- Um alerta por FASE, não por pedido. Numa segunda-feira com trinta pedidos
  -- parados na assinatura, trinta alertas fazem ninguém ler nenhum; uma linha
  -- com a contagem mostra o tamanho do problema e leva para a lista.
  --
  -- Os prazos: assinatura 24h e farmácia 24h/48h são fila humana. Etiqueta 2h
  -- é automático, então demora ali é falha, não fila. Objeto sem movimento por
  -- 3 dias é encomenda extraviada — prazo escolhido pelo Diogo em 02/09/2026,
  -- para o aviso chegar antes do cliente reclamar.
  INSERT INTO achados
  SELECT 'pedidos-travados:' || f.fase,
         'pedidos-travados',
         jsonb_build_object(
           'fase', f.fase,
           'pedidos', count(*),
           'mais_antigo_horas',
             round(extract(epoch FROM (now() - min(f.na_fase_desde))) / 3600))
  FROM pedido_fase f
  WHERE f.fase NOT IN ('entregue', 'cancelado')
    AND f.na_fase_desde < now() - CASE f.fase
          WHEN 'aguardando_assinatura'    THEN interval '24 hours'
          WHEN 'aguardando_etiqueta'      THEN interval '2 hours'
          WHEN 'pronto_nao_buscado'       THEN interval '24 hours'
          WHEN 'buscado_nao_despachado'   THEN interval '48 hours'
          WHEN 'a_caminho'                THEN interval '3 days'
          ELSE interval '100 years'
        END
  GROUP BY f.fase;

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
  -- A ordem aqui é o que faz o vigia falar.
  --
  -- Existia um `UPDATE alertas SET notificado_em = now()` ANTES do RETURN
  -- QUERY abaixo, que filtra justamente por `notificado_em IS NULL`. O
  -- resultado era sempre vazio: cada alerta nascia já marcado como avisado, e
  -- o job de hora em hora imprimia nada desde sempre. Os alertas continuavam
  -- na tabela, então a tela do admin mostrava — mas ninguém era avisado fora
  -- dela. Corrigido em 27/08/2026.
  --
  -- Marcar depois de retornar é o que garante que cada alerta apareça uma vez
  -- e só uma: enquanto o problema persistir, ele fica na tabela sem gritar de
  -- novo; quando sumir, é fechado sozinho lá em cima.
  RETURN QUERY
  SELECT 'ALERTA ' || a.tipo, a.detalhe
    FROM alertas a
   WHERE a.notificado_em IS NULL AND a.resolvido_em IS NULL
   ORDER BY a.tipo;
  UPDATE alertas SET notificado_em = now()
   WHERE notificado_em IS NULL AND resolvido_em IS NULL;
END

$vigia$;

-- Os alertas da regra antiga não têm mais correspondente e ficariam abertos
-- para sempre: o vigia só fecha o que ele mesmo deixa de encontrar.
UPDATE public.alertas SET resolvido_em = now()
 WHERE tipo = 'pedido-sem-etiqueta' AND resolvido_em IS NULL;
