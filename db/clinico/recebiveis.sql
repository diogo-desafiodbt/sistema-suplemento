-- Agenda de recebíveis do Pagar.me.
--
-- Responde a pergunta que o financeiro não tinha como responder: de uma venda
-- aprovada hoje, quanto entra na conta e em que dia. Pix cai num prazo,
-- crédito à vista noutro, parcelado vira uma linha por parcela — e cada linha
-- tem taxa própria, então o valor que entra nunca é o valor da venda.
--
-- Uma linha por recebível do Pagar.me, com o id deles como chave. Reler a
-- agenda atualiza a linha em vez de criar outra, e é assim que a mudança de
-- "previsto" para "pago" chega sem duplicar nada.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pagarme_recebiveis (
  id                bigint      PRIMARY KEY,
  charge_id         text        NOT NULL,
  payment_id        uuid        REFERENCES public.payments(id) ON DELETE SET NULL,
  parcela           int,
  -- Em centavos, como o Pagar.me devolve. Converter na gravação esconderia
  -- arredondamento onde ele é justamente o que a conciliação persegue.
  valor_bruto       bigint      NOT NULL,
  taxa              bigint      NOT NULL DEFAULT 0,
  taxa_antecipacao  bigint      NOT NULL DEFAULT 0,
  tipo              text,
  meio_pagamento    text,
  status            text        NOT NULL,
  previsto_para     date,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
) ;

COMMENT ON TABLE public.pagarme_recebiveis IS
  'Agenda de recebíveis por cobrança. Valores em centavos, como o Pagar.me devolve.';
COMMENT ON COLUMN public.pagarme_recebiveis.status IS
  'waiting_funds enquanto previsto; paid quando caiu na conta.';

CREATE INDEX IF NOT EXISTS idx_recebiveis_charge
  ON public.pagarme_recebiveis (charge_id);

-- A consulta do financeiro: o que ainda vai cair, em ordem de data.
CREATE INDEX IF NOT EXISTS idx_recebiveis_previsao
  ON public.pagarme_recebiveis (previsto_para)
  WHERE status <> 'paid';

GRANT SELECT, INSERT, UPDATE ON public.pagarme_recebiveis TO app_web;

COMMIT;
