# Prompt 11 — Fase 3: checkout e protocolo

> Referencie no Cursor com `@11-checkout-e-protocolo.md`.
> Branch: `reestrutura-suplementos`.

Seis arquivos, 45 operações. **Este bloco é diferente dos três anteriores.**
Lá o difícil era a forma da consulta, e o SQL vinha pronto. Aqui as consultas
são simples — `select`, `insert`, `update` sem embed. O difícil é **onde começa
e onde termina cada transação**, e é nisso que este documento gasta o texto.

Uma conversão que troque `supabase-js` por `sql` sem olhar as fronteiras vai
compilar, passar no typecheck e quebrar o pagamento em produção.

## Comece pela peça que todos usam

`src/lib/idempotency.ts` — `claimOnce`, `releaseClaim`, `markClaimCompleted`,
`claimByFlag`. **Converta primeiro**, sozinha, antes de qualquer outro arquivo.

Seis arquivos dependem dela, e um deles é o `pharmacy-order.ts` que já
convertemos no bloco 1: hoje ele lê o pedido por SQL e faz a claim pelo
PostgREST. Enquanto isso durar, um arquivo só fala com dois lugares — e no dia
do corte esses dois lugares passam a ser dois bancos diferentes.

A claim precisa continuar sendo **uma operação atômica**. Em SQL é isto, e eu
verifiquei os quatro comportamentos contra o banco:

```sql
INSERT INTO protocol_creation_locks (subscription_id)
VALUES ($1::uuid)
ON CONFLICT (subscription_id) DO NOTHING
RETURNING subscription_id
```

Nenhuma linha devolvida = outro processo ganhou. Não é erro, é o caminho normal
do perdedor. Hoje isso é feito capturando o código `23505` do erro de chave
duplicada; com `ON CONFLICT DO NOTHING` o conflito deixa de ser exceção e passa
a ser resultado vazio, que é mais fácil de acertar.

Retomada de claim abandonada, no mesmo espírito — só apaga se for velha:

```sql
DELETE FROM protocol_creation_locks
WHERE subscription_id = $1::uuid
  AND created_at < now() - ($2 || ' milliseconds')::interval
RETURNING subscription_id
```

Verificado: claim recém-criada **não** é retomada; com a janela vencida, é.
Repare que a janela passa a ser calculada **pelo relógio do banco** (`now()`),
não pelo do container. Isso é uma melhora — dois containers com relógios
diferentes podiam retomar a claim um do outro.

`claimOnce` é genérica, recebe o nome da tabela. Em SQL isso não pode virar
interpolação de string. Use `sql(tabela)` do postgres.js, que trata identificador
com aspas, **nunca** template literal cru.

## As duas reversões parecem iguais e não são

Os dois arquivos pesados têm rollback manual. **Só um deles vira transação.**

### `src/lib/protocol/create-from-checkout.ts` — vira transação

O `rollbackPartialAndRelease` (linha 355) desfaz só banco: limpa o link na
subscription, apaga `protocol_items`, apaga `protocols`, apaga `quiz_responses`.
Isso é exatamente o que `withTransaction` faz de graça e sem esquecer nada.

Ponha numa transação só:

1. `UPDATE users` (nome e data de nascimento do perfil)
2. `INSERT INTO quiz_responses`
3. `INSERT INTO protocols`
4. `INSERT INTO protocol_items`
5. o `UPDATE subscriptions` que grava `protocol_id` e limpa `pending_checkout`

E **apague o `rollbackPartialAndRelease` inteiro** na parte de banco. Se
qualquer passo falhar, nada aconteceu — inclusive o `pending_checkout`, que hoje
precisa ser restaurado à mão, volta sozinho porque nunca foi apagado.

**O que NÃO entra na transação: a claim.** Isso é o ponto mais importante do
documento. A claim existe para que o webhook e o checkout não criem o mesmo
protocolo duas vezes — ela precisa ficar **visível para o outro processo**
enquanto este trabalha. Dentro de uma transação aberta ela é invisível, e os
dois processos entrariam juntos. A claim é gravada e commitada antes; a
transação faz o trabalho; a liberação vem depois.

A ordem passa a ser:

```
claim (commit próprio)
  └─ transação: users → quiz_responses → protocols → protocol_items → subscriptions
       falhou? o banco desfaz tudo sozinho
libera a claim (commit próprio)
```

`waitForProtocolId` continua existindo e continua fazendo poll: o perdedor da
corrida espera o vencedor **commitar**, e isso não muda.

`stampLockProtocolId` (o breadcrumb no lock) pode ficar como está. Ele existia
para o caso de o processo morrer entre criar o protocolo e linká-lo — janela que
a transação fecha. Vira cinto e suspensório. **Não remova**: `creation_subscription_id`
tem outros usos e mexer em recuperação de falha não é escopo deste bloco.

### `src/app/api/checkout/create/route.ts` — NÃO vira transação

`deleteFailedSubscription` (linha 526) e o caminho de substituição (linha 626)
parecem o mesmo padrão, mas fazem uma coisa que transação nenhuma desfaz:
**cancelam a assinatura na Pagar.me antes de apagar o registro local.**

```
cancelPagarmeSubscriptionBestEffort(...)   ← outro sistema, outra empresa
  ↓
UPDATE terms_acceptances SET subscription_id = NULL
DELETE FROM payments
DELETE FROM subscriptions
```

`ROLLBACK` não cancela cobrança na Pagar.me. Se alguém envolver isso numa
transação e ela falhar depois do cancelamento remoto, sobra assinatura viva lá e
registro vivo aqui — que é precisamente o órfão que o comentário na linha 531
diz estar evitando.

**Regra deste arquivo:** a chamada à Pagar.me fica fora, sempre e por
construção. O que vira transação são apenas **as três escritas locais**, juntas,
para não existir estado meio-limpo:

```
withTransaction: UPDATE terms_acceptances → DELETE payments → DELETE subscriptions
```

Nos dois pontos (526 e 626). O resto do arquivo — as 23 operações — converte
uma a uma, sem envolver nada mais em transação.

## Os outros quatro arquivos

- `src/app/api/checkout/status/route.ts` — dois `select`, direto.
- `src/lib/checkout/price.ts` — um `select` em `products`. **Cuidado**: preço é
  `numeric`, volta string. É o arquivo que calcula o total do checkout; erro
  aqui é dinheiro errado, não tela feia. Todo campo por `asNumber`.
- `src/app/suplementos/(public)/checkout/page.tsx` — um `select` em `users`.
- `src/app/api/quiz/submit/route.ts` — não tem operação de tabela; só confira
  que continua sem.

## O que preservar

- `maybeSingle()` → `null`. `single()` → erro.
- **Dinheiro por `asNumber`**, sem exceção. Este bloco tem `amount`,
  `unit_price`, `total_amount` e a tabela de preços inteira.
- Nome de tabela dinâmico em `idempotency.ts` via `sql(tabela)`, nunca
  interpolação.
- Auth e Storage seguem no `supabase-js`.
- Não altere esquema.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. **Sobrou alguma chamada externa dentro de um `withTransaction`?** Pagar.me,
   Envie Agora, farmácia, e-mail, Inngest. Se sobrou, é bug — quero saber antes
   de eu ir procurar.
2. Se o `rollbackPartialAndRelease` saiu inteiro ou se restou algum pedaço, e
   qual.
3. Se `claimOnce` deu para converter mantendo a assinatura, ou se os seis
   chamadores precisaram mudar.

## Como será verificado

1. Nenhum `fetch`, `await` de API externa ou envio de evento dentro de
   `withTransaction` — em nenhum dos seis arquivos.
2. A claim continua atômica: duas tentativas seguidas, a segunda não ganha.
   Já confirmei o SQL contra o banco.
3. Claim recém-criada não é retomada como abandonada; com janela vencida, é.
4. O caminho de falha em `create-from-checkout` não deixa `quiz_responses`,
   `protocols` nem `protocol_items` órfãos — e `pending_checkout` continua
   preenchido, sem ninguém ter restaurado à mão.
5. `deleteFailedSubscription` continua chamando a Pagar.me **antes** de apagar
   local, e fora de transação.
6. Nenhum SQL montado por concatenação, inclusive o nome de tabela dinâmico.
