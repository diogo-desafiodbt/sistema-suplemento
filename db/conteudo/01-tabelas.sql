-- As 13 tabelas de conteúdo, no banco `conteudo` do RDS.
--
-- Estrutura copiada da Supabase em 23/08/2026, onde elas vivem hoje. Nada de
-- clínico aqui: são vendas do guia digital (Hotmart), financeiro (Omie) e
-- métricas do canal (YouTube). Foi por isso que a Fase 1 do plano foi
-- cancelada — a separação vem da saída do clínico, não de um projeto novo.
--
-- O dado NÃO precisa ser migrado: é todo re-sincronizável da origem. Os jobs
-- rodam de novo e reconstroem. São 91.838 linhas que não valem uma janela de
-- migração.

CREATE TABLE IF NOT EXISTS public.hotmart_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_code text NOT NULL UNIQUE,
  product_id bigint NOT NULL,
  product_name text, buyer_name text, buyer_email text, buyer_ucode text,
  status text NOT NULL,
  order_date timestamptz, approved_date timestamptz,
  price_value numeric, price_currency text, payment_method text,
  is_subscription boolean, recurrency_number integer, commission_as text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hotmart_sales_order_date_idx ON public.hotmart_sales (order_date);
CREATE INDEX IF NOT EXISTS hotmart_sales_status_idx     ON public.hotmart_sales (status);

CREATE TABLE IF NOT EXISTS public.omie_categorias (
  codigo text PRIMARY KEY,
  descricao text, descricao_padrao text, categoria_superior text, codigo_dre text,
  conta_receita boolean, conta_despesa boolean, totalizadora boolean,
  conta_inativa boolean, tipo_categoria text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omie_movimentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_titulo bigint NOT NULL UNIQUE,
  codigo_titulo_repeticao bigint,
  grupo text NOT NULL, natureza text, categoria_codigo text,
  projeto_codigo bigint, cliente_fornecedor_codigo bigint, cliente_cpf_cnpj text,
  conta_corrente_codigo bigint, numero_parcela text, origem text, tipo text, status text,
  data_emissao date, data_vencimento date, data_previsao date,
  data_registro date, data_pagamento date,
  valor_titulo numeric, liquidado boolean, valor_pago numeric, valor_liquido numeric,
  valor_aberto numeric, desconto numeric, juros numeric, multa numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omie_mov_categoria_idx      ON public.omie_movimentos_financeiros (categoria_codigo);
CREATE INDEX IF NOT EXISTS omie_mov_data_pagamento_idx ON public.omie_movimentos_financeiros (data_pagamento);
CREATE INDEX IF NOT EXISTS omie_mov_grupo_idx          ON public.omie_movimentos_financeiros (grupo);

CREATE TABLE IF NOT EXISTS public.youtube_videos (
  video_id text PRIMARY KEY,
  titulo text, descricao text, published_at timestamptz, duracao text, thumbnail_url text,
  view_count bigint, like_count bigint, comment_count bigint,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS youtube_videos_published_at_idx ON public.youtube_videos (published_at DESC);

CREATE TABLE IF NOT EXISTS public.youtube_canal_diario (
  dia date PRIMARY KEY,
  views bigint, minutos_assistidos bigint, duracao_media_segundos integer,
  percentual_medio_assistido numeric, inscritos_ganhos integer, inscritos_perdidos integer,
  likes integer, dislikes integer, comentarios integer, compartilhamentos integer,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_video_diario (
  video_id text NOT NULL, dia date NOT NULL,
  views bigint, minutos_assistidos bigint, duracao_media_segundos integer,
  percentual_medio_assistido numeric, inscritos_ganhos integer, inscritos_perdidos integer,
  likes integer, comentarios integer, compartilhamentos integer,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, dia)
);
CREATE INDEX IF NOT EXISTS youtube_video_diario_dia_idx ON public.youtube_video_diario (dia);

CREATE TABLE IF NOT EXISTS public.youtube_video_snapshot (
  video_id text NOT NULL, dia date NOT NULL,
  view_count bigint, like_count bigint, comment_count bigint,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, dia)
);
CREATE INDEX IF NOT EXISTS youtube_video_snapshot_dia_idx ON public.youtube_video_snapshot (dia);

CREATE TABLE IF NOT EXISTS public.youtube_retencao (
  video_id text NOT NULL, ponto numeric NOT NULL,
  audiencia_ratio numeric, retencao_relativa numeric,
  periodo_inicio date NOT NULL, periodo_fim date NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, ponto, periodo_fim)
);

CREATE TABLE IF NOT EXISTS public.youtube_demografia (
  mes date NOT NULL, faixa_etaria text NOT NULL, genero text NOT NULL,
  percentual numeric, synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, faixa_etaria, genero)
);

CREATE TABLE IF NOT EXISTS public.youtube_geografia (
  mes date NOT NULL, pais text NOT NULL,
  views bigint, minutos_assistidos bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, pais)
);

CREATE TABLE IF NOT EXISTS public.youtube_trafego_diario (
  dia date NOT NULL, fonte text NOT NULL,
  views bigint, minutos_assistidos bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, fonte)
);

CREATE TABLE IF NOT EXISTS public.youtube_termos_busca (
  mes date NOT NULL, termo text NOT NULL,
  views bigint, synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, termo)
);

CREATE TABLE IF NOT EXISTS public.youtube_audiencia_recortes (
  mes date NOT NULL, tipo text NOT NULL, valor text NOT NULL,
  views bigint, minutos_assistidos bigint, compartilhamentos bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, tipo, valor)
);
