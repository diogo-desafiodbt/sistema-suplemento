# Reestruturação por compliance regulatório — fim do modelo "marketplace"

## Contexto (leia antes de mexer em qualquer coisa)

Recebemos um Parecer de Compliance Regulatório (advocacia contratada pela Miligrama, nossa farmácia parceira) apontando risco jurídico **alto** no fluxo atual: o usuário vê e escolhe suplementos manipulados (adiciona ao carrinho, monta protocolo) **antes** de qualquer avaliação por profissional habilitado. A RDC nº 67/2007 exige que a preparação magistral decorra de avaliação clínica individualizada, não de escolha livre do consumidor tipo catálogo. Isso também aumenta risco de propaganda enganosa (CDC art. 6º/37) por causa da linguagem de "tratamento" associada ao título "Dr." usado por alguém sem formação médica.

**Decisão de produto**: vamos imitar o modelo da **Manual** (telemedicina — questionário → "vai ser avaliado por um profissional habilitado" → só depois o tratamento é definido e liberado para compra). Isso significa:

- Ninguém vê ou escolhe produtos específicos antes de passar pelo questionário.
- Depois do questionário, a tela seguinte não é mais "monte seu carrinho" — é "aqui está o que foi prescrito para você" (a avaliação/triagem clínica já é instantânea hoje via regras — ela continua sendo, só muda o enquadramento: não é mais o cliente escolhendo, é o resultado de uma avaliação).
- A pessoa paga **imediatamente** depois de escolher a forma de compra (avulso, assinatura 3 meses ou assinatura 6 meses) — não há espera humana síncrona antes do pagamento.
- **O carrinho misto (avulso + assinatura no mesmo pedido) deixa de existir.** Não faz mais sentido: não há mais "escolha livre de produtos", existe um protocolo prescrito e UMA forma de compra pra ele inteiro.
- A vitrine pública `/suplementos` deixa de ser uma loja (sem "adicionar ao carrinho") e vira uma página explicativa que leva pro questionário.

Isso reverte parte do que construímos essa sessão (carrinho misto, assinatura por item) — é esperado, não é regressão por erro.

**Não mexer**: `src/lib/protocol/create-from-checkout.ts` (ensureProtocolAfterPayment) além do indicado explicitamente na Parte 4, `src/lib/shipping/create-label.ts`, `src/app/api/prescricao/assinar/route.ts`.

---

## Parte 1 — Novos planos de compra em `src/lib/plans.ts`

Trocar o modelo de "compra única / assinatura mensal" por "compra única / assinatura 3 meses / assinatura 6 meses". Pagar.me cobra **por ciclo completo** (não mensal): o valor da cobrança de 3 meses é `preço_mensal × 3 × (1 - 10%)`; o de 6 meses é `preço_mensal × 6 × (1 - 15%)`. `interval_count` no Pagar.me passa a ser 3 ou 6 (hoje é sempre 1).

**Importante — compatibilidade retroativa**: clientes que já têm `plan_type = 'assinatura_mensal'` ativo continuam sendo cobrados mensalmente pela assinatura Pagar.me deles normalmente (isso é controlado pela própria Pagar.me, não pelo nosso cron). Não remover `'assinatura_mensal'` de `getChargePrice`, `getUnitPriceFromProduct`, `isRecurringPlan`, `addPlanPeriod`, `PLAN_LABELS` — só parar de OFERECER esse plano em compras novas. Ele deve continuar reconhecido em todo lugar que já existe (dashboard de assinatura do cliente, etc.).

Mudanças em `src/lib/plans.ts`:

```ts
export const PURCHASE_PLAN_TYPES = ['1mes', '3meses', '6meses'] as const
export const DEFAULT_PURCHASE_PLAN: PurchasePlanType = '3meses'

export const SUBSCRIPTION_DISCOUNT_3M = 0.10
export const SUBSCRIPTION_DISCOUNT_6M = 0.15

export const PLAN_LABELS: Record<string, string> = {
  '1mes': 'Compra única',
  '3meses': 'Assinatura trimestral',
  '6meses': 'Assinatura semestral',
  assinatura_mensal: 'Assinatura', // legado, manter p/ clientes antigos
  '1ano': 'Anual', // legado
}

export const PLAN_TYPE_LABEL: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única',
  '3meses': 'Assinatura trimestral',
  '6meses': 'Assinatura semestral',
}

export const PLAN_BADGE: Record<PurchasePlanType, string> = {
  '1mes': '',
  '3meses': '10% off · Cobrança a cada 3 meses',
  '6meses': '15% off · Cobrança a cada 6 meses',
}

export const PLAN_HINT: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única, sem renovação automática',
  '3meses': 'Cobrança a cada 3 meses · Cancele quando quiser',
  '6meses': 'Cobrança a cada 6 meses · Cancele quando quiser · Maior desconto',
}
```

`getChargePrice(priceMonthly, planType)` — preço TOTAL do ciclo (não mensal):
```ts
export function getChargePrice(priceMonthly: number, planType: string): number {
  if (planType === '3meses') return roundMoney(priceMonthly * 3 * (1 - SUBSCRIPTION_DISCOUNT_3M))
  if (planType === '6meses') return roundMoney(priceMonthly * 6 * (1 - SUBSCRIPTION_DISCOUNT_6M))
  if (planType === 'assinatura_mensal') return roundMoney(priceMonthly * (1 - 0.10)) // legado, não tocar
  if (planType === '1ano') return priceMonthly // legado
  return priceMonthly // 1mes
}
```
Ajustar `getUnitPriceFromProduct` na mesma lógica (hoje usa `price_quarterly`/`price_yearly` direto do produto — decidir se `3meses`/`6meses` novos usam esses campos existentes do produto ou calculam a partir de `price_monthly` com o desconto acima; **use o cálculo a partir de `price_monthly` com desconto, não os campos `price_quarterly`/`price_yearly` do produto**, para manter os 10%/15% consistentes independente do que estiver cadastrado nesses campos legados).

`addPlanPeriod`: adicionar branch pra `'6meses'` (+6 meses); `'3meses'` já existe (+3 meses) — conferir que ainda funciona.

`isRecurringPlan`: incluir `'3meses'` e `'6meses'` como recorrentes (junto com `assinatura_mensal`, `1ano` legado).

`getPharmacySkuKey`: **não criar SKU novo agora**. Para `3meses`/`6meses`, a farmácia vai manipular/despachar o equivalente a 3× ou 6× a quantidade mensal de cada item, usando o SKU mensal existente (`pharmacy_sku_monthly`) — ou seja, a quantidade enviada pro pedido da farmácia (`computePackageDimensions`, cálculo de peso/pacote) deve multiplicar `quantity` do item por 3 ou por 6 conforme o plano escolhido, ao montar o pedido em `pharmacy-order.ts` e em `create-from-checkout.ts` (onde quer que a quantidade do item vire quantidade física a manipular). **Isso é uma decisão operacional (tamanho/peso de uma caixa de 6 meses de suplemento) que o Diogo ainda vai validar com a Miligrama** — implemente dessa forma por enquanto (mais simples, sem migration), mas deixe um comentário no código sinalizando que isso pode mudar.

---

## Parte 2 — Reverter o carrinho misto

### 2a. `src/app/api/checkout/create/route.ts`

Remover inteiramente o bloco `if (isMixed) { ... }` (cobrança dupla) e a lógica de split `subscribedItems`/`oneTimeItems`. Voltar a um único fluxo de cobrança, agora parametrizado por um `plan_type` de nível superior (não mais por item):

- `checkoutSchema`: remover `subscribed` de `protocolItemSchema`; adicionar `plan_type: z.enum(['1mes', '3meses', '6meses'])` no nível raiz do schema (como existia antes do carrinho misto, só que com 3 opções em vez de 2).
- Pix: continua bloqueado quando `plan_type !== '1mes'` (qualquer assinatura exige cartão).
- `chargeSubscription`: passar `interval_count: data.plan_type === '6meses' ? 6 : 3` pro payload da Pagar.me (hoje não tem esse campo — adicionar).
- Manter os dois bugs corrigidos nessa sessão (multiplicação por quantidade em `getPrice`/preços, e checagem de `paid` antes de considerar a cobrança bem-sucedida) — eles continuam válidos no fluxo único.

### 2b. `src/lib/checkout/price.ts`

`planForItem` hoje prioriza `item.subscribed` por item. Remover esse campo — a função de preço passa a usar só o `planType` de nível superior (`computeServerCheckoutTotal(admin, { planType, protocolItems, shipping, address, includeShipping })`, sem branch por item). `getUnitPriceFromProduct` já reflete a Parte 1.

### 2c. Cliente: `src/lib/use-cart.ts` e `src/components/CartDrawer.tsx`

**Deletar os dois arquivos.** Não há mais carrinho de compras — a jornada não passa mais por "adicionar produto ao carrinho" antes do questionário.

### 2d. `src/components/Header.tsx`

Remover o ícone/badge de carrinho e o `<CartDrawer />` (linhas que importam `useCart`, `CartDrawer`, calculam `cartCount`, renderizam o badge e o componente).

### 2e. `src/app/(public)/quiz/page.tsx`

Remover toda a lógica de itens vindos do carrinho (`cartSnapshot`, `cartQtyByKey`, `cartSubscribedByKey`, `hadCartOnEntry` e os branches que mesclam itens do carrinho com os da triagem). O questionário agora sempre começa "limpo" — os únicos itens que chegam em `protocol_items` são os que a lógica clínica da triagem determina (obrigatórios + complementares elegíveis, bloqueados já excluídos — ver Parte 3).

### 2f. `src/app/(public)/recomendacoes/page.tsx`

- Remover `toggleSubscribed`, `itemPlan`, o botão "Assinar e economizar 10%" por item, e qualquer referência a `item.subscribed`.
- Remover a exibição de itens bloqueados na lista (hoje aparecem com badge "Bloqueado por segurança" e `opacity-40`) — **filtrar esses itens fora antes de renderizar**, eles não devem aparecer na tela (feedback já dado: comportamento "igual ao manual" — só mostra o que pode).
- Manter `toggleItem` (remover/adicionar item complementar da lista prescrita) — isso continua fazendo sentido: o profissional/triagem prescreve um conjunto, o paciente pode tirar o que não quiser, mas não pode adicionar algo que não foi prescrito.
- Adicionar um seletor de forma de compra único para o protocolo inteiro (substituindo o toggle por item): três opções — Compra única / Assinatura trimestral (10% off) / Assinatura semestral (15% off) — pré-selecionar `3meses` como padrão (ajustável depois).
- Copy: trocar o texto de abertura (hoje "Confira os itens de X. Assine individualmente os que quiser renovar todo mês") por algo como "Este é o protocolo prescrito para você" / "Avaliado por um profissional habilitado do Desafio Diabetes" — texto exato fica a critério do Diogo depois, mas a mensagem deve deixar claro que isso resultou de uma avaliação, não de escolha livre.
- `getPrice`/`getTotalPrice`: usar o `planType` único selecionado, não mais por item.

### 2g. `src/app/(public)/checkout/page.tsx`

- Remover `LocalProtocolItem.subscribed`, `itemPlan`/`hasSubscribedItems`, a lógica de `results.oneTime`/`results.subscription` parcial (isso era só do carrinho misto — volta a ser uma resposta única).
- `body` enviado pro `/api/checkout/create`: incluir `plan_type` no nível raiz de novo (voltando ao formato pré-carrinho-misto, com os 3 valores possíveis).
- Manter a correção do bug 2 (checar `paid === true` antes de redirecionar pro `/obrigado`), agora simplificada pra um único resultado (`results.oneTime` ou `results.subscription`, não os dois).
- Manter a correção do bug 1 (`getPrice` multiplicando por quantidade).

---

## Parte 3 — Farmácia: fechar o buraco do pull API

**Achado durante a análise, não mencionado nos áudios mas é o mesmo risco do parecer**: `src/app/api/farmacia/pedidos/json/route.ts` (e `route.ts` em `/api/farmacia/pedidos`) devolvem qualquer pedido com `pharmacy_json` preenchido, sem checar se o protocolo vinculado já foi assinado por um profissional. Como `pharmacy-order.ts` monta o `pharmacy_json` logo após o pagamento — antes da assinatura —, hoje é tecnicamente possível puxar via API um pedido cujo protocolo ainda está `pending_signature`.

Corrigir os dois endpoints: fazer join de `orders` → `subscriptions` → `protocols` e só retornar pedidos cujo protocolo tenha `status = 'signed'`. Pedidos com protocolo ainda não assinado devem ser omitidos da resposta (não é erro, é filtro).

---

## Parte 4 — `/suplementos`: de vitrine pra página explicativa

Requisitos funcionais (o visual fino fica pra uma iteração à parte, com o subagent `ui-designer` que já instalei em `.claude/agents/ui-designer.md` — ele foi puxado do repo `VoltAgent/awesome-claude-code-subagents`, 24k estrelas, é um agente de design de interface genérico; não espere que ele "converse" com um `context-manager" — essa parte do prompt dele é de um framework multiagente que não temos, pode ignorar):

- Tirar os banners/grid de produtos com "adicionar ao carrinho" da página principal `/suplementos`.
- No lugar, um texto explicando o modelo de suplementação para diabéticos (conteúdo definitivo fica com o Diogo/Iana depois — por ora, pode usar um texto simples e honesto sobre o programa, sem prometer cura/tratamento).
- Botão principal: **"Descubra sua suplementação ideal"**, levando direto pro `/quiz`.
- `src/app/suplementos/[slug]/page.tsx` (página de cada produto): manter conteúdo informativo (composição, modo de uso, descrição) — **remover qualquer "adicionar ao carrinho"/seletor de quantidade**. Terminar a página com a mesma CTA "Descubra sua suplementação ideal" → `/quiz`.
- `src/components/CategoryCarousel.tsx`: remover a chamada de `addItem`/carrinho; pode continuar existindo como carrossel informativo (sem ação de compra) ou ser removido da home, à critério de quem for montar o visual.

---

## Parte 5 — Comunicação institucional (levantamento, não reescrever sozinho)

Não reescrever textos de marketing/institucional automaticamente — é conteúdo sensível juridicamente. Só fazer o levantamento e reportar de volta pro Diogo:

- `grep -rn "Dr\.\|Dr " src/lib/supplements-content.ts src/app/institucional src/components` — todo lugar que usa o título "Dr." associado ao Turi Souza.
- `grep -rin "cura\|tratar\|tratamento definitivo\|elimina" src/lib/supplements-content.ts src/app/institucional` — linguagem que promete cura/resultado.

Devolver a lista de arquivos/linhas encontrados no relatório final, sem editar o texto.

---

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Testar manualmente os 3 planos (avulso, trimestral, semestral) de ponta a ponta: quiz → recomendações (sem carrinho prévio, sem itens bloqueados visíveis) → escolha de plano → pagamento → `/obrigado` só quando `paid === true`.
- Confirmar que `/api/farmacia/pedidos/json` não retorna pedido de protocolo não assinado (criar um protocolo de teste sem assinar e chamar o endpoint).
- Reportar a lista de textos com "Dr." / linguagem de cura encontrados (Parte 5), sem ter editado nada.
