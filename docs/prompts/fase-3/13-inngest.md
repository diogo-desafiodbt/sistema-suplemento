# Prompt 13 — Fase 3: as rotinas do Inngest

> Referencie no Cursor com `@13-inngest.md`.
> Branch: `reestrutura-suplementos`.

Treze arquivos, 88 operações — o maior bloco. Mas é rotina de fundo: falha aqui
é repetível, não é cliente esperando na tela.

**Leia a Parte 1 antes de abrir qualquer arquivo.** Três dos treze não devem ser
convertidos por inteiro, e converter tudo neles quebraria o sistema no dia do
corte, em silêncio.

## Parte 1 — três arquivos escrevem em DUAS zonas

`hotmart-sales-sync.ts`, `omie-financeiro-sync.ts` e `youtube-analytics-sync.ts`
gravam em tabelas de **conteúdo** (`hotmart_sales`, `omie_categorias`,
`omie_movimentos_financeiros`, as dez `youtube_*`). Essas tabelas **não existem
no banco clínico do RDS** — conferi: o `clinico` tem 33 tabelas e nenhuma delas
é de conteúdo. Elas ficam no banco `conteudo`, que hoje está **vazio**, porque a
decisão foi reabastecer YouTube, Hotmart e Omie direto das APIs mais adiante.

`getSql()` aponta para `DATABASE_URL`, e no dia do corte `DATABASE_URL` passa a
ser o **clínico**. Converter os `upsert` de conteúdo para `getSql()` significa
escrever em tabela que não existe: os três jobs quebram no corte, e como são
rotinas noturnas, ninguém percebe na hora.

**Nesses três arquivos, converta apenas as operações em `background_jobs`.**
Essa tabela é clínica e está no RDS. Todo o resto — os `upsert` e os `select`
de tabelas de conteúdo — **fica no `supabase-js`, como está.**

Ponha um comentário curto em cada um dos três, algo como:

```ts
// As tabelas de conteúdo ainda vivem na Supabase; só o registro do job vai
// para o RDS. Some quando o banco `conteudo` for migrado.
```

Isso é feio de propósito. É o marcador de que a migração do `conteudo` está
pendente, e é melhor que ele fique visível no código do que só na memória de
alguém.

## Parte 2 — as duas regras deste bloco

### Transação vive dentro de **um** `step.run`, nunca entre dois

O Inngest memoriza o resultado de cada `step.run` e pode **repetir** um passo
depois de uma pausa. Entre um passo e outro pode haver minutos, outro processo,
outra conexão. Uma transação não atravessa isso.

Se dois `UPDATE` precisam valer juntos, eles vão no **mesmo** `step.run`, e a
transação abre e fecha ali dentro. Se estão em passos diferentes hoje, deixe em
passos diferentes — não junte só para poder envolver numa transação.

`payment-retry.ts` tem 11 passos, `youtube-analytics-sync.ts` tem 9,
`avulso-renewal-reminder.ts` tem 7. É onde esse erro caberia.

### A claim continua fora da transação

Mesma regra do bloco 4, mesmo motivo: a claim precisa estar visível ao outro
processo enquanto este trabalha. `pharmacy-order.ts`, `purchase-confirmed.ts`,
`support-analyze.ts` e `support-inbox-poll.ts` usam claim.

O helper (`src/lib/idempotency.ts`) já está convertido — os quatro continuam
chamando igual.

## Parte 3 — `pharmacy-order.ts` (16 operações, o maior)

A consulta principal já saiu no bloco 1; o resto do arquivo não. Ele tem um
rollback manual que vira transação, igual ao do checkout.

Hoje, a partir da linha 427:

```
INSERT orders                       ← cria o pedido
try:
  UPDATE pharmacy_order_dispatch_logs SET order_id   ← migalha na claim
  UPDATE orders SET pharmacy_json
  INSERT order_items
catch:
  releaseClaim(...)
  DELETE orders                     ← desfaz na mão
```

Os quatro escritos viram **uma transação só**, e o `DELETE orders` do `catch`
some. Monte o `pharmacyJson` **antes** de abrir a transação — ele é construção
pura (`buildPharmacyJson`), então isso é fácil e mantém a transação curta.

```
claim (já commitada, de antes)
  └─ transação: INSERT orders → UPDATE claim.order_id
                → UPDATE orders.pharmacy_json → INSERT order_items
catch: releaseClaim(...)   ← continua, sem o DELETE
```

O `releaseClaim` do `catch` **fica**: ele age sobre a linha da claim, que foi
commitada antes e não pertence à transação. É ele que permite a retentativa.

Nas linhas 421-422 há outro par de `DELETE` — limpeza de pedido órfão de uma
execução anterior, detectada no `reclaimedStale`. Isso **não** é o rollback
desta execução: converta como está, sem envolver em transação.

Preço: `unit_price` sai de uma divisão. `numeric` volta string — passe por
`asNumber` antes de qualquer conta.

## Parte 4 — os outros nove

Conversão direta, sem transação nova:

| Arquivo | Operações |
|---|---|
| `rfm-recalc.ts` | 10 |
| `purchase-confirmed.ts` | 8 |
| `payment-retry.ts` | 8 |
| `support-inbox-poll.ts` | 8 |
| `support-analyze.ts` | 6 |
| `avulso-renewal-reminder.ts` | 4 |
| `pharmacy-reconciliation.ts` | 3 |
| `create-shipping-label.ts` | 2 |
| `support-pending-reminder.ts` | 1 |

Cuidados pontuais:

- **`rfm-recalc.ts`** faz `upsert` em `user_rfm_scores` com
  `{ onConflict: 'user_id' }` — e **isso falha hoje**, para todo usuário. Não
  havia restrição única em `user_id`, então o Postgres recusava com `42P10`; a
  tabela está com zero linhas desde sempre, e é por isso que a coluna de tier na
  tela de clientes nunca mostrou nada. O erro some porque o `try/catch` por
  usuário dentro do job só faz `console.error` e segue.
  Já criei o índice (`20260816010000_user_rfm_scores_unique.sql`), apliquei e
  propaguei para o RDS — confirmei que o upsert passa a funcionar. Converta para
  `INSERT ... ON CONFLICT (user_id) DO UPDATE` normalmente.
- **`payment-retry.ts`** mexe em `subscriptions` e `user_entitlements`. O
  entitlement agora tem índice único em `(user_id, product_key)`: se houver
  ali o mesmo "procura, senão insere", troque por
  `ON CONFLICT (user_id, product_key) DO UPDATE`.
- **`support-inbox-poll.ts`** dispara `inngest.send` — fora de transação, e
  fora de qualquer passo que possa ser repetido sem efeito.
- Os que mandam e-mail (`avulso-renewal-reminder`, `payment-retry`,
  `pharmacy-reconciliation`, `support-pending-reminder`) — o envio nunca entra
  em transação. Se o e-mail sai e o banco desfaz, a pessoa recebe aviso de uma
  coisa que não aconteceu.

## O que preservar

- Retentativa é normal aqui. Nada que já era idempotente pode deixar de ser.
- `maybeSingle()` → `null`; `single()` → erro.
- Dinheiro por `asNumber`.
- Auth e Storage seguem no `supabase-js`.
- **Não crie migração.**

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Nos três arquivos de sincronismo, **quais operações ficaram em cada lado** —
   quero conferir que só `background_jobs` mudou.
2. Se alguma transação ficou atravessando dois `step.run`.
3. Se `rfm-recalc` precisou de índice que não existe.

## Como será verificado

1. Nenhuma tabela de conteúdo (`hotmart_*`, `omie_*`, `youtube_*`, `blog_*`)
   aparece em consulta feita por `getSql()` — essa é a verificação principal do
   bloco, e eu vou rodar contra o `clinico` para confirmar que nenhuma delas
   existe lá.
2. Nenhuma chamada externa dentro de transação — varredura no repositório
   inteiro, como nos blocos 4 e 5.
3. Nenhuma transação abrindo em um `step.run` e fechando em outro.
4. `pharmacy-order` não deixa pedido sem itens no caminho de falha, e a claim
   continua sendo liberada para a retentativa.
