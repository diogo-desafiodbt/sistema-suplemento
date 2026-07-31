# Prompt para o Cursor — Correção: D+2 tem que ser dia útil, não corrido

O prompt anterior (CURSOR_PROMPT_PRAZO_ENTREGA.md) pedia que a data de
retirada fosse D+2 em DIAS ÚTEIS (pulando sábado e domingo), mas a
implementação atual em `src/lib/inngest/functions/create-shipping-label.ts`
soma dias corridos direto:

```js
pickup.setDate(pickup.getDate() + PICKUP_DAYS_AFTER_PURCHASE)
```

Isso está incorreto — precisa pular fim de semana. Corrigir assim:

1. Em `src/lib/shipping/estimate.ts`, adicionar:
```ts
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay() // 0 = domingo, 6 = sábado
    if (day !== 0 && day !== 6) added++
  }
  return result
}
```
(Não considera feriados nacionais, só fim de semana — isso é intencional por
enquanto.)

2. Em `src/lib/inngest/functions/create-shipping-label.ts`, trocar o cálculo
   de `pickupDate` pra usar essa função:
```ts
const pickup = addBusinessDays(new Date(sub.created_at), PICKUP_DAYS_AFTER_PURCHASE)
```
   em vez do `pickup.setDate(pickup.getDate() + PICKUP_DAYS_AFTER_PURCHASE)`
   atual. Remover o `new Date(sub.created_at)` + `setDate` manual que está lá
   hoje.

3. Rodar `tsc` de novo pra confirmar que não quebrou nada.
