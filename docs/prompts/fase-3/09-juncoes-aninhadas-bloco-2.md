# Prompt 9 — Fase 3: junções aninhadas, bloco 2 (o que decide autorização)

> Referencie no Cursor com `@09-juncoes-aninhadas-bloco-2.md`.
> Branch: `reestrutura-suplementos`.

O bloco 1 está commitado (`4a10717`). Este traz cinco arquivos, uma correção do
bloco 1 e um bug que a verificação achou. Comece pelo bug — ele é de uma linha e
está no ar hoje.

## Decisão nova que muda o desenho: RLS não vai para o RDS

Confirmado pelo Diogo em 15/08. As 28 políticas de RLS **não** serão portadas.
Elas dependem de `auth.uid()`, que não existe no RDS, e no RDS quem conecta é
`app_web` — um papel só, não o usuário final. A política não teria de quem falar.

**A consequência para você:** a autorização passa a viver **inteiramente dentro
da consulta**. Não existe mais rede de proteção embaixo. Cada `WHERE` que
restringe por usuário é agora a única coisa entre uma pessoa e o prontuário de
outra. Tratar como tal.

Os cinco arquivos deste bloco são justamente os que decidem quem vê o quê — por
isso vêm antes dos quatro de relatório.

## 1. O bug: `signed_by` é comparado com o id errado

`protocols.signed_by` guarda **`professionals.id`**. Dois lugares comparam com
`user.id`, que é o id do usuário autenticado. Confirmei no banco que os dois são
diferentes:

```
professionals.id  91ac1423-a162-4a47-9b92-4f817d9a7c6c
professionals.user_id  08bbf705-2f12-4445-8ff5-bc2fb6fd392d
protocols.signed_by (protocolo assinado)  91ac1423-…  ← é o professionals.id
```

Quem escreve está certo — `assinar/route.ts:153` grava `professional.id`. Quem
lê está errado, nos dois pontos:

- `profissional/assinados/page.tsx:71` — `.eq('signed_by', user.id)`. Efeito:
  **profissional não-admin nunca vê nenhum protocolo assinado.** A lista é
  sempre vazia.
- `profissional/protocolo/[id]/page.tsx:152` — `OR p.signed_by = ${user.id}`.
  Efeito: a metade "ou assinado por ele" da regra de autorização **nunca casa**.
  Na prática o profissional perde o acesso ao protocolo no instante em que
  assina.

Esse segundo é o que a gente escreveu no endurecimento de 13/08. Falha fechada —
não vaza nada, restringe demais — então não é buraco de segurança, é função
quebrada. Mas com RLS fora, esse `WHERE` passa a ser a única barreira, e ele
precisa estar certo pelo motivo certo.

Correção nos dois:

```sql
OR p.signed_by = (SELECT pf.id FROM professionals pf WHERE pf.user_id = ${user.id}::uuid)
```

`protocolo/[id]/page.tsx` já está em SQL — é trocar a linha 152. `assinados`
você converte neste bloco de qualquer jeito.

## 2. Correção do bloco 1: o formato de `data_compra`

A verificação pegou uma mudança de contrato que passou batido: `postgres.js`
devolve `timestamptz` como `Date`, e `toISOString()` não reproduz o que o
PostgREST mandava para a farmácia.

```
PostgREST mandava:  2026-08-04T12:29:20.643479+00:00
o bloco 1 manda:    2026-08-04T12:29:20.643Z
```

Os dois são ISO 8601 válidos, mas quem consome é a Miligrama e o combinado era
não mexer no contrato. Além do sufixo, perdem-se os microssegundos.

A reprodução exata é converter no banco, não no JavaScript:

```sql
to_jsonb(o.created_at) #>> '{}' AS created_at
```

Verifiquei: devolve `2026-08-04T12:29:20.643479+00:00`, idêntico byte a byte.
`to_char(... 'US')` **não** serve — enche de zero à direita (`.047000` onde o
PostgREST mandava `.047`).

Aplique nas duas rotas da farmácia (`/api/farmacia/pedidos` e `/json`) e apague
o helper `toIso` das duas — ele deixa de ter função. `data_compra` volta a ser
string vinda do banco.

### A regra geral, porque isto vai se repetir

É o espelho exato do `numeric` que você já encontrou:

| | coluna no topo | dentro de `jsonb` |
|---|---|---|
| `numeric` | string `"29.90"` | número `29.9` |
| `timestamptz` | `Date` | string `"…+00:00"` |

Nas **páginas internas** isso não importa — o JSX formata `Date` igual ou
melhor, e eu confirmei que `fila`, `assinados` e `auditoria` batem com o
PostgREST em todo o resto. **Só importa quando o valor atravessa fronteira**:
JSON para terceiro, comparação de string, `.split('T')`. Nesses casos, use o
`to_jsonb(...) #>> '{}'`. Nos outros, deixe `Date`.

## 3. Os cinco arquivos

Todo o SQL abaixo eu rodei contra o banco e comparei com o PostgREST. Onde
escrevi "idêntico", é resultado de comparação campo a campo, não leitura.

### `src/app/api/protocol/[id]/route.ts` (linha 23)

Parâmetros: `id` e `user.id`. O `.eq('user_id', user.id)` de hoje **é** a
autorização — ele não pode virar filtro em memória.

```sql
SELECT p.id, p.status, p.generated_at,
  COALESCE(items.list, '[]'::jsonb) AS protocol_items
FROM protocols p
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', pi.id, 'is_required', pi.is_required,
    'removed_by_patient', pi.removed_by_patient,
    'activation_reason', pi.activation_reason, 'quantity', pi.quantity,
    'products', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', pr.id, 'name', pr.name, 'price_monthly', pr.price_monthly,
      'price_quarterly', pr.price_quarterly, 'price_yearly', pr.price_yearly,
      'is_fixed', pr.is_fixed) END
  ) ORDER BY pi.id) AS list
  FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
  WHERE pi.protocol_id = p.id) items ON true
WHERE p.id = $1::uuid AND p.user_id = $2::uuid
LIMIT 1
```

Nenhuma linha era erro (`.single()`) — mantenha.

### `src/app/api/prescricao/assinar/route.ts` (linhas 41 e 67)

Duas consultas. A primeira usa `select('*')`, então `p.*` mesmo:

```sql
SELECT p.*,
  CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
    'full_name', u.full_name, 'email', u.email, 'client_code', u.client_code) END AS users,
  CASE WHEN q.id IS NULL THEN NULL ELSE jsonb_build_object(
    'diagnosis_type', q.diagnosis_type, 'age', q.age, 'birth_date', q.birth_date,
    'sex', q.sex, 'is_pregnant_or_breastfeeding', q.is_pregnant_or_breastfeeding,
    'renal_conditions', q.renal_conditions, 'hepatic_conditions', q.hepatic_conditions,
    'medications', q.medications, 'years_diagnosed', q.years_diagnosed,
    'hba1c_range', q.hba1c_range, 'allergies', q.allergies) END AS quiz_responses,
  COALESCE(items.list, '[]'::jsonb) AS protocol_items
FROM protocols p
LEFT JOIN users u ON u.id = p.user_id
LEFT JOIN quiz_responses q ON q.id = p.quiz_response_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', pi.id, 'is_required', pi.is_required,
    'removed_by_patient', pi.removed_by_patient,
    'activation_reason', pi.activation_reason,
    'products', CASE WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object('name', pr.name) END
  ) ORDER BY pi.id) AS list
  FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
  WHERE pi.protocol_id = p.id) items ON true
WHERE p.id = $1::uuid AND p.status = 'pending_signature'
LIMIT 1
```

A segunda:

```sql
SELECT pf.id, pf.crm, pf.crm_state, pf.specialty,
  CASE WHEN u.id IS NULL THEN NULL
    ELSE jsonb_build_object('full_name', u.full_name) END AS users
FROM professionals pf
LEFT JOIN users u ON u.id = pf.user_id
WHERE pf.user_id = $1::uuid
LIMIT 1
```

O resto do arquivo (linhas 137 a 220: grava prescrição, atualiza protocolo,
log de auditoria, busca assinatura e pedido) **também sai do `supabase-js`** —
são escritas simples. A gravação do protocolo mais o log de auditoria devem
ficar **na mesma transação**, via `withTransaction`: hoje um pode gravar sem o
outro.

### `src/app/suplementos/(professional)/profissional/fila/page.tsx` (linha 57)

Sem parâmetro. **Idêntico ao PostgREST**, 3 linhas.

```sql
SELECT p.id, p.status, p.generated_at, p.source,
  CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
    'full_name', u.full_name, 'email', u.email, 'client_code', u.client_code) END AS users,
  CASE WHEN q.id IS NULL THEN NULL ELSE jsonb_build_object(
    'diagnosis_type', q.diagnosis_type, 'years_diagnosed', q.years_diagnosed,
    'medications', q.medications, 'symptoms', q.symptoms,
    'conditions_serious', q.conditions_serious, 'allergies', q.allergies) END AS quiz_responses,
  COALESCE(items.list, '[]'::jsonb) AS protocol_items
FROM protocols p
LEFT JOIN users u ON u.id = p.user_id
LEFT JOIN quiz_responses q ON q.id = p.quiz_response_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'is_required', pi.is_required,
    'removed_by_patient', pi.removed_by_patient,
    'products', CASE WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object('name', pr.name) END
  ) ORDER BY pi.id) AS list
  FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
  WHERE pi.protocol_id = p.id) items ON true
WHERE p.status = 'pending_signature'
ORDER BY p.generated_at ASC
```

### `src/app/suplementos/(professional)/profissional/assinados/page.tsx` (linha 49)

Aqui entra a correção do `signed_by`. Parâmetros: `isAdmin` e `user.id`, mesmo
formato já usado em `protocolo/[id]`.

```sql
SELECT p.id, p.status, p.signed_at,
  CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
    'full_name', u.full_name, 'email', u.email, 'client_code', u.client_code) END AS users,
  COALESCE(items.list, '[]'::jsonb) AS protocol_items
FROM protocols p
LEFT JOIN users u ON u.id = p.user_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'is_required', pi.is_required,
    'removed_by_patient', pi.removed_by_patient,
    'products', CASE WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object('name', pr.name) END
  ) ORDER BY pi.id) AS list
  FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
  WHERE pi.protocol_id = p.id) items ON true
WHERE p.status = 'signed'
  AND ($1::boolean OR p.signed_by = (
        SELECT pf.id FROM professionals pf WHERE pf.user_id = $2::uuid))
ORDER BY p.signed_at DESC
```

O filtro condicional **não** pode virar `if` em JavaScript depois de carregar.

### `src/app/suplementos/(admin)/admin/auditoria/page.tsx` (linha 54)

Duas junções para `users` por caminhos diferentes — o profissional que assinou e
o paciente dono do protocolo. **Idêntico ao PostgREST.**

```sql
SELECT l.id, l.protocol_id, l.signed_at, l.pdf_hash,
  CASE WHEN pf.id IS NULL THEN NULL ELSE jsonb_build_object(
    'users', CASE WHEN pu.id IS NULL THEN NULL
      ELSE jsonb_build_object('full_name', pu.full_name) END) END AS professionals,
  CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'users', CASE WHEN ou.id IS NULL THEN NULL
      ELSE jsonb_build_object('full_name', ou.full_name) END) END AS protocols
FROM prescription_audit_logs l
LEFT JOIN professionals pf ON pf.id = l.professional_id
LEFT JOIN users pu ON pu.id = pf.user_id
LEFT JOIN protocols p ON p.id = l.protocol_id
LEFT JOIN users ou ON ou.id = p.user_id
ORDER BY l.signed_at DESC
LIMIT 100
```

A página é de admin e a checagem de papel já acontece antes — mas ela lê nome de
paciente, então **não** afrouxe essa checagem ao mexer no arquivo.

## O que preservar

- `single()` → nenhuma linha é erro. `maybeSingle()` → `null`, sem lançar.
- Todo `WHERE` que restringe por usuário ou papel **fica no SQL**. Com RLS fora,
  filtro em memória é vazamento, não estilo.
- `numeric` e `timestamptz` conforme a tabela lá em cima.
- Auth e Storage continuam no `supabase-js`.
- Não altere esquema. Não remova `src/lib/supabase/admin.ts`.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Se algum dos cinco tinha filtro de autorização que **não** estava na consulta
   e você precisou mover para dentro dela — quais.
2. Se a transação em `assinar` mudou o comportamento de erro em algum caminho.
3. Quanto tempo levou, agora que o SQL veio pronto de novo.

## Como será verificado

Rodando SQL contra o banco, não build:

1. `fila` devolve 3 linhas e `auditoria` 1, idênticas ao PostgREST — já confirmei
   os dois payloads campo a campo.
2. `assinados` com `isAdmin = false` e o `user_id` de um profissional que assinou
   passa a devolver **1 linha**, onde hoje devolve 0. É esse número que prova a
   correção do `signed_by`.
3. `protocol/[id]` com `user_id` de outro paciente devolve **0 linhas**.
4. As duas rotas da farmácia voltam a mandar `data_compra` com `+00:00` e
   microssegundos.
5. Nenhuma consulta monta SQL por concatenação.
