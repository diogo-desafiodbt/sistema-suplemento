# Corrigir cobrança de 3/6 meses: parcelado no cartão, não assinatura recorrente

## Contexto

Os planos `3meses`/`6meses` foram implementados como **assinatura recorrente da Pagar.me** (`POST /subscriptions`, `interval_count: 3 ou 6`, `installments: 1`) — cobra o valor cheio do ciclo e repete sozinho a cada 3/6 meses.

O modelo correto é outro: **compra única, valor mensal × N, parcelado em N vezes no cartão** (`POST /orders`, `installments: 3 ou 6`). Não é recorrente — depois que as parcelas acabam, não cobra mais nada sozinho; se o cliente quiser continuar, precisa comprar de novo (igual ao avulso).

Isso muda mais que a chamada pra Pagar.me: muda também o que "cancelar assinatura" significa, e quem recebe lembrete de renovação.

## Parte 1 — `src/app/api/checkout/create/route.ts`

Unificar tudo no caminho de compra única (`/orders`), variando só o número de parcelas.

Em `chargeOneTimeOrder`, adicionar um parâmetro `installments: number` e usar no payload:

```ts
credit_card: {
  recurrence: false,
  installments: opts.installments, // 1, 3 ou 6
  statement_descriptor: 'DESAF DIABETS',
  card: opts.card!,
},
```

E no `description`/`code` do item, usar `planItemName(planType)` (já existe) em vez do texto fixo "Desafio Diabetes — Compra única".

**Remover `chargeSubscription` inteiramente** — não é mais chamada por lugar nenhum. Remover também o branch `if (!isRecurringPlan(planType)) { chargeOneTimeOrder } else { chargeSubscription }` no `POST` — sempre chamar `chargeOneTimeOrder` (agora com `installments` calculado a partir do `planType`: `planType === '6meses' ? 6 : planType === '3meses' ? 3 : 1`). Unificar os dois blocos de resposta HTTP que existem hoje (um pra `results.oneTime`, outro pra `results.subscription`) num só, sempre no formato `results.oneTime` (que já existe e o front já sabe ler).

Pix continua bloqueado pra qualquer `plan_type !== '1mes'` — isso já está validado antes, não precisa mudar.

## Parte 2 — `src/lib/plans.ts`

`isRecurringPlan`: `3meses` e `6meses` **não são mais recorrentes** (não existe mais assinatura Pagar.me por trás). Só `assinatura_mensal` e `1ano` (legado, sem uso hoje) continuam true:

```ts
export function isRecurringPlan(planType: string): boolean {
  return planType === 'assinatura_mensal' || planType === '1ano'
}
```

**Nenhum dos três planos é assinatura — os três são compra única.** A diferença entre eles é só quanto tempo de tratamento cobre e como é pago (1 mês: à vista no Pix ou no cartão; 3/6 meses: parcelado no cartão). Tirar a palavra "Assinatura" de todo lugar que nomeia esses planos:

```ts
export const PLAN_LABELS: Record<string, string> = {
  '1mes': 'Compra única',
  '3meses': 'Trimestral',
  '6meses': 'Semestral',
  assinatura_mensal: 'Assinatura mensal', // legado — esse sim é recorrente de verdade
  '1ano': 'Anual', // legado
}

export const PLAN_TYPE_LABEL: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única',
  '3meses': 'Trimestral',
  '6meses': 'Semestral',
}
```

`PLAN_BADGE` e `PLAN_HINT` também estão com texto errado pra esse modelo — trocar "Cobrança a cada 3/6 meses" e "Cancele quando quiser" (não se aplica, é uma compra fechada, parcelada, sem renovação) por:

```ts
export const PLAN_BADGE: Record<PurchasePlanType, string> = {
  '1mes': '',
  '3meses': '10% off · Parcelado em 3x no cartão',
  '6meses': '15% off · Parcelado em 6x no cartão · Maior desconto',
}

export const PLAN_HINT: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única — à vista no Pix ou no cartão',
  '3meses': 'Compra única — parcelado em 3x no cartão, sem renovação automática',
  '6meses': 'Compra única — parcelado em 6x no cartão, sem renovação automática · Maior desconto',
}
```

`planItemName()` em `checkout/create/route.ts` usa `PLAN_LABELS` pra montar a descrição do item enviado à Pagar.me (o que aparece no painel deles e, possivelmente, na fatura do cartão do cliente) — corrigindo `PLAN_LABELS` isso já sai certo sozinho, não precisa mexer em `planItemName`.

## Parte 3 — `src/lib/inngest/functions/purchase-confirmed.ts`

`formatPlanLabel` também chama 3/6 meses de "Assinatura trimestral"/"Assinatura semestral" (usado no e-mail de confirmação de compra). Corrigir só esses dois casos — manter `'assinatura_mensal': 'Assinatura mensal'` como está, esse é o único plano (legado) que é assinatura de verdade:

```ts
function formatPlanLabel(planType: string | null | undefined): string {
  switch (planType) {
    case '3meses':
      return 'Trimestral'
    case '6meses':
      return 'Semestral'
    case '1ano':
      return 'Anual'
    case 'avulso':
    case '1mes':
      return 'Compra única'
    case 'assinatura_mensal':
      return 'Assinatura mensal'
    default:
      return planType ?? ''
  }
}
```

## Parte 4 — `src/lib/terms/content.ts` (Termos de Uso — revisar o texto antes de publicar)

A seção "Modelos de contratação" hoje só descreve dois formatos ("Compra única" e "Assinatura mensal recorrente") — não existe nenhuma menção ao parcelamento em 3x/6x, que é o que o cliente de fato vai aceitar no checkout desses planos. Isso precisa ser coberto no texto que a pessoa aceita de verdade.

**Atenção**: diferente do resto desse prompt, isso é texto contratual — a proposta abaixo é um rascunho pra você (ou seu advogado) revisar antes de valer como termo real. Não é pra aplicar cegamente só porque está aqui.

Proposta — substituir o bloco atual (logo após `## Modelos de contratação`) por:

```
Três formatos estão disponíveis no Desafio Diabetes:

- **Compra única (1 mês)** — cobrança isolada referente ao período contratado, à vista no Pix ou no cartão de crédito, sem renovação automática.
- **Compra única parcelada (3 ou 6 meses)** — cobrança isolada referente ao período contratado (3 ou 6 meses de tratamento), autorizada uma única vez no cartão de crédito e dividida em 3 ou 6 parcelas na fatura, conforme o plano escolhido. Não é uma assinatura: não há renovação automática ao final do período, e por ser uma compra parcelada já autorizada integralmente no ato da compra, não é possível interromper o parcelamento depois — a regra é a mesma de qualquer compra parcelada em outro estabelecimento.
- **Assinatura mensal recorrente** — com desconto no valor do plano, cobrança automática mensal no cartão cadastrado, renovando-se a cada mês até que você solicite o cancelamento.

Cancelar é possível a qualquer momento, direto pela sua conta, exclusivamente no modelo de assinatura mensal recorrente — ciclos futuros ainda não processados não geram cobrança. Esse direito não se aplica à compra única parcelada (3 ou 6 meses), já autorizada integralmente no ato da compra.

Um ciclo é considerado "processado" quando a cobrança já foi feita e o pedido já entrou no fluxo de compra junto à farmácia parceira. Cancelamentos solicitados depois disso só produzem efeito nos ciclos seguintes.
```

Se o Diogo aprovar esse texto (ou uma versão ajustada), **atualizar também `TERMS_VERSION`** no topo do arquivo pra uma data nova (ex.: data de hoje) — o hash de aceite (`recordTermsAcceptance` em `checkout/create/route.ts`) é calculado a partir de `TERMS_CONTENT + TERMS_VERSION`, então mudar o texto sem mudar a versão faz aceites antigos e novos ficarem com o mesmo hash mesmo com conteúdo diferente.

## Parte 5 — `src/lib/inngest/functions/avulso-renewal-reminder.ts`

Hoje só avisa quem está com `plan_type === '1mes'` que o tratamento está acabando (linha ~222: `if (!sub || sub.plan_type !== '1mes' || ...)`). Como `3meses`/`6meses` também não renovam mais sozinhos, quem comprou esses planos precisa do mesmo lembrete. Trocar a condição pra usar `isRecurringPlan` (depois da Parte 2, isso já cobre certo):

```ts
if (!sub || isRecurringPlan(sub.plan_type) || !sub.expires_at) {
  return { skipped: 'plano-e-recorrente' }
}
```

Importar `isRecurringPlan` de `@/lib/plans`. Checar o corpo do e-mail/copy dessa function — se em algum lugar o texto disser algo tipo "sua compra avulsa está acabando", generalizar pra não soar estranho pra quem comprou parcelado em 3x/6x (algo tipo "seu protocolo está chegando ao fim").

## Parte 6 — `src/app/api/assinatura/cancelar/route.ts`

Hoje essa rota cancela **qualquer** subscription ativa, sem checar o plano — se alguém chamar essa rota pra um plano `3meses`/`6meses` (que já foi pago integralmente, parcelado), ela marcaria `status: 'canceled'` mesmo sem existir nada de fato pra cancelar na Pagar.me. O front (`AssinaturaClient.tsx`) já vai parar de mostrar o botão pra esses planos automaticamente (ele usa `isRecurringPlan`, que a Parte 2 corrige), mas a rota em si deve se proteger também. Adicionar checagem logo após buscar a `subscription`:

```ts
import { isRecurringPlan } from '@/lib/plans'
// ...
if (!isRecurringPlan(subscription.plan_type)) {
  return NextResponse.json(
    { error: 'Este plano foi pago integralmente e não pode ser cancelado.' },
    { status: 400 }
  )
}
```

## Parte 7 — Disclaimer + FAQ em `src/app/(public)/recomendacoes/page.tsx`

Logo abaixo do botão "Garantir meu protocolo" (dentro do mesmo card branco, ou num bloco novo logo em seguida — o que ficar mais natural no layout), adicionar um aviso curto:

```
Vale lembrar:
— Este protocolo é uma sugestão inicial. A partir dele, um profissional habilitado do Desafio Diabetes avalia seu caso e define, quando necessário, sua prescrição.
— Os suplementos são manipulados e dispensados por farmácias credenciadas pela Anvisa.
```

Sem link pra "lista de farmácias" — hoje só temos a Miligrama como parceira, não prometer uma lista que não existe.

Abaixo disso, uma seção de perguntas frequentes (accordion, mesmo padrão visual dos accordions já usados em `src/app/suplementos/[slug]/page.tsx`). Rascunho de perguntas — ajuste o texto e adicione/remova o que fizer sentido, isso é um ponto de partida, não conteúdo final:

```
P: Isso é uma assinatura?
R: Não. Toda compra é única — à vista (1 mês) ou parcelada no cartão (3 ou 6 meses). Não existe cobrança automática depois que o pedido é pago.

P: Como funciona a avaliação profissional?
R: Depois da sua triagem, um profissional habilitado do Desafio Diabetes analisa suas respostas e define os suplementos indicados para o seu caso antes de qualquer manipulação.

P: Posso trocar os suplementos do meu protocolo?
R: Você pode remover itens complementares que não quiser levar, mas não é possível adicionar suplementos que não foram indicados na sua avaliação.

P: Posso cancelar minha compra?
R: Compras à vista ou parceladas em 3x/6x são cobradas integralmente no ato da compra, como qualquer compra parcelada — não há cobrança futura a cancelar.

P: Quem manipula os suplementos?
R: Farmácias de manipulação credenciadas pela Anvisa, de forma individualizada, conforme a prescrição do seu protocolo.
```

Manter o mesmo componente de accordion (abre/fecha) já usado na página de produto, pra não introduzir um padrão visual novo.

## Parte 8 — Imagem da linha de suplementos em `src/app/(public)/recomendacoes/page.tsx`

Já existe o arquivo `public/linha-suplementos.png` (1024×1024, foto de produto da linha Desafio Diabetes). Adicionar logo no início do `<main>`, **depois do `<header>` com a linha do tempo (Protocolo/Checkout/Prescrição/Entrega) e antes do bloco "SEU PROTOCOLO" / "Este é o protocolo prescrito para você"** — full width do container de conteúdo, cantos arredondados, com `next/image` (a página já não é `'use client'`-restrita a ponto de impedir isso; usar `Image` como já é feito em `suplementos/[slug]/page.tsx`):

```tsx
<Image
  src="/linha-suplementos.png"
  alt="Linha de suplementos Desafio Diabetes"
  width={1024}
  height={1024}
  priority
  className="w-full max-h-72 md:max-h-96 object-cover rounded-2xl"
/>
```

Colocar isso dentro do `<main>`, antes do `<div className="lg:grid ...">` que hoje é o primeiro elemento — não dentro da coluna esquerda, e sim ocupando a largura toda do `max-w-2xl lg:max-w-5xl mx-auto` que já envolve o conteúdo.

**Atenção**: a imagem mostra nomes de produtos (Resistência à Insulina, Probiótico Avançado, Vitamínico A-Z, Equilíbrio Glicêmico, Enzimas Digestivas, Equilíbrio Metabólico) que não batem com o catálogo real hoje (Berberina, Ácido Fólico, Polivitamínico, Neuropatia, Ômega 3). Isso é esperado se for só uma imagem de marca/ambientação — mas vale o Diogo confirmar que não quer trocar por uma imagem com os produtos reais antes de publicar, já que a sessão toda foi sobre não prometer nada que não bate com o que existe de fato.

## Não mexer

- `src/lib/checkout/price.ts` — o cálculo do valor total (`getChargePrice`, mensal × N × desconto) já é exatamente o valor certo pra mandar como `amount` total no `/orders`; a Pagar.me divide sozinha em N parcelas. Nada muda aqui.
- O multiplicador de quantidade física pra farmácia (`getPharmacyCycleMultiplier`, `create-from-checkout.ts`, `pharmacy-order.ts`) — isso é sobre quanto produto é despachado, não tem relação com como o pagamento é cobrado. Não mexer.
- `src/app/(public)/checkout/page.tsx` já usa `PLAN_HINT`/`PLAN_BADGE` de `plans.ts` — o texto atualiza sozinho com a Parte 2, não precisa editar essa página. `recomendacoes/page.tsx` só é editada pela Parte 7 (disclaimer + FAQ) — o resto da página (seletor de plano, preço) já lê de `plans.ts` e também atualiza sozinho.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Testar os 3 planos: avulso (1x), 3 meses (3x no cartão), 6 meses (6x no cartão) — conferir no payload enviado pra Pagar.me (log ou Dashboard da Pagar.me em modo teste) que `installments` bate com o plano e que a chamada é pra `/orders`, não `/subscriptions`.
- Confirmar que a tela de assinatura do paciente não mostra mais "Cancelar assinatura" pra compras de 3/6 meses, e mostra "Válido até X" (não "Próximo ciclo até X").

## Fora do escopo — verificar com a Pagar.me

Se as parcelas de 3x/6x saem **sem juros** pro cliente depende da configuração da conta Pagar.me/adquirente (não é algo controlado por parâmetro na chamada da API) — o Diogo precisa confirmar isso direto no painel da Pagar.me, fora do código.
