# Fix: 2 bugs encontrados na revisão do carrinho misto

Revisão pós-implementação do carrinho misto (`CURSOR_PROMPT_CARRINHO_MISTO.md`) achou dois bugs reais no checkout. A arquitetura de cobrança dupla em `src/app/api/checkout/create/route.ts` está correta — não mexer nela além do indicado abaixo. Os bugs são isolados em `src/app/(public)/checkout/page.tsx` (+ 3 blocos de resposta em `route.ts`).

## Bug 1 — `getPrice()` não multiplica por quantidade

Arquivo: `src/app/(public)/checkout/page.tsx`

```ts
function getPrice(item: LocalProtocolItem): number {
  const plan = item.subscribed ? 'assinatura_mensal' : '1mes'
  return getChargePrice(item.price_monthly ?? 0, plan)
}
```

`CartDrawer.tsx` e `use-cart.ts` multiplicam por `item.quantity`; esta função não. Como o carrinho acumula quantidade quando o mesmo produto é adicionado de novo (`use-cart.ts`), qualquer item com `quantity > 1` chegando ao checkout faz o `total_amount` do cliente ficar menor que o `serverTotal` recalculado no servidor (que já multiplica por qty em `computeServerCheckoutTotal`), disparando sempre "Valor do pedido desatualizado" e travando o checkout.

**Fix:**

```ts
function getPrice(item: LocalProtocolItem): number {
  const plan = item.subscribed ? 'assinatura_mensal' : '1mes'
  return getChargePrice(item.price_monthly ?? 0, plan) * (item.quantity ?? 1)
}
```

Isso corrige automaticamente `getProductsSubtotal()`, `getTotal()` (usado no `total_amount` enviado) e a exibição do resumo (linha ~1051, `getPrice(item)`).

Como esse valor agora vira o total da linha (não mais o preço unitário), adicione um indicador de quantidade no resumo de compra quando `quantity > 1`, no mesmo padrão usado em `src/app/(patient)/dashboard/pedidos/page.tsx:119` (`{item.quantity > 1 ? `${item.quantity}× ` : ''}`). No bloco por volta da linha 1041-1048 (nome do produto + "Assinatura/Avulso · Principal/Complementar"), adicione a contagem antes do nome do produto ou como parte da segunda linha — o importante é ficar visível que aquele valor já é o total daquela linha, não o unitário.

## Bug 2 — cartão recusado é tratado como sucesso

A Pagar.me v5 retorna **HTTP 200** mesmo quando o cartão é recusado — o `charges[0].status` vem como `'failed'`/`'refused'`, não um erro HTTP. O checkout hoje só olha `res.ok` (nível HTTP) e, no carrinho misto, `results.oneTime.ok`/`results.subscription.ok` — que significam apenas "a Pagar.me aceitou a chamada", **não** "o cartão foi aprovado". Resultado: com um cartão recusado, o cliente é redirecionado para `/obrigado` ("Pagamento recebido") mesmo sem ter sido cobrado. A página `/obrigado` é estática, sem nenhuma verificação server-side — não existe rede de segurança.

No backend isso já é tratado corretamente (o protocolo só é criado quando `result.paid`/`charge.paid` é true), mas essa informação nunca chega ao front de forma que ele consiga agir.

### 2a. Backend — expor `paid` nos 3 pontos de resposta de `src/app/api/checkout/create/route.ts`

**Bloco "cobrança única — avulso" (por volta da linha 1002-1018):**

```ts
results: {
  oneTime: {
    ok: true,
    order_id: result.pagarmeId,
    paid: result.paid,
    status: result.chargeStatus ?? 'pending',
    ...(result.pix ? { pix: result.pix } : {}),
  },
},
```

**Bloco "cobrança única — assinatura" (por volta da linha 1069-1081):**

```ts
results: {
  subscription: {
    ok: true,
    subscription_id: subscription.id,
    paid: result.paid,
    status: result.chargeStatus ?? 'pending',
  },
},
```

**Bloco "carrinho misto" (por volta da linha 868-893)** — já tem `status`, só falta `paid`:

```ts
results: {
  oneTime: oneTimeCharge.ok
    ? {
        ok: true,
        order_id: oneTimeCharge.pagarmeId,
        subscription_id: oneTimeSub.id,
        paid: oneTimeCharge.paid,
        status: oneTimeCharge.chargeStatus,
      }
    : { ok: false, error: oneTimeCharge.error },
  subscription: subCharge.ok
    ? {
        ok: true,
        subscription_id: recurringSub.id,
        paid: subCharge.paid,
        status: subCharge.chargeStatus,
      }
    : { ok: false, error: subCharge.error },
},
```

Não mudar mais nada nesses blocos (status code retornado, lógica de `partialOk`, criação de protocolo, disparo do Inngest — tudo isso já está correto e não deve ser tocado).

### 2b. Frontend — `src/app/(public)/checkout/page.tsx`

Atualize o tipo local do `results` no handler de submit para incluir `paid?: boolean` em `oneTime` e `subscription`:

```ts
const results = data.results as
  | {
      oneTime?: { ok: boolean; paid?: boolean; error?: string }
      subscription?: { ok: boolean; paid?: boolean; error?: string }
    }
  | undefined
```

No bloco de tratamento do carrinho misto (`if (results?.oneTime && results?.subscription) { ... }`), troque a fonte de sucesso de `.ok` para `.paid`:

```ts
if (results?.oneTime && results?.subscription) {
  const otOk = results.oneTime.ok && results.oneTime.paid === true
  const subOk = results.subscription.ok && results.subscription.paid === true
  // resto do bloco (otOk && !subOk / !otOk && subOk / !otOk && !subOk) continua igual,
  // só que agora também cobre o caso "API aceitou mas o cartão foi recusado"
  ...
}
```

Depois desse bloco, para o **caso não-misto** (só `results.oneTime` OU só `results.subscription` presente, ou o carrinho misto com ambos pagos), adicione uma checagem antes do redirect final (linhas ~479-480, `clearCheckoutSession(); router.push('/obrigado')`), só para `method === 'credit_card'`:

```ts
if (method === 'credit_card') {
  const oneTimePaid = results?.oneTime ? results.oneTime.paid === true : true
  const subPaid = results?.subscription ? results.subscription.paid === true : true
  if (!oneTimePaid || !subPaid) {
    toast.error(
      'Pagamento recusado pela operadora do cartão. Verifique os dados ou tente outro cartão.'
    )
    return
  }
}

clearCheckoutSession()
router.push('/obrigado')
```

Isso cobre: fluxo único avulso recusado, fluxo único assinatura recusada, e carrinho misto onde ambas as pernas retornaram `ok: true` a nível HTTP mas uma (ou as duas) não foi de fato paga. O caso "ambas falharam a nível de API" (`!res.ok`, HTTP 400) já é tratado antes disso, sem mudança necessária. O caso PIX não é afetado — continua no branch próprio (`if (method === 'pix') { ... }`), que já espera confirmação via polling em `/api/checkout/status`.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Não alterar `src/lib/protocol/create-from-checkout.ts`, `src/lib/inngest/functions/pharmacy-order.ts`, `src/lib/shipping/create-label.ts`.
- Testar manualmente se possível com cartão de teste de recusa da Pagar.me (sandbox) nos 3 cenários: avulso único, assinatura única, misto (uma perna aprova e outra recusa) — em todos, o usuário deve ver um erro claro e não ser redirecionado para `/obrigado` quando nada foi pago; no caso misto com uma perna paga, deve ver o erro da perna recusada e ainda assim ser redirecionado (pois o protocolo foi criado com os itens que pagaram) — esse comportamento parcial já existe no código, só precisa passar a disparar corretamente com base em `paid`, não em `ok`.
