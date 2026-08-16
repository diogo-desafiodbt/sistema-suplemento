# Prompt 12 — Fase 3: webhooks

> Referencie no Cursor com `@12-webhooks.md`.
> Branch: `reestrutura-suplementos`.

Quatro arquivos, 31 operações. É dinheiro entrando e transportadora avisando —
quem chama são sistemas de terceiros, que **retentam** quando a resposta não é
200. Então a pergunta que guia este bloco não é "está em SQL?", e sim
**"o que acontece se este webhook chegar duas vezes?"**

## Não envolva o webhook inteiro numa transação

A tentação é grande e está errada. Cada handler é uma **sequência de passos
idempotentes**, não uma unidade atômica:

- Ele grava `webhook_logs` logo na entrada, **de propósito**, para haver rastro
  mesmo se o processamento falhar depois. Numa transação que falha, esse rastro
  some — que é o oposto do motivo dele existir.
- Ele chama `ensureProtocolAfterPayment`, que tem **claim e transação próprias**
  (bloco 4). Transação dentro de transação transforma a claim em invisível, e
  volta o problema que o bloco 4 resolveu.
- Ele dispara `inngest.send`, que é outro sistema.

**Regra:** neste bloco, `withTransaction` só aparece se dois `UPDATE`/`INSERT`
vizinhos precisarem valer juntos. Na dúvida, não use.

## Já mexi no banco por você: `user_entitlements` ganhou índice único

`supabase/migrations/20260816000000_user_entitlements_unique.sql`, já aplicada
na Supabase e propagada para o RDS.

Motivo: dois lugares gravam nessa tabela — este webhook (linha 376) e
`checkout/create/route.ts` (linha 171, já convertido no bloco 4) — e os dois
fazem "procura, se achou atualiza, senão insere". Entre a procura e a inserção
não há nada segurando. Pior: quem lê usa `maybeSingle()`, que trata duas linhas
como **erro**. Ou seja, a duplicata não polui a tabela, ela quebra a leitura
seguinte. O código já dependia dessa unicidade sem nunca ter pedido ao banco.

Com o índice, os dois lugares passam a usar um comando só, atômico:

```sql
INSERT INTO user_entitlements (user_id, product_key, status, expires_at, is_permanent)
VALUES ($1::uuid, 'treatment', 'active', $2::timestamptz, false)
ON CONFLICT (user_id, product_key)
DO UPDATE SET status = EXCLUDED.status, expires_at = EXCLUDED.expires_at
```

Verificado no banco: a primeira chamada insere, a segunda atualiza, e o par
continua com **uma** linha.

**Troque nos dois lugares** — inclusive em `checkout/create/route.ts`, que é do
bloco anterior. A leitura prévia (`SELECT id FROM user_entitlements ...`) sai
junto: ela deixa de ter função.

## 1. `src/app/api/webhooks/pagarme/route.ts` (557 linhas, 20 operações)

O arquivo grande do bloco. Converta operação a operação, sem reorganizar o
fluxo. Três pontos merecem cuidado:

**O upsert de entitlement** (linha 376) — como acima.

**`ensureProtocolAfterPayment`** (linha 401) fica exatamente onde está, fora de
qualquer transação. Ela já cuida da própria atomicidade.

**`inngest.send`** (linha 427) fica fora, e o `try/catch` em volta dele
continua: hoje uma falha no disparo é registrada e engolida, sem derrubar o
webhook. Não transforme isso em erro.

Um detalhe que aparece aqui e é fácil deixar passar: **`payments.pagarme_charge_id`
tem índice único**. Isso significa que a gravação de pagamento pode virar
`ON CONFLICT (pagarme_charge_id) DO UPDATE` no lugar da lógica de tentativa e
retentativa das linhas 245 a 360 — mas **não faça isso agora**. Aquele trecho
tem regra de negócio sobre qual estado sobrescreve qual, e misturar as duas
coisas no mesmo bloco é como se erra. Converta como está; se achar que dá para
simplificar, me diga qual trecho e por quê, que eu avalio separado.

Valores em dinheiro (`amount`) por `asNumber`.

## 2. Os três webhooks menores

`farmacia/route.ts`, `shipping/etiqueta/route.ts` e `shipping/rastreamento/route.ts`
seguem o mesmo desenho:

```
INSERT webhook_logs (processed = false)  → devolve id
SELECT orders                            → acha o pedido
UPDATE orders                            → aplica o efeito
UPDATE webhook_logs SET processed = true
```

O `INSERT ... RETURNING id` substitui o `.insert().select('id').single()` de
hoje:

```sql
INSERT INTO webhook_logs (source, event_type, payload, processed)
VALUES ($1, $2, $3::jsonb, false)
RETURNING id
```

### Uma corrida que dá para fechar de graça

Em `shipping/etiqueta` o código lê `orders.shipping_json`, mistura em
JavaScript e grava de volta. Dois webhooks chegando juntos: o segundo sobrescreve
o que o primeiro acabou de gravar. Em SQL isso vira um comando só, e o banco
resolve:

```sql
UPDATE orders
SET shipping_json = COALESCE(shipping_json, '{}'::jsonb) || $1::jsonb
WHERE id = $2::uuid
```

Verifiquei: `||` mescla no primeiro nível e `COALESCE` cobre o caso de a coluna
estar nula.

**Cuidado — isso NÃO serve para `shipping/rastreamento`.** Ali o merge é
`mergeTrackingEvents`, que junta **listas de eventos** removendo repetidos por
chave. E `||` em jsonb **substitui array inteiro**, não concatena: confirmei que
`{"eventos":[1,2]} || {"eventos":[3]}` resulta em `{"eventos":[3]}`. Usar `||`
ali apagaria o histórico de rastreio. Naquele arquivo, **mantenha o merge em
JavaScript** como está.

## O que preservar

- Resposta **200 mesmo quando não há o que fazer**. Vários caminhos hoje
  devolvem `{ ok: true }` de propósito, para o terceiro não ficar retentando
  eternamente algo que nunca vai dar certo. Não transforme em erro.
- O `webhook_logs` de entrada é gravado antes do processamento e **fora** de
  qualquer transação.
- A autorização por header (`isBearerTokenAuthorizedComTransicao`) não muda.
- `maybeSingle()` → `null`; `single()` → erro.
- Dinheiro por `asNumber`.
- Auth e Storage seguem no `supabase-js`.
- **Não crie migração nova.** A deste bloco já está aplicada.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Se algum handler ficou com `withTransaction` — quais passos e por quê.
2. Se o upsert de entitlement foi trocado nos **dois** lugares (webhook e
   checkout).
3. Se sobrou algum caminho onde o `webhook_logs` de entrada deixou de ser
   gravado quando o processamento falha.

## Como será verificado

1. Nenhuma chamada externa dentro de transação — varredura no repositório
   inteiro, como no bloco 4.
2. `ensureProtocolAfterPayment` e `inngest.send` fora de transação.
3. O upsert mantém uma linha por par `(user_id, product_key)` — já confirmei
   contra o banco, com o índice em pé nos dois lados.
4. `shipping_json` mesclado em SQL preserva as chaves anteriores; e o
   rastreamento continua acumulando eventos, não substituindo.
5. Os quatro handlers continuam devolvendo 200 nos caminhos de "nada a fazer".
