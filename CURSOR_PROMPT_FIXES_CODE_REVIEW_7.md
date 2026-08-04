# Prompt para o Cursor — Correções da 7ª rodada de /code-review (5 achados)

============================================================
PARTE 1 — claimOnce assume que toda tabela tem `created_at` (2 das 4 não têm)
============================================================

`pharmacy_order_dispatch_logs` tem `created_at`, mas
`purchase_confirmation_logs` e `shipping_notification_logs` só têm
`sent_at`. O reclaim de claim antiga em `claimOnce` faz
`.select('created_at')` fixo — nessas 2 tabelas isso dá erro de coluna
inexistente, o erro é descartado (só `{ data: existing }` é
desestruturado), `existing` fica `undefined`, e a função **sempre**
retorna `false` sem avisar nada. Ou seja: a auto-recuperação de claim
travada (criada na rodada 5) nunca funciona nessas duas tabelas — se o
processo cair no meio, o e-mail de compra confirmada ou a notificação de
frete ficam bloqueados pra sempre, em silêncio.

Corrigir `claimOnce` em `src/lib/idempotency.ts` pra aceitar o nome da
coluna de timestamp como parâmetro:
```ts
export async function claimOnce(
  admin: AdminClient,
  table: string,
  claimRow: Record<string, unknown>,
  options?: { staleAfterMs?: number; timestampColumn?: string }
): Promise<boolean> {
  const staleAfterMs = options?.staleAfterMs ?? DEFAULT_STALE_CLAIM_MS
  const timestampColumn = options?.timestampColumn ?? 'created_at'
  // ...
  const { data: existing } = await existingQuery.select(timestampColumn).maybeSingle()
  const createdAt = existing?.[timestampColumn] as string | undefined
  // resto igual
}
```
Atualizar as chamadas:
- `purchase-confirmed.ts`: passar `{ timestampColumn: 'sent_at' }`.
- `shipping/notify.ts`: passar `{ timestampColumn: 'sent_at' }`.
- `pharmacy-order.ts` e `support-inbox-poll.ts` continuam sem passar nada
  (default `'created_at'`, que é o que essas tabelas têm).

============================================================
PARTE 2 — Profissional ainda falta HbA1c, glicemia de jejum e sintomas
============================================================

A rodada 5 trouxe de volta `years_diagnosed`/`allergies`/
`conditions_serious` como fallback legado na tela do profissional, mas
faltou `hba1c_range`, `fasting_glucose` e `symptoms` — que a tela
original também mostrava ("HbA1c", "Glicemia em jejum", "Sintomas") e
sumiram sem fallback nenhum, pra qualquer protocolo (não só os antigos).

Em `src/app/(professional)/profissional/protocolo/[id]/page.tsx`:
adicionar `hba1c_range`, `fasting_glucose`, `symptoms` de volta ao select
de `quiz_responses` e ao tipo `QuizResponse`, e renderizar essas 3 linhas
de volta na seção de dados clínicos (mesmo padrão visual das outras
linhas), dentro do bloco de fallback legado (`isLegacyQuiz`) — já que são
dados que só existem nos registros antigos mesmo.

============================================================
PARTE 3 — pharmacy-order.ts: pedido órfão sobrevive à auto-recuperação de claim
============================================================

A auto-recuperação de claim (rodada 5) resolve "nunca mais tentar" — mas
não limpa um pedido que ficou **pela metade** de uma execução anterior
que morreu no meio (claim reivindicada, `order_id` já gravado na claim,
mas `pharmacy_json`/`order_items` nunca chegaram a ser escritos antes do
processo morrer). Quando o reclaim acontece (depois de 10 min), a função
recomeça do zero e cria um **pedido novo**, deixando o pedido incompleto
anterior órfão no banco.

Em `pharmacy-order.ts`: quando `claimOnce` reivindicar uma claim que
estava marcada como stale (ou seja, quando a claim antiga existia e foi
apagada), buscar se aquela claim antiga tinha `order_id` preenchido — se
tinha, apagar esse pedido órfão (e seus `order_items`, se algum tiver
sido criado) antes de prosseguir com a criação do novo. Como `claimOnce`
não expõe hoje se reivindicou por estar "vazio" ou por "estava stale",
ajustar `claimOnce` pra retornar não só `boolean`, mas um resultado que
diferencie os dois casos (ex.: `{ won: boolean; reclaimedStale?: Record<string, unknown> }`),
e usar isso em `pharmacy-order.ts` pra fazer a limpeza — os outros 3
lugares que chamam `claimOnce` podem ignorar o campo extra.

============================================================
PARTE 4 — checkout/create/route.ts: insert de payments falhando não pode passar batido
============================================================

Hoje, se o `insert` em `payments` falhar (linha ~401), o erro só é
logado e a execução continua — o evento `pagamento/confirmado` sai sem
`payment_id`, e como não existe nenhuma linha em `payments` pra essa
compra, `pharmacy-order.ts`/`purchase-confirmed.ts` nunca acham nada (nem
no fallback de "mais recente"). Isso significa uma compra paga de
verdade no Pagar.me sem nenhum registro interno de pagamento.

Em `src/app/api/checkout/create/route.ts` (nos 2 lugares que fazem esse
insert, avulso e recorrente): se o insert falhar, lançar um erro
explícito em vez de só logar e seguir — melhor a requisição de checkout
falhar de forma visível (o cliente pode tentar de novo) do que prosseguir
silenciosamente sem registro de pagamento algum.

============================================================
NOTAS
============================================================

- A migration `20260804020000_idempotency_logs_delete_grant.sql` (rodada
  anterior) já era redundante desde que foi criada — as duas migrations
  anteriores já tinham os grants certos. Não faz mal nenhum ficar assim
  (é só um `GRANT` repetido, sem efeito colateral) — não vale criar mais
  uma migration só pra "desfazer" isso, é ruído inofensivo.
- Rodar `npm run build`/typecheck no final.
- Nenhuma migration nova nesta rodada.
