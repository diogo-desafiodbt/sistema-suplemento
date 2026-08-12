# Prompt para o Cursor — Quebrar o job do YouTube em múltiplos steps do Inngest

O `src/lib/inngest/functions/youtube-analytics-sync.ts` está funcionalmente
correto, mas tem um problema de execução: **tudo está dentro de um único
`step.run('sync-youtube-analytics', ...)`**.

Isso obriga o job inteiro a caber numa única invocação serverless. Medindo
as chamadas reais contra a API do canal, a execução leva **~1,5 a 2
minutos** (152 chamadas de metadata dos 3.751 vídeos + 61 chamadas de
retenção + 7 de vídeo/dia + recortes). O projeto **não tem `maxDuration`
configurado em lugar nenhum** (nem `vercel.json`, nem no route handler),
então roda no default da plataforma — que pode ser 60s e derrubar o cron em
produção.

Não mexer na lógica nem nas queries — só na estrutura de steps.

============================================================
O QUE FAZER
============================================================

1 — **Quebrar em um `step.run` por passo.** Cada `step.run` do Inngest é
uma invocação HTTP separada com seu próprio orçamento de tempo, e o
resultado fica memoizado (se um passo posterior falhar, os anteriores não
re-executam no retry). Estrutura alvo:

```ts
const janela = await step.run('calcular-janela', async () => { ... })
const canal = await step.run('canal-diario', async () => { ... })
const trafego = await step.run('trafego-diario', async () => { ... })
const videoDiario = await step.run('video-diario', async () => { ... })
const metadata = await step.run('metadata-e-snapshot', async () => { ... })
const recortes = await step.run('recortes-mensais', async () => { ... })
const retencao = await step.run('retencao-90d', async () => { ... })
await step.run('registrar-background-job', async () => { ... })
```

2 — **O passo de retenção é o mais pesado** (61 chamadas hoje, cresce
conforme o canal publica). Quebrar ele em lotes usando `step.run`
separados por fatia, ou usar `step.run` dentro de um loop com chave
dinâmica (`step.run(\`retencao-lote-${i}\`, ...)`) em lotes de ~20 vídeos.

3 — **Adicionar `export const maxDuration = 300`** em
`src/app/api/inngest/route.ts` — cinto de segurança adicional, independente
do split.

4 — **Tratamento de erro**: hoje há um `try/catch` único que grava
`background_jobs` com `status: 'failed'`. Com múltiplos steps, mover esse
registro pro final (`step.run('registrar-background-job')`) no caminho
feliz, e usar o `onFailure` da `inngest.createFunction` (ou um step de
catch no fim) pro caminho de falha — assim o registro de erro não depende
de o try/catch envolver tudo.

5 — Manter o payload final de `background_jobs` com os mesmos campos que já
existem (windowStart, windowEnd, canalRows, trafegoRows, videoDiarioRows,
videosMetadata, demografia, geografia, termos, audiencia, retencaoRows,
recentVideos) — só que agora montado a partir dos retornos de cada step.

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Migration já aplicada no Supabase e backfill já rodado — esse ajuste é
  só sobre o job recorrente, não afeta dados já carregados.
- Depois disso, subir as 4 vars do YouTube na Vercel.
