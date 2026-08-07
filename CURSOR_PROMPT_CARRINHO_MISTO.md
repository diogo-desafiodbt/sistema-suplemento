# Prompt para o Cursor — Carrinho misto (assinatura + compra única no mesmo checkout)

Hoje o carrinho tem **um plano só pra tudo** (`plan: PlanType` no `useCart`,
threaded por `/quiz` → `/recomendacoes` → `/checkout` como um valor único
`plan_type` no payload). Esta tarefa muda isso pra **por item**: cada
produto no carrinho pode ser "avulso" ou "assinatura" independentemente,
com um botão "Assinar" por item.

Duas cobranças separadas no Pagar.me (uma `/orders`, uma `/subscriptions`)
continuam acontecendo por baixo — igual ao que a PuraVida e outras
plataformas de assinatura fazem — mas o resultado pro paciente é **um
protocolo/prescrição só** e **um envio/frete só**. Decisão confirmada com
o Diogo antes de escrever este prompt.

**Escopo importante**: carrinho misto só existe quando alguém entra em
`/suplementos` e monta o carrinho manualmente (fluxo "carrinho cheio", que
já hoje reaproveita boa parte da mesma tela `/quiz`). O fluxo antigo de
"carrinho vazio" (`/quiz` sugerindo produto sozinho) continua gerando um
plano único pra tudo — não precisa de botão de assinar item a item, já que
não existe "carrinho" nesse caminho. Não mexer nesse caminho.

============================================================
PARTE 1 — Carrinho: assinar por item + tela mais larga
============================================================

1.1 — `src/lib/use-cart.ts`: `CartItem` ganha um campo novo
`subscribed: boolean` (default `false` ao adicionar). O campo `plan` no
nível do `CartStore` **sai** — não existe mais "plano do carrinho", só
"plano por item". Ajustar:
- `normalizeItem`: aceitar/normalizar `subscribed` (default `false` se
  ausente — carrinho salvo antes desta mudança continua funcionando).
- `addItem`: aceitar `subscribed?: boolean` (default `false`) em vez de
  `plan: PlanType`.
- Novo método `toggleSubscribed(productId: string)`: inverte o campo
  `subscribed` daquele item específico.
- `chargeTotal`: somar `getChargePrice(item.price_monthly, item.subscribed ? 'assinatura_mensal' : '1mes') * item.quantity` por item, em vez de aplicar um plano global.
- Remover `setPlan`/`plan` do retorno do hook — não existe mais.

1.2 — Todo lugar que hoje chama `addItem({ ..., plan: cartPlan })` (checar
`CategoryCarousel.tsx`, `AddedToCartDialog`, página de produto
`suplementos/[slug]/page.tsx`, e qualquer outro `addItem` no repo) passa a
chamar sem `plan` — o item entra como avulso por padrão (`subscribed`
ausente = `false`), a pessoa decide "assinar" depois, no carrinho.

1.3 — `src/components/CartDrawer.tsx`:
- Remover o seletor de "Forma de compra" no topo (não existe mais escolha
  global).
- A tela do `SheetContent` fica mais larga: mudar a classe do componente
  pra algo como `className="w-full sm:max-w-xl"` (hoje herda
  `sm:max-w-sm` do componente base `sheet.tsx` — não mexer no
  `sheet.tsx` compartilhado, só sobrescrever aqui via `className`, que já
  tem prioridade por causa do `cn()` no componente base).
- Cada item da lista ganha um botão/toggle "Assinar e economizar 10%" (ou
  "Assinando ✓" quando já ativo) chamando `toggleSubscribed(item.product_id)`.
  Mostrar o preço da linha já refletindo avulso vs. assinatura conforme o
  toggle daquele item específico (reaproveitar `getChargePrice` por item,
  não mais por carrinho inteiro).
- O resumo do rodapé (`Total`) soma tudo (`chargeTotal` já calcula certo
  após a mudança 1.1) — trocar o texto `{plan === 'assinatura_mensal' ?
  '/mês' : ''}` por algo mais genérico tipo "Total hoje" com uma nota
  pequena abaixo tipo "Itens em assinatura renovam automaticamente todo
  mês" **só se houver pelo menos 1 item assinado** no carrinho.

============================================================
PARTE 2 — Threading pelo funil (quiz → recomendações → checkout)
============================================================

O formato salvo em `sessionStorage['protocol_items']` (usado por
`/quiz`, `/recomendacoes`, `/checkout`) precisa carregar o `subscribed`
por item a partir de agora. Em `src/app/(public)/quiz/page.tsx`, na
função que monta os itens quando o carrinho já vem preenchido (`useCart()`
não vazio ao entrar): incluir `subscribed: cartItem.subscribed` em cada
`protocol_items` gerado a partir do carrinho.

Em `src/app/(public)/recomendacoes/page.tsx`: essa tela já lista os itens
com toggle de remover/adicionar — adicionar um toggle irmão de "Assinar"
por item (mesmo padrão visual do carrinho), lendo/gravando o campo
`subscribed` de cada `LocalProtocolItem`. Preço da linha usa o mesmo
`getChargePrice` por item. **Remover** o seletor de plano global que essa
tela tem hoje (`PURCHASE_PLAN_TYPES.map(...)`, `planLocked` etc.) — não
faz mais sentido com plano por item.

Em `src/app/(public)/checkout/page.tsx`: mesma coisa — remover o seletor
de plano global (`plan`/`setPlan` state), mostrar preço por item conforme
`subscribed`, e montar o payload final do POST com o formato novo da
Parte 3 (em vez de `plan_type: plan` único).

============================================================
PARTE 3 — Payload do checkout: grupos em vez de plano único
============================================================

Em `src/app/api/checkout/create/route.ts`, o `checkoutSchema` (zod) muda:

```ts
const checkoutSchema = z.object({
  // Substitui plan_type único — cada protocol_item já carrega subscribed.
  total_amount: z.number().positive(),
  source: z.enum(['full_quiz', 'mini_quiz']),
  quiz: z.object({ /* inalterado */ }),
  protocol_items: z.array(
    protocolItemSchema.extend({ subscribed: z.boolean().default(false) })
  ).min(1),
  shipping: z.object({ /* inalterado */ }),
  address: z.object({ /* inalterado */ }),
  payment_method: z.enum(['credit_card', 'pix']),
  terms_accepted: z.literal(true),
  card: z.object({ /* inalterado */ }).optional(),
  cpf: z.string(),
})
```

Regra de validação nova: se **qualquer** item tiver `subscribed: true`,
`payment_method` só pode ser `'credit_card'` (Pix não existe pra
assinatura — mesma regra que já existe hoje pro plano único, só que agora
verificando por item):
```ts
const hasSubscribedItem = data.protocol_items.some(
  (i) => i.subscribed && !i.removed && !i.blocked
)
if (data.payment_method === 'pix' && hasSubscribedItem) {
  return NextResponse.json(
    { error: 'Pix disponível apenas quando nenhum item está em assinatura' },
    { status: 400 }
  )
}
```

============================================================
PARTE 4 — Orquestração de 1 ou 2 cobranças (o núcleo da tarefa)
============================================================

**Princípio central: NÃO mexer em `ensureProtocolAfterPayment` nem em
`create-from-checkout.ts`.** Essas funções já são a peça mais
testada/hardenizada do sistema (5 rodadas de correção de corrida). Toda a
lógica nova fica em `checkout/create/route.ts`, orquestrando por cima.

4.1 — Logo após validar o payload, dividir os itens ativos
(`!removed && !blocked`) em dois grupos:
```ts
const activeItems = data.protocol_items.filter((i) => !i.removed && !i.blocked)
const subscribedItems = activeItems.filter((i) => i.subscribed)
const oneTimeItems = activeItems.filter((i) => !i.subscribed)
```
Se um dos dois grupos estiver vazio, o fluxo é **exatamente o de hoje**
(uma cobrança só) — reaproveitar 100% do código atual pra esse caso,
sem passar pelo caminho novo da Parte 4.2. Só quando **os dois grupos
têm item** é que entra a orquestração nova.

4.2 — Frete: cotar **uma vez só**, pro peso combinado dos dois grupos
(chamar `computeServerCheckoutTotal` com `activeItems` completo — não por
grupo — só pra obter a cotação de frete certa pro pacote inteiro). Depois,
calcular o total de cada grupo separadamente **sem frete** (chamar de
novo, ou fatorar `computeServerCheckoutTotal` pra aceitar um parâmetro tipo
`includeShipping: boolean` — se `false`, devolve `shipping.valor: 0` e
`serverTotal = productsSubtotal`). Regra de negócio: **o frete inteiro
vai embutido na cobrança avulsa** (`/orders`), nunca na assinatura — pra
não fazer a mensalidade do mês seguinte aparecer menor que a do primeiro
mês só porque o frete do 1º mês foi cobrado dentro da assinatura. Se o
carrinho não tiver nenhum item avulso (100% assinatura), o comportamento
já existente se aplica normalmente (frete embutido na assinatura, como já
é hoje).

4.3 — Criar **duas linhas em `subscriptions`** (reaproveitando o insert
que já existe, chamado duas vezes com dados diferentes):
- Uma com `plan_type: '1mes'`, `pending_checkout.protocol_items` = só
  `oneTimeItems`, valor = subtotal desse grupo + frete inteiro.
- Uma com `plan_type: 'assinatura_mensal'`, `pending_checkout.protocol_items`
  = só `subscribedItems`, valor = só o subtotal desse grupo (sem frete).

4.4 — Disparar as duas cobranças no Pagar.me **sequencialmente** (uma
`/orders`, uma `/subscriptions`), reaproveitando os blocos de código que já
existem hoje para cada tipo (só rodando cada um com os dados do seu
grupo). Se uma falhar, a outra **não é revertida** — trate como duas
tentativas independentes (mesmo espírito de "cada cobrança é seu próprio
evento" que já usamos pra renovação). Se qualquer uma falhar, a resposta
ao cliente deve deixar claro qual das duas passou e qual falhou (campo
tipo `{ oneTime: { ok, error? }, subscription: { ok, error? } }` na
resposta JSON), pra a tela de checkout mostrar mensagem específica em vez
de um erro genérico.

4.5 — Depois das duas tentativas resolvidas, para cada grupo que teve
`status === 'paid'`: gravar o `payment` (via `insertPaymentWithRetry`,
já existente) e marcar a `subscription.status = 'active'` +
`user_entitlements` (mesmo bloco que já existe em `finalizePaidSubscription`
hoje — **não** chamar `ensureProtocolAfterPayment` ainda nessa etapa,
extrair só a parte de status/entitlements pra uma função menor reutilizável,
ex. `activateSubscriptionRow(admin, { subscriptionId, userId, expiresAt })`
sem o `ensureProtocolAfterPayment` embutido).

4.6 — **Protocolo compartilhado** — só depois que todas as tentativas
resolveram: escolher a subscription "carregadora" do protocolo (a que
pagou, priorizando a assinatura se as duas pagaram — resultado final é o
mesmo protocolo de qualquer forma, a escolha é só por consistência). Antes
de chamar `ensureProtocolAfterPayment` nela, fazer um `UPDATE` no
`pending_checkout.protocol_items` dessa subscription carregadora pra
conter a **união** dos itens pagos dos dois grupos (não só o dela) —
assim quando `ensureProtocolAfterPayment`/`insertProtocolItemsFromPending`
rodar (sem nenhuma alteração no código deles), o protocolo já nasce com
todos os produtos pagos, de ambos os grupos. Chamar
`ensureProtocolAfterPayment` **uma vez só**, nessa subscription.

Se só um dos dois grupos pagou (o outro falhou), a carregadora é o grupo
que pagou, com só os itens dele — comportamento idêntico ao caso de
cobrança única de hoje, sem união nenhuma.

4.7 — Para a subscription **não-carregadora** (se também pagou): depois do
protocolo da carregadora estar pronto, só fazer
`UPDATE subscriptions SET protocol_id = <id do protocolo> WHERE id = <subscription não-carregadora>`
direto — **sem** chamar `ensureProtocolAfterPayment` nela (evita criar um
segundo protocolo). Isso é seguro porque acontece de forma síncrona, depois
que a carregadora já terminou — sem corrida, sem precisar de lock novo.

4.8 — Disparo de eventos Inngest (`pagamento/confirmado`):
- Disparar **uma vez só**, pra subscription carregadora — é esse disparo
  que aciona `pharmacy-order.ts` (despacho único, pacote combinado — já
  funciona sozinho, porque o `pending_checkout.protocol_items` da
  carregadora já tem a união dos itens da Parte 4.6, e `pharmacy-order.ts`
  já calcula peso/dimensão a partir desse snapshot, sem precisar de
  nenhuma mudança nesse arquivo) e `ensureProtocolAfterPayment` (que já
  rodou direto na 4.6, mas o evento também dispara
  `purchase-confirmed.ts` pro e-mail).
- Pra subscription não-carregadora (se pagou): disparar só um e-mail de
  confirmação de compra pra ela também, **sem** re-disparar farmácia. Se
  não for simples reaproveitar `purchase-confirmed.ts` isolado do resto do
  evento, tudo bem manter como está e o cliente recebe só 1 e-mail de
  confirmação (cobrindo as duas cobranças) — não é crítico ter os dois
  e-mails separados, só não pode duplicar o despacho pra farmácia.

============================================================
PARTE 5 — Resposta ao front e tela de checkout
============================================================

Response do endpoint passa a ter o formato:
```ts
{
  ok: true,
  results: {
    oneTime?: { ok: boolean; order_id?: string; error?: string; pix?: {...} },
    subscription?: { ok: boolean; subscription_id?: string; error?: string },
  },
  protocol_id: string | null,
}
```
(campos `oneTime`/`subscription` só presentes se aquele grupo existia no
carrinho). Em `checkout/page.tsx`, tratar essa resposta: se os dois
grupos existirem e só um falhar, mostrar mensagem clara tipo "Sua
assinatura foi confirmada, mas não conseguimos processar o pagamento
avulso — tente novamente" (ou o inverso), em vez do erro genérico atual.

============================================================
NOTAS
============================================================

- Não mexer em `ensureProtocolAfterPayment`, `create-from-checkout.ts`,
  `pharmacy-order.ts`, `create-label.ts` — a Parte 4 foi desenhada
  especificamente pra não precisar tocar nesses arquivos.
- Testar os 3 casos: (1) carrinho 100% avulso — comportamento idêntico ao
  de hoje; (2) carrinho 100% assinatura — idem; (3) carrinho misto — 2
  cobranças, 1 protocolo com todos os itens, 1 pedido/etiqueta de envio
  só, com o peso correto do pacote combinado.
- Rodar `npm run build`/typecheck no final. Nenhuma migration nova
  necessária — tudo isso usa colunas/tabelas que já existem
  (`subscriptions.plan_type` já aceita múltiplos valores por design,
  `pending_checkout` já é jsonb livre).
