# Prompt para o Cursor — Sync do YouTube Analytics (dashboard de performance do canal)

Objetivo: abastecer o banco com o analytics privado do canal **Dr. Turí
Souza - Especialista em Diabetes** (`UC7RP2TGiFUPDv5yZ8QqfEHw`) pra montar
um dashboard de performance. Só armazenamento/relatório — sem efeito
colateral no app. Mesmo padrão dos syncs de Hotmart e Omie já no repo
(`src/lib/hotmart/client.ts`, `src/lib/omie/client.ts`): job Inngest com
cron diário + script de backfill avulso.

**A autorização OAuth já foi feita** — `scripts/youtube-auth.mjs` já existe
e já rodou, e o `.env.local` já tem `YOUTUBE_CLIENT_ID`,
`YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` e `YOUTUBE_CHANNEL_ID`
preenchidos e validados contra a API real. Não precisa mexer nesse script.

============================================================
RESTRIÇÕES DA API — TESTADAS AO VIVO, NÃO SÃO SUPOSIÇÃO
============================================================

Descobertas rodando queries reais contra o canal antes deste prompt.
Respeitar todas, senão o job traz vazio ou quebra:

1. **Atraso de ~3 dias nos dados.** Em 12/08/2026 o último dia com dados
   fechados era 09/08. Por isso a janela do job diário é de **7 dias**
   (não 2, como no Hotmart) — precisa cobrir o atraso com folga.

2. **`dimensions=video,day` NÃO é suportado** — retorna HTTP 400 "The
   query is not supported". O contorno é consultar `dimensions=video` com
   `startDate == endDate` (janela de 1 dia), uma requisição por dia.

3. **Teto de `maxResults=200` na dimensão `video`**, e **`startIndex` não
   funciona** nessa query (ambos retornam 400). Ou seja: o máximo obtenível
   é o **top 200 vídeos por dia, ordenado por views**. Isso é limite da
   API, não escolha de design — cobre praticamente toda a audiência real.

4. **Métricas de receita (`estimatedRevenue`) retornam 401** — o escopo
   `yt-analytics-monetary.readonly` não foi concedido. Não incluir nenhuma
   métrica monetária nas queries, senão a chamada inteira falha.

5. **`impressions` e `impressionsClickThroughRate` NÃO EXISTEM na API** —
   retornam "Unknown identifier". Impressões e CTR só existem dentro do
   YouTube Studio. Não tentar buscar, não criar coluna pra isso.

6. O canal tem **3.751 vídeos** na playlist de uploads
   (`UU7RP2TGiFUPDv5yZ8QqfEHw` — é o channel id com `UC`→`UU`).

7. **Testadas e CONFIRMADAS como disponíveis** (usadas na Parte 6):
   `elapsedVideoTimeRatio` + `audienceWatchRatio` (curva de retenção, 100
   pontos por vídeo), `ageGroup`+`gender`+`viewerPercentage`, `country`,
   `insightTrafficSourceDetail` filtrado por `YT_SEARCH` (termos de busca),
   `subscribedStatus`, `deviceType`, `sharingService`.

============================================================
PARTE 1 — MIGRATION
============================================================

1.1 — `youtube_videos` (metadata + stats vitalícias, atualizada todo dia):

  ```sql
  create table public.youtube_videos (
    video_id text primary key,
    titulo text,
    descricao text,
    published_at timestamptz,
    duracao text,
    thumbnail_url text,
    view_count bigint,
    like_count bigint,
    comment_count bigint,
    raw_payload jsonb not null default '{}'::jsonb,
    synced_at timestamptz not null default now()
  );

  create index youtube_videos_published_at_idx
    on public.youtube_videos (published_at desc);

  alter table public.youtube_videos enable row level security;
  grant select, insert, update on public.youtube_videos to service_role;
  ```

1.2 — `youtube_canal_diario` (série temporal do canal, 1 linha por dia):

  ```sql
  create table public.youtube_canal_diario (
    dia date primary key,
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
    synced_at timestamptz not null default now()
  );

  alter table public.youtube_canal_diario enable row level security;
  grant select, insert, update on public.youtube_canal_diario to service_role;
  ```

1.3 — `youtube_video_diario` (top 200 vídeos por dia):

  ```sql
  create table public.youtube_video_diario (
    video_id text not null,
    dia date not null,
    views bigint,
    minutos_assistidos bigint,
    duracao_media_segundos integer,
    percentual_medio_assistido numeric,
    inscritos_ganhos integer,
    inscritos_perdidos integer,
    likes integer,
    comentarios integer,
    compartilhamentos integer,
    synced_at timestamptz not null default now(),
    primary key (video_id, dia)
  );

  create index youtube_video_diario_dia_idx
    on public.youtube_video_diario (dia);

  alter table public.youtube_video_diario enable row level security;
  grant select, insert, update on public.youtube_video_diario to service_role;
  ```

  Sem FK pra `youtube_videos` de propósito (mesmo motivo do Omie: evita
  quebrar se um vídeo aparecer no analytics antes de a metadata sincronizar).

1.4 — `youtube_video_snapshot` (foto diária do contador público — permite
  calcular views por dia **ao vivo**, sem esperar o atraso do Analytics):

  ```sql
  create table public.youtube_video_snapshot (
    video_id text not null,
    dia date not null,
    view_count bigint,
    like_count bigint,
    comment_count bigint,
    capturado_em timestamptz not null default now(),
    primary key (video_id, dia)
  );

  create index youtube_video_snapshot_dia_idx
    on public.youtube_video_snapshot (dia);

  alter table public.youtube_video_snapshot enable row level security;
  grant select, insert, update on public.youtube_video_snapshot to service_role;
  ```

  Motivo: o `viewCount` da Data API é **acumulado e ao vivo** (testado: um
  vídeo publicado há 2 dias marcava 10.236 views na Data API contra 80 no
  Analytics, que ainda não fechou o período). Guardando uma foto por dia,
  a diferença entre dias consecutivos dá as views daquele dia sem atraso.

  Volume: ~3.751 linhas/dia (uma por vídeo). Aceitável, mas se quiser
  enxugar depois dá pra limitar a vídeos publicados nos últimos 90 dias.

  View de conveniência pro delta diário:

  ```sql
  create view public.youtube_video_views_diarias as
  select
    video_id,
    dia,
    view_count,
    view_count - lag(view_count) over (
      partition by video_id order by dia
    ) as views_no_dia
  from public.youtube_video_snapshot;
  ```

1.5 — `youtube_trafego_diario` (origem de tráfego por dia):

  ```sql
  create table public.youtube_trafego_diario (
    dia date not null,
    fonte text not null,
    views bigint,
    minutos_assistidos bigint,
    synced_at timestamptz not null default now(),
    primary key (dia, fonte)
  );

  alter table public.youtube_trafego_diario enable row level security;
  grant select, insert, update on public.youtube_trafego_diario to service_role;
  ```

1.6 — Enum de `background_jobs` (é enum do Postgres, não texto livre —
  mesmo cuidado do Hotmart/Omie):

  ```sql
  DO $$
  BEGIN
    ALTER TYPE public.job_type ADD VALUE 'youtube_analytics_sync';
  EXCEPTION
    WHEN undefined_object THEN
      RAISE NOTICE 'enum public.job_type não encontrado';
    WHEN duplicate_object THEN
      NULL;
  END $$;
  ```

1.7 — Tabelas de recortes adicionais (Parte 6). Todas são agregados por
  **mês** (não por dia) — muda pouco no dia a dia e economiza muita
  chamada. Chave: (mes, <dimensão>).

  ```sql
  create table public.youtube_retencao (
    video_id text not null,
    ponto numeric not null,           -- elapsedVideoTimeRatio: 0.01 → 1.00
    audiencia_ratio numeric,          -- audienceWatchRatio
    retencao_relativa numeric,        -- relativeRetentionPerformance
    periodo_inicio date not null,
    periodo_fim date not null,
    synced_at timestamptz not null default now(),
    primary key (video_id, ponto, periodo_fim)
  );

  create table public.youtube_demografia (
    mes date not null,
    faixa_etaria text not null,
    genero text not null,
    percentual numeric,
    synced_at timestamptz not null default now(),
    primary key (mes, faixa_etaria, genero)
  );

  create table public.youtube_geografia (
    mes date not null,
    pais text not null,
    views bigint,
    minutos_assistidos bigint,
    synced_at timestamptz not null default now(),
    primary key (mes, pais)
  );

  create table public.youtube_termos_busca (
    mes date not null,
    termo text not null,
    views bigint,
    synced_at timestamptz not null default now(),
    primary key (mes, termo)
  );

  create table public.youtube_audiencia_recortes (
    mes date not null,
    tipo text not null,               -- 'subscribed' | 'device' | 'sharing'
    valor text not null,              -- SUBSCRIBED / MOBILE / WHATS_APP ...
    views bigint,
    minutos_assistidos bigint,
    compartilhamentos bigint,
    synced_at timestamptz not null default now(),
    primary key (mes, tipo, valor)
  );
  ```

  Todas com `enable row level security` + `grant select, insert, update
  ... to service_role`, igual às outras.

============================================================
PARTE 2 — Cliente da API
============================================================

Criar `src/lib/youtube/client.ts`, `fetch` nativo, sem dependência nova.

**2.1 — Access token a partir do refresh token** (cachear em memória,
mesmo padrão do `src/lib/hotmart/client.ts`; access token vale 1h):

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded
body: client_id, client_secret, refresh_token, grant_type=refresh_token
→ { access_token, expires_in }
```

Todas as chamadas abaixo usam `Authorization: Bearer <access_token>`.

**2.2 — Analytics: canal por dia**

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==<YOUTUBE_CHANNEL_ID>
  &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  &dimensions=day
  &metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,dislikes,comments,shares
```

Resposta: `{ columnHeaders: [{name}], rows: [[...]] }` — array posicional,
mapear pela ordem de `columnHeaders` (não assumir ordem fixa).

**2.3 — Analytics: vídeos de UM dia** (uma chamada por dia)

```
GET .../v2/reports
  ?ids=channel==<CHANNEL_ID>
  &startDate=<dia>&endDate=<dia>        ← mesmo valor nos dois
  &dimensions=video
  &metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares
  &sort=-views
  &maxResults=200                        ← teto rígido, não aumentar
```

Não passar `startIndex` (não é suportado nessa query).

**2.4 — Analytics: tráfego por dia**

```
GET .../v2/reports
  ?ids=channel==<CHANNEL_ID>
  &startDate=...&endDate=...
  &dimensions=day,insightTrafficSourceType
  &metrics=views,estimatedMinutesWatched
  &sort=-views
```

**2.5 — Data API: metadata dos vídeos** (duas etapas)

Etapa 1 — listar ids da playlist de uploads, paginando por `pageToken`:
```
GET https://www.googleapis.com/youtube/v3/playlistItems
  ?part=contentDetails&playlistId=UU7RP2TGiFUPDv5yZ8QqfEHw&maxResults=50&pageToken=...
```

Etapa 2 — buscar detalhes em lotes de **50 ids por chamada**:
```
GET https://www.googleapis.com/youtube/v3/videos
  ?part=snippet,statistics,contentDetails&id=<id1,id2,...,id50>
```

Campos: `snippet.title`, `snippet.description`, `snippet.publishedAt`,
`snippet.thumbnails.high.url`, `contentDetails.duration` (formato ISO 8601
tipo `PT16M54S` — guardar como texto, não converter),
`statistics.viewCount/likeCount/commentCount` (vêm como **string**,
converter pra número).

Quota da Data API: 10.000 unidades/dia, cada chamada dessas custa 1. Com
3.751 vídeos dá ~152 chamadas por sync — folgado.

============================================================
PARTE 3 — Job Inngest
============================================================

3.1 — Criar `src/lib/inngest/functions/youtube-analytics-sync.ts`:
  - Cron diário: `{ cron: 'TZ=America/Sao_Paulo 0 8 * * *' }` (depois do
    Omie 6h e do Hotmart 7h)
  - **Janela: últimos 7 dias** (por causa do atraso de ~3 dias da API)
  - Passo 1 — canal por dia (2.2), upsert em `youtube_canal_diario`
    (`on conflict (dia)`)
  - Passo 2 — tráfego (2.4), upsert em `youtube_trafego_diario`
    (`on conflict (dia, fonte)`)
  - Passo 3 — para **cada dia** da janela, uma chamada de vídeos (2.3),
    upsert em `youtube_video_diario` (`on conflict (video_id, dia)`)
  - Passo 4 — metadata dos vídeos (2.5), upsert em `youtube_videos`
    (`on conflict (video_id)`) **e**, com os mesmos dados já buscados,
    upsert em `youtube_video_snapshot` com `dia` = data de hoje em
    America/Sao_Paulo (`on conflict (video_id, dia)`) — é a foto diária
    do contador ao vivo, sem custo extra de API
  - Usa `createAdminClient()`, registra em `background_jobs` com
    `job_type: 'youtube_analytics_sync'` e payload com os totais de cada
    passo, `status: 'completed'` ou `'failed'`

  - Passo 5 — recortes do **mês corrente** (Parte 6), upsert nas tabelas
    de demografia/geografia/termos/audiência
  - Passo 6 — curva de retenção dos vídeos publicados nos últimos 90 dias
    (Parte 6), upsert em `youtube_retencao`

3.2 — Registrar em `src/app/api/inngest/route.ts`.

============================================================
PARTE 6 — Recortes adicionais (mensais)
============================================================

Todos são chamadas de Analytics já validadas ao vivo. Rodam **1x por mês
fechado** (no job diário, só reprocessar o mês corrente — é barato e
mantém o mês atual sempre atualizado).

`<S>`/`<E>` = primeiro e último dia do mês.

```
# Demografia → youtube_demografia
dimensions=ageGroup,gender & metrics=viewerPercentage

# Geografia → youtube_geografia
dimensions=country & metrics=views,estimatedMinutesWatched & sort=-views

# Termos de busca → youtube_termos_busca
dimensions=insightTrafficSourceDetail
filters=insightTrafficSourceType==YT_SEARCH
metrics=views & sort=-views & maxResults=50

# Inscrito vs não → youtube_audiencia_recortes (tipo='subscribed')
dimensions=subscribedStatus & metrics=views,estimatedMinutesWatched

# Dispositivo → youtube_audiencia_recortes (tipo='device')
dimensions=deviceType & metrics=views & sort=-views

# Onde compartilham → youtube_audiencia_recortes (tipo='sharing')
dimensions=sharingService & metrics=shares & sort=-shares & maxResults=25
```

**Curva de retenção** → `youtube_retencao`. Diferente das outras: é **uma
chamada por vídeo**, então NÃO fazer pros 3.751. Rodar só pros vídeos
publicados nos **últimos 90 dias** (é onde a análise de retenção importa):

```
dimensions=elapsedVideoTimeRatio
metrics=audienceWatchRatio,relativeRetentionPerformance
filters=video==<VIDEO_ID>
startDate/endDate = janela de análise (ex.: últimos 90 dias)
```

Retorna 100 linhas por vídeo (pontos 0.01 → 1.00). Gravar
`periodo_inicio`/`periodo_fim` junto pra saber a que janela se refere.

============================================================
PARTE 4 — Env vars
============================================================

Adicionar no `.env.example`:

```
# -----------------------------------------------------------------------------
# YouTube Analytics — dashboard de performance do canal
# Autorização: node scripts/youtube-auth.mjs (rodar 1x, gera o refresh token)
# -----------------------------------------------------------------------------
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_CHANNEL_ID=
```

============================================================
PARTE 5 — Script de backfill
============================================================

`scripts/youtube-backfill.mjs`, mesmo padrão dos outros dois backfills do
repo (standalone, lê `.env.local` na mão, `@supabase/supabase-js` com
`SUPABASE_SERVICE_ROLE_KEY`, sem Inngest).

- **Canal por dia + tráfego**: janela de **24 meses** — é barato (poucas
  chamadas, a API devolve o range inteiro de uma vez). Quebrar em fatias de
  ~3 meses pra resposta não ficar gigante.
- **Vídeos por dia**: janela de **12 meses** — uma chamada por dia (~365
  chamadas). Logar progresso a cada 30 dias processados pra dar visibilidade.
- **Recortes mensais** (Parte 6): 12 meses, uma rodada por mês fechado.
- **Curva de retenção**: só vídeos dos últimos 90 dias.
- **Metadata**: todos os 3.751 vídeos (2.5), uma vez. Gravar também o
  primeiro `youtube_video_snapshot` do dia de hoje — a série de snapshots
  **não tem como ser backfillada** (a Data API só devolve o acumulado
  atual, não o histórico do contador), então ela começa a valer a partir
  do dia em que o job rodar pela primeira vez. O histórico anterior fica
  coberto pelo `youtube_video_diario` (Analytics), que é backfillável.
- Idempotente (tudo upsert por chave natural), pode re-rodar sem duplicar.
- Se um dia específico falhar, logar e seguir pro próximo em vez de abortar
  tudo — no fim, imprimir a lista de dias que falharam pra re-rodar depois.

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Ordem: aplicar migration → rodar backfill → confiar no cron.
- Subir as 4 vars na Vercel depois de validar local.
- O refresh token não expira (app está "Em produção" no Google Auth
  Platform). Se um dia parar de funcionar, re-rodar `scripts/youtube-auth.mjs`.
