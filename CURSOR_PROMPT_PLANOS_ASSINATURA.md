# Volta pra 2 planos: avulso (parcelável até 6x) + assinatura recorrente de verdade

## Contexto

Depois de implementar 3meses/6meses como compra única parcelada (prompt anterior), o Diogo decidiu por um modelo diferente: **só 2 formas de compra**.

- **Avulso / compra única** — como já é hoje, mas agora com opção de parcelar em cartão em até 6x (sem trocar o valor total, só divide no cartão).
- **Assinatura** — recorrência de verdade na Pagar.me (cobrança automática todo mês, 15% de desconto, cliente cancela quando quiser). **Por cartão de crédito primeiro** — débito automático (Pagar.me "Débito Recorrente"/Pinless Debit) fica pra uma segunda etapa, porque exige acordo comercial prévio da conta com banco emissor e bandeira, fora do nosso controle. Não implementar débito agora, só deixar a estrutura pronta pra adicionar depois.

Isso desfaz parte do que fizemos no prompt de parcelamento (remover 3meses/6meses) e reaproveita o padrão de assinatura recorrente que já existia antes disso (é essencialmente voltar ao `chargeSubscription`/`/subscriptions` que foi removido, só que como plano principal, não legado).

## Parte 1 — `src/lib/plans.ts`

- `PURCHASE_PLAN_TYPES`: volta pra `['1mes', 'assinatura_mensal']` (remove `'3meses'`, `'6meses'` da lista de planos ofertáveis — pode manter os valores/funções que os tratam como legado, não precisa deletar código morto agora, só parar de oferecer).
- `DEFAULT_PURCHASE_PLAN`: `'1mes'`.
- `PLAN_LABELS`/`PLAN_TYPE_LABEL`: `'1mes': 'Compra única'`, `'assinatura_mensal': 'Assinatura'`.
- `PLAN_BADGE`: `'assinatura_mensal': '15% off · Cancele quando quiser'`.
- `PLAN_HINT`: `'1mes': 'Compra única — parcele em até 6x no cartão'`, `'assinatura_mensal': 'Cobrança mensal recorrente · Cancele quando quiser'`.
- `SUBSCRIPTION_DISCOUNT`: mudar de `0.1` pra `0.15` (15% de desconto, não mais 10%).
- `isRecurringPlan('assinatura_mensal')`: continua `true`.
- Não precisa remover as funções/constantes específicas de 3meses/6meses (`SUBSCRIPTION_DISCOUNT_3M`, `getPharmacyCycleMultiplier`, etc.) — só parar de expor esses planos em `PURCHASE_PLAN_TYPES`. Deixa como código não mais usado por enquanto, dá pra limpar depois com o Knip.

## Parte 2 — `src/app/api/checkout/create/route.ts`

- `checkoutSchema.plan_type`: `z.enum(['1mes', 'assinatura_mensal'])`.
- Reintroduzir a função de cobrança recorrente (equivalente ao `chargeSubscription` que foi removido no prompt anterior — reaproveitar a mesma estrutura: `POST /subscriptions` na Pagar.me, `interval: 'month'`, `interval_count: 1`, salva `pagarme_sub_id` na subscription).
- Para `plan_type === '1mes'`: continua no `chargeOneTimeOrder`, mas agora aceitando um novo campo `installments` no payload (1 a 6, validado no schema: `z.number().int().min(1).max(6).default(1)`) — repassar pro `installments` do `credit_card` da Pagar.me. Pix continua permitido só com `installments === 1` (parcelamento não existe em Pix) — se vier `payment_method === 'pix'` com `installments > 1`, retornar 400.
- Para `plan_type === 'assinatura_mensal'`: sempre cartão (Pix continua bloqueado, igual já é hoje pra plano recorrente), `installments` não se aplica (fica implícito 1, é cobrança recorrente mensal, não parcelamento de uma compra única).
- Resposta: manter o padrão de já existir hoje (`results.oneTime` pro avulso, adicionar de volta um `results.subscription` pra assinatura — o front antigo já sabia ler os dois formatos antes do prompt de parcelamento, é reaproveitar).

## Parte 3 — Front-end (`checkout/page.tsx`, `recomendacoes/page.tsx`)

- Seletor de forma de compra volta a ter só 2 opções (`PURCHASE_PLAN_TYPES` já reflete isso sozinho, os componentes que mapeiam sobre essa constante não precisam mudar de estrutura).
- No plano avulso, adicionar um seletor de parcelas (1x a 6x) — pode ser um dropdown ou botões simples, mostrando o valor de cada parcela (total ÷ N). Esse valor de `installments` selecionado precisa ir no body pro `/api/checkout/create`.
- Remover qualquer UI que ainda mostre "3 meses"/"6 meses" como opção (herdado do prompt anterior).

## Parte 4 — `src/lib/terms/content.ts`

A seção "Modelos de contratação" tem que voltar a descrever só 2 modelos (compra única — agora mencionando que pode ser parcelada em até 6x no cartão — e assinatura mensal recorrente com 15% de desconto). Bumpar `TERMS_VERSION` pra uma data nova. Como da última vez, isso é texto contratual — pode escrever um rascunho, mas sinalizar claramente que precisa da revisão do Diogo antes de considerar definitivo.

## Não mexer

- `src/lib/checkout/price.ts` — a lógica de `computeServerCheckoutTotal` não muda; `installments` não afeta o valor total cobrado, só como ele é dividido no cartão.
- `src/lib/protocol/create-from-checkout.ts`, `pharmacy-order.ts` — nada relacionado a farmácia muda aqui.
- Os 4 fixes do BugBot aplicados no round anterior (`pagarme_sub_id` como sinal de cancelamento, etc.) — continuam válidos e não precisam mudar, só voltam a ser usados de verdade agora que existe assinatura recorrente de novo.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Testar os 3 cenários: avulso 1x, avulso parcelado em 6x, assinatura recorrente (confirmar que salva `pagarme_sub_id` e que `/api/assinatura/cancelar` funciona pra ela).
