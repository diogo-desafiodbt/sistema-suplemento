-- Sync financeiro Omie (contas liquidadas → fluxo de caixa / DRE).
-- Só armazenamento/relatório — sem side-effects no app.

CREATE TABLE public.omie_categorias (
  codigo text PRIMARY KEY,
  descricao text,
  descricao_padrao text,
  categoria_superior text,
  codigo_dre text,
  conta_receita boolean,
  conta_despesa boolean,
  totalizadora boolean,
  conta_inativa boolean,
  tipo_categoria text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.omie_categorias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.omie_categorias TO service_role;

CREATE TABLE public.omie_movimentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_titulo bigint NOT NULL UNIQUE,
  codigo_titulo_repeticao bigint,
  grupo text NOT NULL,
  natureza text,
  categoria_codigo text,
  projeto_codigo bigint,
  cliente_fornecedor_codigo bigint,
  cliente_cpf_cnpj text,
  conta_corrente_codigo bigint,
  numero_parcela text,
  origem text,
  tipo text,
  status text,
  data_emissao date,
  data_vencimento date,
  data_previsao date,
  data_registro date,
  data_pagamento date,
  valor_titulo numeric,
  liquidado boolean,
  valor_pago numeric,
  valor_liquido numeric,
  valor_aberto numeric,
  desconto numeric,
  juros numeric,
  multa numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX omie_mov_data_pagamento_idx
  ON public.omie_movimentos_financeiros (data_pagamento);
CREATE INDEX omie_mov_categoria_idx
  ON public.omie_movimentos_financeiros (categoria_codigo);
CREATE INDEX omie_mov_grupo_idx
  ON public.omie_movimentos_financeiros (grupo);

ALTER TABLE public.omie_movimentos_financeiros ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.omie_movimentos_financeiros TO service_role;

CREATE VIEW public.omie_fluxo_caixa AS
SELECT
  date_trunc('month', data_pagamento)::date AS mes,
  conta_corrente_codigo,
  natureza,
  sum(valor_pago) AS total
FROM public.omie_movimentos_financeiros
WHERE liquidado = true
GROUP BY 1, 2, 3
ORDER BY 1;

CREATE VIEW public.omie_dre AS
SELECT
  date_trunc('month', m.data_pagamento)::date AS mes,
  c.codigo AS categoria_codigo,
  c.descricao AS categoria_descricao,
  c.conta_receita,
  c.conta_despesa,
  sum(m.valor_liquido) AS total
FROM public.omie_movimentos_financeiros m
LEFT JOIN public.omie_categorias c ON c.codigo = m.categoria_codigo
WHERE m.liquidado = true
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1;

GRANT SELECT ON public.omie_fluxo_caixa TO service_role;
GRANT SELECT ON public.omie_dre TO service_role;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE 'omie_financeiro_sync';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
  WHEN duplicate_object THEN
    NULL;
END $$;
