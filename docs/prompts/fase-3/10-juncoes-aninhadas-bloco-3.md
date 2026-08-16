# Prompt 10 — Fase 3: junções aninhadas, bloco 3 (fecha as junções)

> Referencie no Cursor com `@10-juncoes-aninhadas-bloco-3.md`.
> Branch: `reestrutura-suplementos`.

Sete arquivos, dez consultas. Com este bloco **acaba a parte difícil**: não
sobra nenhuma junção aninhada no sistema. O que restar depois é conversão
mecânica — `select`, `insert`, `update` sem embed.

Este bloco é independente do bloco 2 (`@09-juncoes-aninhadas-bloco-2.md`): não
tocam nos mesmos arquivos. Pode rodar em qualquer ordem.

Todo o SQL abaixo foi rodado contra o banco e comparado com o PostgREST campo a
campo. Onde está escrito "idêntico", é resultado de comparação, não de leitura.

## As duas armadilhas de sempre

Já valeram nos blocos 1 e 2, repetidas aqui porque este bloco tem muito campo de
dinheiro e de data:

| | coluna no topo | dentro de `jsonb` |
|---|---|---|
| `numeric` | string `"29.90"` | número `29.9` |
| `timestamptz` | `Date` | string `"…+00:00"` |

`unit_price`, `total_amount` e `amount` aparecem nos dois lugares neste bloco.
Use `asNumber` de `@/lib/db`. Nenhuma destas rotas fala com terceiro, então
`Date` pode ficar como está — não precisa do `to_jsonb(...) #>> '{}'` aqui.

## Uma limpeza que o SQL permite

`admin/page.tsx` faz isto duas vezes:

```ts
const u = p.users
const name = Array.isArray(u) ? u[0]?.full_name : u?.full_name
```

Essa defesa existe porque o PostgREST às vezes devolve objeto e às vezes array
para a mesma relação, dependendo de como ele deduz a cardinalidade. **Em SQL a
forma é a que você escreveu.** `jsonb_build_object` devolve objeto, sempre.
Apague o `Array.isArray` nos dois pontos e tipe como objeto.

## 1. `src/app/suplementos/(admin)/admin/page.tsx` — três consultas

Protocolos parados (**idêntico**, 3 linhas). Parâmetro: `threeDaysAgo`.

```sql
SELECT p.id, p.user_id, p.generated_at,
  CASE WHEN u.id IS NULL THEN NULL
    ELSE jsonb_build_object('full_name', u.full_name) END AS users
FROM protocols p
LEFT JOIN users u ON u.id = p.user_id
WHERE p.status = 'pending_signature' AND p.generated_at < $1::timestamptz
ORDER BY p.generated_at ASC
LIMIT 20
```

Pedidos parados (**idêntico**, 1 linha). Parâmetro: `twoDaysAgo`.

```sql
SELECT o.id, o.created_at,
  CASE WHEN u.id IS NULL THEN NULL
    ELSE jsonb_build_object('full_name', u.full_name) END AS users
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE o.pharmacy_sent_at IS NULL AND o.created_at < $1::timestamptz
ORDER BY o.created_at ASC
LIMIT 20
```

Pagamentos falhos — junção de dois níveis (**idêntico**). Parâmetro:
`sevenDaysAgo`.

```sql
SELECT pay.id, pay.amount, pay.created_at, pay.subscription_id,
  CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
    'user_id', s.user_id,
    'users', CASE WHEN u.id IS NULL THEN NULL
      ELSE jsonb_build_object('full_name', u.full_name) END) END AS subscriptions
FROM payments pay
LEFT JOIN subscriptions s ON s.id = pay.subscription_id
LEFT JOIN users u ON u.id = s.user_id
WHERE pay.status = 'failed' AND pay.created_at >= $1::timestamptz
ORDER BY pay.created_at DESC
LIMIT 20
```

A consulta de `background_jobs` no meio (reconciliação) não tem junção, mas está
no mesmo arquivo — converta junto.

## 2. `src/app/suplementos/(admin)/admin/clientes/[id]/page.tsx`

O arquivo dispara **doze** consultas num `Promise.all` (linhas 234 a 356).
Converta **todas**, não só as duas com junção — meia conversão aqui deixa o
arquivo abrindo duas conexões diferentes para montar uma página só.

Protocolos do cliente (**idêntico**, 2 linhas). Parâmetro: `id`.

```sql
SELECT p.id, p.status, p.generated_at, p.signed_at, p.signed_by,
       p.prescription_pdf_path,
  COALESCE(it.list, '[]'::jsonb) AS protocol_items
FROM protocols p
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', pi.id, 'is_required', pi.is_required,
    'removed_by_patient', pi.removed_by_patient,
    'activation_reason', pi.activation_reason,
    'products', CASE WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object('name', pr.name) END
  ) ORDER BY pi.id) AS list
  FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
  WHERE pi.protocol_id = p.id) it ON true
WHERE p.user_id = $1::uuid
ORDER BY p.generated_at DESC
```

Profissionais que assinaram (**idêntico**). Este é o `.in(...)` — vira
`= ANY($1::uuid[])`, passando o array inteiro como **um** parâmetro. Nunca
montar a lista por concatenação.

```sql
SELECT pf.id, pf.crm, pf.crm_state,
  CASE WHEN u.id IS NULL THEN NULL
    ELSE jsonb_build_object('full_name', u.full_name) END AS users
FROM professionals pf
LEFT JOIN users u ON u.id = pf.user_id
WHERE pf.id = ANY($1::uuid[])
```

As outras dez são `select('*')` com `.eq('user_id', id)` — `SELECT t.* FROM
tabela t WHERE t.user_id = $1::uuid`, com o mesmo `ORDER BY` de hoje. Atenção em
`quiz_responses`, que usa `nullsFirst: false`: em SQL é
`ORDER BY completed_at DESC NULLS LAST`.

## 3. `src/app/suplementos/(patient)/dashboard/pedidos/page.tsx`

**Idêntico.** Parâmetro: `user.id` — e ele **é** a autorização, com RLS fora.

```sql
SELECT o.id, o.status, o.created_at, o.tracking_code, o.pharmacy_sent_at,
       o.total_amount,
  COALESCE(it.list, '[]'::jsonb) AS order_items
FROM orders o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', oi.id, 'quantity', oi.quantity, 'unit_price', oi.unit_price,
    'products', CASE WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object('name', pr.name) END
  ) ORDER BY oi.id) AS list
  FROM order_items oi LEFT JOIN products pr ON pr.id = oi.product_id
  WHERE oi.order_id = o.id) it ON true
WHERE o.user_id = $1::uuid
ORDER BY o.created_at DESC
```

## 4. `src/app/suplementos/(patient)/dashboard/pedidos/[id]/page.tsx`

**Idêntico**, 1 linha. Parâmetros: `id` e `user.id` — os dois `.eq()`.

```sql
SELECT o.id, o.status, o.created_at, o.total_amount, o.tracking_code,
       o.pharmacy_sent_at, o.subscription_id, o.shipping_quote_json,
       o.shipping_json, o.pharmacy_json,
  COALESCE(it.list, '[]'::jsonb) AS order_items
FROM orders o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', oi.id, 'quantity', oi.quantity, 'unit_price', oi.unit_price,
    'products', CASE WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object('name', pr.name) END
  ) ORDER BY oi.id) AS list
  FROM order_items oi LEFT JOIN products pr ON pr.id = oi.product_id
  WHERE oi.order_id = o.id) it ON true
WHERE o.id = $1::uuid AND o.user_id = $2::uuid
LIMIT 1
```

Nenhuma linha devolve `null`, não lança (`maybeSingle()`).

A segunda consulta do arquivo (`payments` por `subscription_id`, linha 150) sai
do `supabase-js` junto. Ela hoje **não** confere o dono — funciona porque só roda
depois de a consulta acima ter provado que o pedido é do usuário. Com RLS fora
prefiro que a garantia seja estrutural: junte `subscriptions` e filtre por
`s.user_id = $2::uuid` também. Custa uma linha e para de depender da ordem em que
o arquivo está escrito.

## 5. `src/app/suplementos/(admin)/admin/usuarios/page.tsx`

**Idêntico**, 19 linhas. Duas relações um-para-muitos no mesmo nível.

```sql
SELECT u.id, u.full_name, u.email, u.client_code, u.role, u.created_at,
  COALESCE(ent.list, '[]'::jsonb) AS user_entitlements,
  COALESCE(sub.list, '[]'::jsonb) AS subscriptions
FROM users u
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('product_key', e.product_key, 'status', e.status)
         ORDER BY e.product_key) AS list
  FROM user_entitlements e WHERE e.user_id = u.id) ent ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('plan_type', s.plan_type, 'status', s.status)
         ORDER BY s.id) AS list
  FROM subscriptions s WHERE s.user_id = u.id) sub ON true
ORDER BY u.created_at DESC
LIMIT 50
```

## 6. `src/app/suplementos/(admin)/admin/clientes/page.tsx`

**Idêntico**, 19 linhas. Aqui tem o `{ count: 'exact' }` da paginação — o total
vem na mesma consulta com `COUNT(*) OVER()`, sem segunda ida ao banco.

```sql
SELECT u.id, u.full_name, u.email, u.cpf, u.client_code, u.created_at,
  COALESCE(rfm.list, '[]'::jsonb) AS user_rfm_scores,
  COUNT(*) OVER() AS total
FROM users u
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('tier', r.tier) ORDER BY r.user_id) AS list
  FROM user_rfm_scores r WHERE r.user_id = u.id) rfm ON true
ORDER BY u.created_at DESC
LIMIT $1 OFFSET $2
```

`total` vem `bigint` — volta como **string**. Passe por `asNumber` antes de
calcular número de páginas, senão a divisão vira concatenação. Se a página
estiver vazia não há linha nenhuma, e aí `total` é 0 — trate.

O arquivo tem filtro de busca condicional. Ele **não** pode virar concatenação:
use o mesmo padrão dos blocos anteriores,
`($3::text IS NULL OR u.full_name ILIKE '%' || $3 || '%')`.

## 7. `src/app/suplementos/(admin)/admin/pedidos/page.tsx`

**Idêntico**, 1 linha.

```sql
SELECT o.id, o.status, o.created_at, o.tracking_code, o.total_amount,
       o.shipping_request_id,
  CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
    'full_name', u.full_name, 'email', u.email, 'client_code', u.client_code) END AS users
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
ORDER BY o.created_at DESC
LIMIT 50
```

## O que preservar

- Todo `WHERE` que restringe por usuário fica **no SQL**. As duas páginas de
  `dashboard` são de paciente: o `user_id` ali é a única barreira.
- As páginas de admin já conferem papel antes — não afrouxe isso ao mexer.
- `single()` → erro. `maybeSingle()` → `null`.
- Auth e Storage continuam no `supabase-js`.
- Não altere esquema. Não remova `src/lib/supabase/admin.ts`.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Quantas consultas o `clientes/[id]` ficou tendo no fim — se deu para juntar
   alguma das doze, e quais.
2. Se o `COUNT(*) OVER()` mudou o número de páginas em alguma tela.
3. Quanto tempo levou.

## Como será verificado

Rodando SQL contra o banco:

1. As dez consultas devolvem o mesmo que hoje — já confirmei as dez contra o
   PostgREST, campo a campo, e as contagens são: 3 protocolos parados, 1 pedido
   parado, 0 pagamentos falhos, 2 protocolos do cliente, 1 profissional, 1 pedido
   do paciente, 19 usuários, 19 clientes, 1 pedido no admin.
2. `dashboard/pedidos/[id]` com o `user_id` de outro paciente devolve 0 linhas —
   inclusive na consulta de `payments`, depois da correção.
3. Nenhum `Array.isArray` sobrou em `admin/page.tsx`.
4. Nenhuma consulta monta SQL por concatenação, nem no filtro de busca nem no
   `= ANY`.
