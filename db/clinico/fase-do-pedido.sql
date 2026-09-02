-- Em que fase cada pedido está, calculado dos fatos.
--
-- A alternativa era uma coluna de status escrita à mão. Já temos a prova de
-- que ela descola: o enum tem `sent_to_pharmacy`, um estado que o sistema
-- deixou de usar, e o botão de gerar etiqueta ficou preso a ele — invisível
-- por semanas sem ninguém perceber, até 02/09/2026.
--
-- Calculado dos fatos que já existem, não pode desalinhar, vale para os
-- pedidos antigos sem migração, e ganha a fase da nota fiscal mexendo num
-- lugar só quando o faturamento entrar.

BEGIN;

CREATE OR REPLACE VIEW public.pedido_fase AS
SELECT
  o.id                                          AS pedido_id,
  o.user_id,
  o.created_at,
  o.total_amount,
  o.tracking_code,

  CASE
    WHEN o.status = 'failed'                       THEN 'cancelado'
    WHEN o.status = 'delivered'                    THEN 'entregue'
    WHEN o.tracking_code IS NOT NULL               THEN 'a_caminho'
    WHEN pu.puxado_em IS NOT NULL                  THEN 'buscado_nao_despachado'
    WHEN p.status = 'signed'
     AND p.prescription_pdf_path IS NOT NULL
     AND o.shipping_label_url IS NOT NULL          THEN 'pronto_nao_buscado'
    WHEN p.status = 'signed'                       THEN 'aguardando_etiqueta'
    ELSE 'aguardando_assinatura'
  END AS fase,

  -- Desde quando ele está parado NESTA fase. É este número que denuncia o
  -- problema; a fase sozinha não diz nada. Cada uma usa o carimbo mais
  -- honesto que existe, e cai no nascimento do pedido quando não há outro.
  CASE
    WHEN o.status IN ('failed', 'delivered')       THEN o.updated_at
    WHEN o.tracking_code IS NOT NULL               THEN COALESCE(o.pharmacy_sent_at, o.updated_at)
    WHEN pu.puxado_em IS NOT NULL                  THEN pu.puxado_em
    WHEN p.status = 'signed'                       THEN COALESCE(p.signed_at, o.created_at)
    ELSE COALESCE(pg.paid_at, o.created_at)
  END AS na_fase_desde

FROM public.orders o
-- LEFT, não INNER. Pedido sem assinatura não deveria existir, e o INNER o
-- fazia sumir da visão inteira — some do painel e some do vigia justamente o
-- pedido anômalo, que é o que mais precisa ser visto.
LEFT JOIN public.subscriptions s ON s.id = o.subscription_id
LEFT JOIN public.protocols p ON p.id = s.protocol_id
LEFT JOIN LATERAL (
  SELECT max(paid_at) AS paid_at
  FROM public.payments
  WHERE subscription_id = s.id AND status = 'paid'
) pg ON true
-- Quando a farmácia puxou este pedido. O registro guarda a lista de ids
-- devolvidos em cada chamada dela; achar o pedido ali é a única prova de que
-- ele chegou do outro lado.
LEFT JOIN LATERAL (
  SELECT min(l.called_at) AS puxado_em
  FROM public.pharmacy_api_logs l
  WHERE l.order_ids_returned @> to_jsonb(o.id::text)
) pu ON true;

COMMENT ON VIEW public.pedido_fase IS
  'Fase de cada pedido, calculada dos fatos. Não há coluna de fase — de propósito.';

GRANT SELECT ON public.pedido_fase TO app_web, satelite_pedidos, vigia;

COMMIT;
