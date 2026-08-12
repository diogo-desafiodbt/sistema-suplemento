# Prompt para o Cursor — 2 bugs do sync do YouTube (achados rodando o backfill)

O backfill rodou e falhou em dois pontos. As partes de canal/tráfego (24
meses) e vídeo/dia (361 dias, 71.600 linhas) funcionaram e já estão no
banco — **não precisa refazer essas**. Os dois bugs abaixo afetam tanto o
`scripts/youtube-backfill.mjs` quanto o job diário
`src/lib/inngest/functions/youtube-analytics-sync.ts` (via
`src/lib/youtube/client.ts`), porque compartilham a mesma lógica.

============================================================
BUG 1 — maxResults tem teto de 25 em `insightTrafficSourceDetail`
============================================================

Sintoma: todos os 12 meses de recortes falharam com

```
HTTP 500 {"reason":"FIELD_UNKNOWN_VALUE","location":"max-results"}
```

Testado ao vivo contra a API, isolando o valor:

| maxResults | resultado |
|---|---|
| 10  | OK |
| 25  | OK |
| 50  | ERRO FIELD_UNKNOWN_VALUE |
| 200 | ERRO FIELD_UNKNOWN_VALUE |

Ou seja: **25 é o teto** dessa dimensão (não é erro transitório do Google,
é limite fixo — o HTTP 500 é enganoso, o problema é o parâmetro).

**Correção**: em `src/lib/youtube/client.ts`, na função
`fetchTermosBusca` (linha ~491), trocar `maxResults: '50'` por
`maxResults: '25'`. Fazer a mesma troca na cópia que existe dentro de
`scripts/youtube-backfill.mjs`.

Não mexer nos outros `maxResults` do arquivo — os de `sharingService`
(25) e de `video` (200) foram testados e estão corretos.

============================================================
BUG 2 — playlist de uploads devolve ids duplicados
============================================================

Sintoma:

```
Error: youtube_videos: ON CONFLICT DO UPDATE command cannot affect row a second time
```

Causa confirmada ao vivo: a playlist de uploads
(`UU7RP2TGiFUPDv5yZ8QqfEHw`) devolve **3.751 itens mas só 3.475 ids
únicos** — 276 vídeos aparecem repetidos (ex.: `OnSU8o9wKCY`,
`z6gtDhjqXHw`, `v22WbSNjRK4`, cada um 2x). O Postgres rejeita um `ON
CONFLICT` quando a mesma chave aparece duas vezes no mesmo lote.

**Correção**: deduplicar por `video_id` antes de qualquer upsert.

O melhor lugar é na origem — em `listAllUploadVideoIds()` (client.ts,
linha ~298), devolver ids únicos:

```ts
return Array.from(new Set(ids))
```

Isso resolve de uma vez o upsert de `youtube_videos` e o de
`youtube_video_snapshot` (que é derivado da mesma lista), e ainda economiza
~5 chamadas de `videos.list`.

Aplicar o mesmo no `scripts/youtube-backfill.mjs`.

Como cinto de segurança adicional (a API pode voltar a duplicar em outro
ponto), deduplicar também imediatamente antes dos upserts em lote de
`youtube_videos` e `youtube_video_snapshot`, mantendo a última ocorrência
de cada chave.

============================================================
DEPOIS DE CORRIGIR
============================================================

Deixar o backfill re-executável só nas partes que faltaram, sem repetir as
que já rodaram (que levam ~15 min). Adicionar suporte a argumento de linha
de comando:

```
node scripts/youtube-backfill.mjs                # tudo (comportamento atual)
node scripts/youtube-backfill.mjs recortes       # só recortes mensais
node scripts/youtube-backfill.mjs metadata       # só metadata + snapshot
node scripts/youtube-backfill.mjs retencao       # só retenção
```

Sem argumento = comportamento de hoje. Tudo continua idempotente (upsert
por chave natural), então re-rodar qualquer etapa é seguro.

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Migration já aplicada. Canal/tráfego (24m) e vídeo/dia (361 dias,
  71.600 linhas) já no banco.
- Falta rodar: recortes mensais, metadata/snapshot, retenção — depois
  dessas correções, com `node scripts/youtube-backfill.mjs recortes` etc.
- Depois disso, subir as 4 vars do YouTube na Vercel.
