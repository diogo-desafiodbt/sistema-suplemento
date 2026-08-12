# Prompt para o Cursor — Tokenização de cartão no cliente (tirar o servidor do escopo PCI)

**Criticidade: máxima.** Isso mexe no caminho do dinheiro. Se quebrar,
ninguém compra. Ler a seção de testes no final ANTES de considerar pronto.

## Problema

Hoje o cartão em texto puro (número + CVV) trafega assim:

```
navegador → NOSSO servidor (Vercel) → Pagar.me
```

Isso coloca a nossa infraestrutura dentro do escopo PCI-DSS: qualquer log,
qualquer erro capturado, qualquer breach do nosso lado pode expor número de
cartão. Hoje o dado passa por:

- `src/app/(public)/checkout/page.tsx` — monta `body.card` com
  `number`/`cvv` (linhas ~495-500) e envia pro nosso endpoint
- `src/app/api/checkout/create/route.ts` — recebe no schema Zod (linhas
  ~83-90), converte `exp_month`/`exp_year` (linhas ~794-796, ~838) e
  repassa pro Pagar.me em **dois** lugares:
  - compra avulsa: `POST /core/v5/orders` → `credit_card.card`
  - assinatura: `POST /core/v5/subscriptions` → `card` (top-level)

## Objetivo

```
navegador → Pagar.me (tokeniza) → navegador recebe token
navegador → NOSSO servidor (só o token) → Pagar.me
```

O número e o CVV **nunca** tocam nosso servidor.

============================================================
PARTE 1 — Tokenização no cliente
============================================================

Em `src/app/(public)/checkout/page.tsx`, antes do `fetch('/api/checkout/create')`:

```ts
const tokenRes = await fetch(
  `https://api.pagar.me/core/v5/tokens?appId=${process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'card',
      card: {
        number: cardNumber.replace(/\s/g, ''),
        holder_name: cardName,
        exp_month: Number(expMonth.trim()),   // 1-12, NÚMERO
        exp_year: Number(expYear),            // 2 ou 4 dígitos
        cvv: cardCvv,
      },
    }),
  },
)
```

**Regras confirmadas na doc oficial do Pagar.me:**

- A autenticação é **só** pela query `?appId=<public_key>`. **Não enviar
  header `Authorization`** nessa chamada — a API rejeita.
- A `secret_key` **nunca** pode aparecer no cliente.
- Resposta de sucesso: `{ id: "token_xxx", expires_at, card: {
  last_four_digits, brand, ... } }` — o que interessa é o `id`.
- **O token expira em 60 segundos e é de uso único.**

Consequências que precisam estar no código:

1. Tokenizar **no momento do submit**, nunca antes (ex.: não tokenizar no
   `onBlur` do campo de cartão — expiraria).
2. Se o `/api/checkout/create` falhar e o usuário tentar de novo, é
   obrigatório **gerar um token novo**. Nunca reaproveitar.
3. Tratar erro da tokenização com mensagem clara ("Não foi possível
   validar o cartão, confira os dados") — hoje um cartão inválido só
   estoura lá no nosso servidor.
4. Mostrar estado de carregando durante a tokenização (é uma chamada de
   rede a mais antes do pagamento).

Depois, no corpo enviado ao nosso endpoint, trocar:

```ts
// ANTES
body.card = { number, holder_name, exp_month, exp_year, cvv }

// DEPOIS
body.card_token = tokenData.id
```

Opcionalmente guardar `last_four_digits` e `brand` da resposta pra exibir
na confirmação — esses não são dados sensíveis.

**Remover completamente** do estado do componente qualquer envio de
`cardNumber`/`cardCvv` pra fora além da chamada de tokenização.

============================================================
PARTE 2 — Servidor
============================================================

Em `src/app/api/checkout/create/route.ts`:

2.1 — No schema Zod (linhas ~83-90), trocar o objeto `card` por:

```ts
card_token: z.string().min(5).optional(),
```

Manter a validação de que `card_token` é obrigatório quando
`payment_method === 'credit_card'` (o mesmo cuidado que já existe hoje pro
`card`, incluindo a checagem defensiva em `chargeOneTimeOrder` que hoje
lança erro se `card` for nulo).

2.2 — Remover a conversão de `exp_month`/`exp_year` (linhas ~794-796,
~838) — não existe mais data de validade no servidor.

2.3 — **Compra avulsa** (`POST /core/v5/orders`): trocar

```ts
credit_card: {
  ...,
  card: opts.card,          // ANTES
}
```
por
```ts
credit_card: {
  ...,
  card_token: opts.cardToken,   // DEPOIS
}
```

2.4 — **Assinatura** (`POST /core/v5/subscriptions`): hoje envia `card:
opts.card` no topo. Trocar por `card_token: opts.cardToken`, também no
topo.

**Confirmado ao vivo contra a API em 12/08/2026** (probe com token
inválido, sem gerar cobrança): o Pagar.me aceita `card_token` no topo do
payload de assinatura e converte internamente para `card: { token: ... }`
— isso apareceu no request ecoado na resposta de erro. Não precisa do
fluxo alternativo de `card_id`/carteira.

2.5 — **`billing_address`**: hoje vive dentro do objeto `card` (tipo
`PagarmeCard`). A doc é explícita: *"o endereço de cobrança do cartão não
é tokenizado"* — ou seja, continua tendo que ser enviado. Verificar no
teste onde ele deve ficar quando se usa `card_token` (provavelmente
`credit_card.card.billing_address` junto do token, ou no `customer`).
Confirmar empiricamente.

2.6 — **BUG SEPARADO, achado no mesmo código — corrigir junto.**

O payload de assinatura monta os itens assim:

```ts
items: [{ name: planItemName(opts.planType), quantity: 1, pricing_scheme: {...} }]
```

A API do Pagar.me **rejeita** esse formato. Testado ao vivo em 12/08/2026
com o payload exatamente como o código monta:

| items | resposta da API |
|---|---|
| `[{ name: "..." }]` (como está hoje) | ❌ `The description or plan_item_id field is required` |
| `[{ description: "..." }]` | ✅ passa a validação de items |

**Correção**: trocar `name` por `description` no `items[]` do payload de
**assinatura**.

Indício de que isso nunca funcionou: as duas assinaturas do banco têm
`pagarme_sub_id = null`, ou seja, nenhuma assinatura chegou a ser criada
no Pagar.me. Não dá pra afirmar se é regressão ou se o caminho nunca foi
exercitado em produção (as compras existentes parecem ter ido pelo
caminho de pedido avulso) — mas o payload atual é rejeitado pela API hoje,
isso é fato verificado.

**Atenção**: o payload de **pedido avulso** (`/orders`) usa `items[].description`
e está correto — não mexer nesse. O bug é só no de assinatura.

============================================================
PARTE 3 — Env vars
============================================================

Adicionar no `.env.example`:

```
# Chave PÚBLICA do Pagar.me — usada no navegador pra tokenizar o cartão.
# É pública por natureza (NEXT_PUBLIC_). Nunca colocar a secret key aqui.
NEXT_PUBLIC_PAGARME_PUBLIC_KEY=
```

============================================================
PARTE 4 — TESTES (não pular)
============================================================

**Decisão do Diogo: vamos usar chave de PRODUÇÃO, sem chave de teste.**
Isso significa que **toda cobrança de teste é real e precisa ser
estornada**. O plano abaixo minimiza o número de cobranças reais.

**Já validado (não precisa refazer)** — testado ao vivo contra a API em
12/08/2026 com a chave pública de produção `pk_ek7XQWdcYTz2OavW`:

```
POST https://api.pagar.me/core/v5/tokens?appId=pk_ek7XQWdcYTz2OavW
body: {"type":"card","card":{"number":"...","holder_name":"...",
       "exp_month":12,"exp_year":30,"cvv":"123"}}

→ 200 {
    "id": "token_x7eAdldC1mTYAvlD",
    "expires_at": <created_at + 60s>,
    "card": { "first_six_digits", "last_four_digits", "brand", ... }
  }
```

Confirmado: o endpoint funciona, **não gera cobrança**, e o token vive
exatamente 60 segundos. A Parte 1 pode ser implementada com confiança.

**Ordem de teste recomendada (menos cobranças reais possível):**

1. **Tokenização isolada primeiro** (grátis, quantas vezes quiser).
   Validar no navegador que o token é gerado, que erro de cartão inválido
   aparece bem, e que o número/CVV **não** saem no corpo enviado ao nosso
   `/api/checkout/create` (olhar a aba Network do DevTools — o payload não
   pode conter `number` nem `cvv`).

2. **Deploy em PREVIEW da Vercel, não em produção.** Mesmo código, mesmas
   chaves reais, mas sem tocar no site que os clientes usam. Só promover
   pra produção depois que passar.

3. **Uma única compra real de menor valor possível**, com cartão do
   próprio Diogo, testando o caminho de **assinatura** — que é onde está a
   incerteza da 2.4. Estornar em seguida pelo painel do Pagar.me.

4. Se a assinatura passar, **uma segunda compra real** no caminho de
   **compra avulsa** (`/orders`). Estornar também.

5. Casos de erro (não geram cobrança, testar à vontade):
   - Cartão inválido → tokenização falha antes de chegar no nosso servidor
   - Token expirado → esperar >60s entre tokenizar e submeter; a mensagem
     ao usuário precisa fazer sentido
   - Reenvio após falha → tem que gerar token novo, não reusar

6. **Auditar que o número do cartão sumiu do servidor**: depois da compra
   de teste, conferir que não aparece em log da Vercel, nem em
   `webhook_logs`, nem no que `summarizePagarmePayload` grava.

7. Pix não é afetado — confirmar que continua funcionando.

**ATENÇÃO — bloqueador para teste local**: a `PAGARME_API_KEY` no
`.env.local` está **inválida** (retorna 401 até num GET simples, testado em
12/08/2026). Foi provavelmente rotacionada e o arquivo local ficou
desatualizado. Precisa ser atualizada com a chave secreta atual antes de
qualquer teste local de checkout.

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Pré-requisito meu: pegar a `pk_` (produção) e as chaves de teste no
  painel do Pagar.me e colocar no `.env.local` + Vercel.
- Depois de validado em teste, subir `NEXT_PUBLIC_PAGARME_PUBLIC_KEY` de
  produção na Vercel.
- Esse é o item que mais reduz risco real do sistema hoje — tira dado de
  cartão da nossa infraestrutura de vez.
