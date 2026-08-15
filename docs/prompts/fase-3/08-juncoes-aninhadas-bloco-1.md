# Prompt 8 — Fase 3: junções aninhadas, bloco 1 (a cadeia da farmácia)

> Referencie no Cursor com `@08-juncoes-aninhadas-bloco-1.md`.
> Branch: `reestrutura-suplementos`.

## Antes de tudo: estes quatro arquivos estão quebrados em produção hoje

Isto não é uma conversão preventiva. **As quatro consultas deste bloco falham
agora, contra o banco de hoje, com erro `PGRST201`.** Verifiquei chamando o
PostgREST diretamente com a chave de serviço, não por leitura de código.

A causa: a migração `20260806040000_protocols_creation_subscription_id.sql`
(commit `99da6e2`, 04/08) criou `protocols.creation_subscription_id` apontando
para `subscriptions`. Com isso passaram a existir **duas** chaves estrangeiras
entre `subscriptions` e `protocols`:

| Relação | Cardinalidade |
|---|---|
| `subscriptions.protocol_id -> protocols.id` | muitos-para-um |
| `protocols.creation_subscription_id -> subscriptions.id` | um-para-muitos |

O PostgREST não escolhe entre duas. Ele recusa o embed inteiro:

```
PGRST201 — Could not embed because more than one relationship was found
for 'subscriptions' and 'protocols'
```

Quem escreve `protocols(...)` dentro de `subscriptions` sem qualificar a chave
recebe erro 300, não dado. O efeito, arquivo por arquivo:

| Arquivo | O que ele deveria fazer | O que faz hoje |
|---|---|---|
| `src/app/api/farmacia/pedidos/route.ts` | listar pedidos com protocolo assinado | **500** `Erro ao buscar pedidos` |
| `src/app/api/farmacia/pedidos/json/route.ts` | entregar o JSON do pedido + PDF | **500** `Erro ao buscar pedidos` |
| `src/lib/inngest/functions/pharmacy-order.ts` | despachar pedido pago para a farmácia | lança `Assinatura não encontrada` |
| `src/lib/shipping/create-label.ts` | criar etiqueta na Envie Agora | lança `Pedido não encontrado` |

São os quatro elos da cadeia de expedição — a listagem que a farmácia consulta,
o JSON que ela puxa, o despacho e a etiqueta. **Nenhum pedido pago consegue
chegar à farmácia hoje.** O portão de pré-lançamento esconde isso, porque não há
volume real passando; no dia em que a senha sair do ambiente, sai quebrado.

Converter para SQL resolve o erro pelo mesmo movimento: em SQL a junção é
explícita, a ambiguidade não existe. Por isso este bloco vem primeiro.

## Qual das duas chaves é a certa

`subscriptions.protocol_id -> protocols.id`. Sem dúvida, e por três razões
independentes:

1. O TypeScript de `create-label.ts` declara `protocols` como objeto único
   (`protocols: { protocol_items: [...] } | null`), não array — só a
   muitos-para-um produz isso.
2. `pharmacy-order.ts` já seleciona `protocol_id` na mesma consulta.
3. `creation_subscription_id` existe para recuperação de falha na criação
   (evitar protocolo órfão entre usuários), não para expedição.

Em toda a conversão: **`protocols.id = subscriptions.protocol_id`**. Nunca
`creation_subscription_id`.

## Os quatro arquivos

Use `getSql()` de `@/lib/db` e o padrão já fixado no Prompt 7 — `jsonb_build_object`
para relação um-a-um, `LEFT JOIN LATERAL` + `jsonb_agg` para um-para-muitos,
preservando o formato aninhado que o código a jusante já consome.

O SQL abaixo eu rodei contra o banco. Não é rascunho.

### 1. `src/lib/inngest/functions/pharmacy-order.ts` (linha 118)

Substitui o `.from('subscriptions').select(...)`. Os parâmetros são
`subscription_id` e `user_id` — os dois `.eq()` de hoje.

```sql
SELECT
  s.id, s.plan_type, s.user_id, s.protocol_id, s.pending_checkout,
  jsonb_build_object(
    'id', u.id, 'full_name', u.full_name, 'email', u.email,
    'cpf', u.cpf, 'phone', u.phone, 'client_code', u.client_code,
    'addresses', COALESCE(addr.list, '[]'::jsonb)
  ) AS users,
  jsonb_build_object('protocol_items', COALESCE(items.list, '[]'::jsonb)) AS protocols
FROM subscriptions s
JOIN users u ON u.id = s.user_id
JOIN protocols p ON p.id = s.protocol_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'zip_code', a.zip_code, 'street', a.street, 'number', a.number,
    'complement', a.complement, 'neighborhood', a.neighborhood,
    'city', a.city, 'state', a.state, 'is_default', a.is_default
  ) ORDER BY a.id) AS list
  FROM addresses a WHERE a.user_id = u.id
) addr ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', pi.product_id,
    'removed_by_patient', pi.removed_by_patient,
    'quantity', pi.quantity,
    'products', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', pr.name,
      'pharmacy_sku_monthly', pr.pharmacy_sku_monthly,
      'pharmacy_sku_quarterly', pr.pharmacy_sku_quarterly,
      'pharmacy_sku_yearly', pr.pharmacy_sku_yearly,
      'pharmacy_code', pr.pharmacy_code,
      'price_monthly', pr.price_monthly,
      'price_quarterly', pr.price_quarterly,
      'price_yearly', pr.price_yearly,
      'box_type', pr.box_type
    ) END
  ) ORDER BY pi.id) AS list
  FROM protocol_items pi
  LEFT JOIN products pr ON pr.id = pi.product_id
  WHERE pi.protocol_id = p.id
) items ON true
WHERE s.id = $1::uuid AND s.user_id = $2::uuid
LIMIT 1
```

Os dois `JOIN` (não `LEFT JOIN`) em `users` e `protocols` são os `!inner` de
hoje: assinatura sem protocolo não volta. Nenhuma linha continua sendo o erro
`Assinatura não encontrada` — mantenha a mensagem.

### 2. `src/lib/shipping/create-label.ts` (linha 25)

Parâmetro: `orderId`.

```sql
SELECT
  o.id, o.user_id, o.total_amount, o.shipping_service_code,
  o.shipping_quote_json, o.shipping_request_id, o.subscription_id,
  jsonb_build_object(
    'full_name', u.full_name, 'cpf', u.cpf, 'phone', u.phone,
    'addresses', COALESCE(addr.list, '[]'::jsonb)
  ) AS users,
  CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
    'plan_type', s.plan_type,
    'pending_checkout', s.pending_checkout,
    'protocols', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
      'protocol_items', COALESCE(items.list, '[]'::jsonb)
    ) END
  ) END AS subscriptions
FROM orders o
JOIN users u ON u.id = o.user_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'zip_code', a.zip_code, 'street', a.street, 'number', a.number,
    'complement', a.complement, 'neighborhood', a.neighborhood,
    'city', a.city, 'state', a.state, 'is_default', a.is_default
  ) ORDER BY a.id) AS list
  FROM addresses a WHERE a.user_id = u.id
) addr ON true
LEFT JOIN subscriptions s ON s.id = o.subscription_id
LEFT JOIN protocols p ON p.id = s.protocol_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', pi.product_id,
    'removed_by_patient', pi.removed_by_patient,
    'products', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
      'box_type', pr.box_type, 'price_monthly', pr.price_monthly
    ) END
  ) ORDER BY pi.id) AS list
  FROM protocol_items pi
  LEFT JOIN products pr ON pr.id = pi.product_id
  WHERE pi.protocol_id = p.id
) items ON true
WHERE o.id = $1::uuid
LIMIT 1
```

Cuidado com o tipo: `total_amount` é `numeric`, e o driver devolve **string**
(`"29.90"`), enquanto o PostgREST devolvia número. O arquivo já protege com
`Number(order.total_amount ?? 0)` na linha 118, mas confira o caminho que passa
`order.total_amount` para `criarEtiqueta` (linha 175) — esse **não** converte.
Converta explicitamente.

Depois da consulta, as duas escritas (`shipping_service_code` na linha 142 e
`shipping_request_id` na 188) também saem do `supabase-js`. São `UPDATE`
simples, com `$1` — sem concatenação.

### 3 e 4. As duas rotas da farmácia

`src/app/api/farmacia/pedidos/route.ts` (linha 32) e
`.../pedidos/json/route.ts` (linha 37). Aqui o SQL **simplifica de verdade**: o
aninhamento existia só para filtrar por `protocols.status`, e vira um `JOIN`.

Listagem:

```sql
SELECT o.id, o.created_at, o.status
FROM orders o
JOIN subscriptions s ON s.id = o.subscription_id
JOIN protocols p ON p.id = s.protocol_id
WHERE p.status = 'signed'
  AND ($1::timestamptz IS NULL OR o.created_at >= $1::timestamptz)
  AND ($2::timestamptz IS NULL OR o.created_at <  $2::timestamptz)
ORDER BY o.created_at ASC
```

JSON — acrescenta `pharmacy_json`, o caminho do PDF e o filtro de não-nulo:

```sql
SELECT o.id, o.created_at, o.status, o.pharmacy_json,
       p.prescription_pdf_path
FROM orders o
JOIN subscriptions s ON s.id = o.subscription_id
JOIN protocols p ON p.id = s.protocol_id
WHERE p.status = 'signed'
  AND o.pharmacy_json IS NOT NULL
  AND ($1::timestamptz IS NULL OR o.created_at >= $1::timestamptz)
  AND ($2::timestamptz IS NULL OR o.created_at <  $2::timestamptz)
ORDER BY o.created_at ASC
```

Duas consequências, ambas desejadas — **faça as duas**:

- **O tipo `OrderRow` fica achatado.** Sem `subscriptions.protocols`, o campo
  `prescription_pdf_path` vem direto na linha. Ajuste `OrderRow` e o ponto de
  leitura na rota `json` (linha 74).
- **`isSignedProtocol()` sai.** Ela era defesa em profundidade contra o filtro
  do PostgREST em tabela aninhada, que é notoriamente traiçoeiro. Com `JOIN` +
  `WHERE p.status = 'signed'` a garantia é do banco, e manter o filtro depois só
  dá impressão falsa de que a consulta pode devolver não assinado. Apague a
  função nos dois arquivos.

**O contrato externo não muda.** As duas rotas continuam devolvendo
`numero_pedido`, `data_compra`, `status` (e `pedido` na `json`), com os mesmos
nomes e a mesma ordem. A farmácia não percebe a troca — o que ela vai perceber é
parar de tomar 500.

O `insert` em `pharmacy_api_logs`, no fim das duas rotas, também sai do
`supabase-js` neste bloco.

## O que preservar

- `maybeSingle()` → nenhuma linha devolve `null`, não lança.
- `single()` → nenhuma linha é erro, com a mesma mensagem de hoje.
- `numeric` volta como string no driver. Todo campo de dinheiro
  (`total_amount`, `price_monthly`, `price_quarterly`, `price_yearly`) precisa
  de conversão explícita antes de qualquer conta. **Este é o erro mais provável
  do bloco** — `"120" + "47.90"` não reclama, só dá resultado errado.
- Auth e Storage continuam no `supabase-js`. `createPrescriptionPdfSignedUrl`
  recebe o cliente admin e **fica como está** — é Storage, não banco.
- Não remova `src/lib/supabase/admin.ts`: 62 arquivos importam ele hoje, e 58
  continuam importando depois deste bloco.
- Não altere esquema. A ambiguidade **não** se resolve apagando a FK nova; ela
  serve para o que foi criada, e o SQL não se importa.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Se o achatamento do `OrderRow` derrubou algum outro ponto de leitura que eu
   não listei.
2. Quantos lugares precisaram de conversão de `numeric` para número.
3. Sua estimativa para os 9 arquivos com junção aninhada que sobram.

## Como será verificado

Build não prova nada aqui — as quatro consultas de hoje compilam e passam no
typecheck, e mesmo assim dão erro em tempo de execução. A verificação é rodar
SQL contra o banco, e eu faço isso depois que você entregar:

1. As duas rotas da farmácia respondem **200** com corpo `[]` (hoje: 500). Vazio
   está certo: não existe pedido com protocolo assinado no banco atual.
2. A consulta de `pharmacy-order` devolve a assinatura
   `b9aba4a4-bae6-4bc1-9a80-31a87c6de6db` com os 3 itens de protocolo — já
   confirmei que o SQL acima devolve exatamente o mesmo payload que o PostgREST
   devolveria se a ambiguidade não existisse, campo a campo.
3. A consulta de `create-label` devolve o pedido
   `72d6fe0e-49d2-40fc-ad18-75558945f0b7` com `subscriptions: null` — igual ao
   PostgREST desambiguado.
4. A lógica de junção da farmácia, testada com dados sintéticos, precisa manter:
   pedido com protocolo assinado entra; com protocolo pendente, não; sem
   protocolo, não; sem assinatura, não; e na rota `json`, sem `pharmacy_json`,
   também não.
5. Nenhuma consulta monta SQL por concatenação.
