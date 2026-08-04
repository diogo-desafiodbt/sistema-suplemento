# Prompt para o Cursor — Correções da 4ª rodada de /code-review (5 achados)

O achado mais importante desta rodada é estrutural: o padrão de
idempotência (claim + libera em falha) foi reimplementado à mão 3 vezes
(`pharmacy-order.ts`, `purchase-confirmed.ts`, `support-analyze.ts`), cada
uma com uma variação sutilmente diferente — foi exatamente por isso que
levou 3 rodadas de review pra estabilizar. Esta rodada extrai isso pra um
módulo só, e corrige os 2 bugs restantes que sobraram das variações
divergentes, mais 2 itens menores.

============================================================
PARTE 1 — Extrair o padrão de idempotência pra um módulo compartilhado
============================================================

Criar `src/lib/idempotency.ts`:

```ts
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Claim via insert numa tabela de log dedicada (chave primária única, ex.:
 * payment_id). Retorna true se essa chamada "ganhou" a claim (deve
 * prosseguir com a ação de verdade); false se já foi reivindicada por
 * outra invocação (idempotente — pula em silêncio). Lança erro em
 * qualquer falha que NÃO seja violação de unicidade (23505), pra o
 * Inngest tentar de novo em vez de engolir a falha como sucesso.
 */
export async function claimOnce(
  admin: AdminClient,
  table: string,
  claimRow: Record<string, unknown>
): Promise<boolean> {
  const { error } = await admin.from(table).insert(claimRow)
  if (error) {
    if (error.code === '23505') return false
    throw new Error(`claimOnce(${table}) falhou: ${error.message}`)
  }
  return true
}

/** Desfaz a claim (chamar sempre que a ação real falhar depois de reivindicada). */
export async function releaseClaim(
  admin: AdminClient,
  table: string,
  keyColumn: string,
  keyValue: string
): Promise<void> {
  await admin.from(table).delete().eq(keyColumn, keyValue)
}

/**
 * Claim via flag numa coluna de uma linha já existente (UPDATE atômico
 * condicional — usado quando não faz sentido ter tabela de log separada).
 */
export async function claimByFlag(
  admin: AdminClient,
  table: string,
  id: string,
  flagColumn: string
): Promise<boolean> {
  const { data } = await admin
    .from(table)
    .update({ [flagColumn]: new Date().toISOString() })
    .eq('id', id)
    .is(flagColumn, null)
    .select('id')
    .maybeSingle()
  return !!data
}

/** Desfaz a claim por flag (chamar se a ação real falhar depois de reivindicada). */
export async function releaseFlag(
  admin: AdminClient,
  table: string,
  id: string,
  flagColumn: string
): Promise<void> {
  await admin.from(table).update({ [flagColumn]: null }).eq('id', id)
}
```

1.1 — Em `pharmacy-order.ts`: trocar o insert manual em
`pharmacy_order_dispatch_logs` por
`const won = await claimOnce(admin, 'pharmacy_order_dispatch_logs', { payment_id: payment.id })`.
Se `!won`, retornar `{ ok: true, skipped: 'already_dispatched', payment_id: payment.id }`.
No catch que hoje já existe (pharmacy_json + order_items), trocar o
delete manual da claim por `await releaseClaim(admin, 'pharmacy_order_dispatch_logs', 'payment_id', payment.id)`
(mantendo a ordem já corrigida: claim antes do pedido, por causa da FK).

1.2 — Em `purchase-confirmed.ts`: mesma troca —
`claimOnce(admin, 'purchase_confirmation_logs', { payment_id: payment.id })`.
Isso **corrige sozinho** o bug da Parte 2 abaixo, porque `claimOnce` já
lança erro em qualquer falha que não seja unicidade (hoje esse arquivo
fazia `return { ok: false, ... }` nesse caso, que o Inngest trata como
sucesso e nunca tenta de novo). No catch do envio, trocar o delete manual
por `releaseClaim(admin, 'purchase_confirmation_logs', 'payment_id', payment.id)`.

1.3 — Em `support-analyze.ts`: trocar o `update`/`is`/`select` manual da
claim atômica por `const claimed = await claimByFlag(admin, 'support_threads', threadId, 'auto_ack_sent_at')`,
usar `if (claimed) { ... }` no lugar do `if (claimed)` atual (mesma coisa,
só passando pelo helper). No catch do envio, trocar o reset manual por
`await releaseFlag(admin, 'support_threads', threadId, 'auto_ack_sent_at')`.

============================================================
PARTE 2 — pharmacy-order.ts: fechar a janela entre criar o pedido e o try/catch
============================================================

Hoje, entre o `orders.insert` bem-sucedido e o try/catch que cobre
`pharmacy_json`+`order_items` (adicionado na rodada anterior), ainda
ficam de fora: o `update({ order_id: order.id })` na claim, e a chamada
de `buildPharmacyJson(...)`. Se qualquer uma dessas lançar uma exceção
(não um erro de query normal, mas uma exceção de rede do próprio
supabase-js, que acontece), o pedido e a claim ficam órfãos pra sempre —
o retry do Inngest esbarra na claim e nunca recria nada.

Mover a abertura do `try` pra **logo depois** do `orders.insert` ter
sucesso, cobrindo: o `update` do `order_id` na claim, a chamada de
`buildPharmacyJson`, o `update` de `pharmacy_json`, e o `insert` de
`order_items` — tudo num bloco só. Qualquer erro nesse trecho inteiro cai
no mesmo catch que já existe (libera a claim, apaga o pedido, relança).

============================================================
PARTE 3 — pharmacy-order.ts: paralelizar busca de payment e subscription
============================================================

A busca de `payments` (adicionada pra idempotência) roda sequencialmente
antes da busca de `subscriptions`, que não depende dela — adiciona uma
ida-e-volta evitável num caminho crítico que roda a cada compra. Rodar
as duas em paralelo com `Promise.all`, igual já é feito em
`purchase-confirmed.ts` (linhas ~136-155) pra payment/subscription/user.
Fazer a checagem de `!payment?.id` depois que as duas resolverem.

============================================================
PARTE 4 — triage.ts: campo morto `triggeredReasons`
============================================================

`TriageResult.triggeredReasons` foi substituído por `gates` (que permite
`blockReasonForProduct` filtrar por produto), mas o campo antigo ficou no
tipo e continua sendo preenchido — sem nenhum lugar do código lendo ele
(confirmado por busca no repo). Remover `triggeredReasons` do tipo
`TriageResult` e das duas atribuições que ainda o preenchem, deixando só
`gates` como fonte de verdade.

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final.
- Nenhuma migration nova nesta rodada.
- Esse módulo `idempotency.ts` deve ser o lugar padrão pra qualquer
  função futura que precisar desse tipo de garantia — evita reimplementar
  a mesma lógica (e os mesmos bugs) uma quarta vez.
