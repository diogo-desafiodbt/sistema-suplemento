# Corrigir 4 achados do BugBot (pós-parcelamento 3/6 meses)

## 1 — `src/app/api/assinatura/cancelar/route.ts` (alto)

O gate hoje usa `isRecurringPlan(subscription.plan_type)`. O problema: `plan_type` é só um rótulo — não garante que existe (ou não existe) uma assinatura real na Pagar.me por trás. O sinal correto é a presença de `pagarme_sub_id`: se existe, há algo pra cancelar na Pagar.me, independente do rótulo do plano; se não existe, não há nada a cancelar.

Trocar:

```ts
if (!isRecurringPlan(subscription.plan_type)) {
  return NextResponse.json(
    { error: 'Este plano foi pago integralmente e não pode ser cancelado.' },
    { status: 400 }
  )
}
```

por:

```ts
if (!subscription.pagarme_sub_id) {
  return NextResponse.json(
    { error: 'Este plano foi pago integralmente e não pode ser cancelado.' },
    { status: 400 }
  )
}
```

Remover o import de `isRecurringPlan` desse arquivo se não sobrar mais nenhum uso.

## 2 — `src/lib/inngest/functions/pharmacy-order.ts` (médio)

No insert de `order_items` (perto da linha 430), `unit_price` usa `getUnitPriceFromProduct(item.products, planType)` direto — que pra `3meses`/`6meses` é o preço do **ciclo inteiro**, não unitário. Como `quantity` já vem multiplicada pelo ciclo (`qty`), a linha registrada fica com `quantity × unit_price` = N× o valor real cobrado. Isso já foi corrigido em `buildPharmacyItem` (`json-builder.ts`), mas não nesse insert separado — replicar a mesma divisão:

```ts
const { error: itemsError } = await admin.from('order_items').insert(
  activeItems.map(item => {
    const qty =
      item.quantity && item.quantity > 0
        ? item.quantity
        : getPharmacyCycleMultiplier(planType)
    const unitPrice = getUnitPriceFromProduct(item.products, planType)
    return {
      order_id: order.id,
      product_id: item.product_id,
      pharmacy_sku: item.products?.[skuKey] ?? '',
      quantity: qty,
      unit_price: qty > 1 ? unitPrice / qty : unitPrice,
    }
  })
)
```

## 3 — `src/app/api/checkout/create/route.ts` (médio)

Cartão recusado (`result.ok === true`, `result.paid === false`) hoje não limpa a `subscription` — ela fica `status: 'pending'` órfã pra sempre, só é limpa quando a Pagar.me rejeita a chamada em si (`result.ok === false`).

**Atenção**: essa correção é só pra cartão. Pix começa legitimamente como `paid: false` (fica pendente até o cliente pagar o QR code, confirmado depois via webhook) — aplicar isso pro Pix também apagaria a subscription antes do webhook confirmar, quebrando o fluxo de Pix inteiro. Escopar explicitamente:

```ts
if (!result.ok) {
  await deleteFailedSubscription(admin, subscription.id)
  return NextResponse.json(
    { error: result.error ?? 'Erro no pagamento' },
    { status: 400 }
  )
}

if (data.payment_method === 'credit_card' && !result.paid) {
  await deleteFailedSubscription(admin, subscription.id)
  return NextResponse.json(
    {
      error:
        'Pagamento recusado pela operadora do cartão. Verifique os dados ou tente outro cartão.',
    },
    { status: 400 }
  )
}
```

O restante da function (bloco `if (result.paid) { ... }` que finaliza a subscription paga) continua igual, sem mudança.

## 4 — `src/lib/inngest/functions/avulso-renewal-reminder.ts` (médio)

Mesmo problema do item 1: usa `isRecurringPlan(sub.plan_type)` pra decidir se pula o lembrete, mas o sinal correto é `pagarme_sub_id`. Selecionar o campo e trocar a condição:

```ts
const sub = await step.run('buscar-assinatura', async () => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('subscriptions')
    .select('plan_type, expires_at, pagarme_sub_id')
    .eq('id', subscription_id)
    .single()
  return data
})

if (!sub || sub.pagarme_sub_id || !sub.expires_at) {
  return { skipped: 'assinatura-recorrente-no-pagarme' }
}
```

Remover o import de `isRecurringPlan` desse arquivo se não sobrar mais nenhum uso.

## Não mexer

- `src/components/patient/AssinaturaClient.tsx` — continua usando `isRecurringPlan` pra decidir se mostra o botão "Cancelar assinatura" na tela do paciente. Isso é só UI (na pior hipótese mostra um botão que a API já rejeita com a correção do item 1) — fora do escopo desses 4 achados, não mexer agora.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Nenhuma migration nova é necessária — os 4 itens são só lógica de aplicação.
