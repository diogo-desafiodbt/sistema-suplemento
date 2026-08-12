-- Sync YouTube Analytics — dashboard de performance do canal.
-- Só armazenamento/relatório — sem side-effects no app.

CREATE TABLE public.youtube_videos (
  video_id text PRIMARY KEY,
  titulo text,
  descricao text,
  published_at timestamptz,
  duracao text,
  thumbnail_url text,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX youtube_videos_published_at_idx
  ON public.youtube_videos (published_at DESC);

ALTER TABLE public.youtube_videos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_videos TO service_role;

CREATE TABLE public.youtube_canal_diario (
  dia date PRIMARY KEY,
  views bigint,
  minutos_assistidos bigint,
  duracao_media_segundos integer,
  percentual_medio_assistido numeric,
  inscritos_ganhos integer,
  inscritos_perdidos integer,
  likes integer,
  dislikes integer,
  comentarios integer,
  compartilhamentos integer,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_canal_diario ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_canal_diario TO service_role;

CREATE TABLE public.youtube_video_diario (
  video_id text NOT NULL,
  dia date NOT NULL,
  views bigint,
  minutos_assistidos bigint,
  duracao_media_segundos integer,
  percentual_medio_assistido numeric,
  inscritos_ganhos integer,
  inscritos_perdidos integer,
  likes integer,
  comentarios integer,
  compartilhamentos integer,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, dia)
);

CREATE INDEX youtube_video_diario_dia_idx
  ON public.youtube_video_diario (dia);

ALTER TABLE public.youtube_video_diario ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_video_diario TO service_role;

CREATE TABLE public.youtube_video_snapshot (
  video_id text NOT NULL,
  dia date NOT NULL,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, dia)
);

CREATE INDEX youtube_video_snapshot_dia_idx
  ON public.youtube_video_snapshot (dia);

ALTER TABLE public.youtube_video_snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_video_snapshot TO service_role;

CREATE VIEW public.youtube_video_views_diarias AS
SELECT
  video_id,
  dia,
  view_count,
  view_count - lag(view_count) OVER (
    PARTITION BY video_id ORDER BY dia
  ) AS views_no_dia
FROM public.youtube_video_snapshot;

GRANT SELECT ON public.youtube_video_views_diarias TO service_role;

CREATE TABLE public.youtube_trafego_diario (
  dia date NOT NULL,
  fonte text NOT NULL,
  views bigint,
  minutos_assistidos bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, fonte)
);

ALTER TABLE public.youtube_trafego_diario ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_trafego_diario TO service_role;

CREATE TABLE public.youtube_retencao (
  video_id text NOT NULL,
  ponto numeric NOT NULL,
  audiencia_ratio numeric,
  retencao_relativa numeric,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, ponto, periodo_fim)
);

ALTER TABLE public.youtube_retencao ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_retencao TO service_role;

CREATE TABLE public.youtube_demografia (
  mes date NOT NULL,
  faixa_etaria text NOT NULL,
  genero text NOT NULL,
  percentual numeric,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, faixa_etaria, genero)
);

ALTER TABLE public.youtube_demografia ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_demografia TO service_role;

CREATE TABLE public.youtube_geografia (
  mes date NOT NULL,
  pais text NOT NULL,
  views bigint,
  minutos_assistidos bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, pais)
);

ALTER TABLE public.youtube_geografia ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_geografia TO service_role;

CREATE TABLE public.youtube_termos_busca (
  mes date NOT NULL,
  termo text NOT NULL,
  views bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, termo)
);

ALTER TABLE public.youtube_termos_busca ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_termos_busca TO service_role;

CREATE TABLE public.youtube_audiencia_recortes (
  mes date NOT NULL,
  tipo text NOT NULL,
  valor text NOT NULL,
  views bigint,
  minutos_assistidos bigint,
  compartilhamentos bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, tipo, valor)
);

ALTER TABLE public.youtube_audiencia_recortes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.youtube_audiencia_recortes TO service_role;

DO $$
BEGIN
  ALTER TYPE public.job_type ADD VALUE 'youtube_analytics_sync';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'enum public.job_type não encontrado';
  WHEN duplicate_object THEN
    NULL;
END $$;
