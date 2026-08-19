# Prompt 18 — coluna que não existe, e o prescritor desativado que continua assinando

> Referencie no Cursor com `@18-coluna-inexistente-e-prescritor-inativo.md`.
> Branch: `reestrutura-suplementos`.

Dois arquivos. Os dois defeitos apareceram no primeiro teste real de assinatura
de prescrição, em 17/08 — não em build, não em typecheck.

## Correção 1 — `/suplementos/admin` devolve 500

`src/app/suplementos/(admin)/admin/page.tsx`, linha ~329:

```ts
const webhookCountRows = await sql<{ n: number }[]>`
  SELECT COUNT(*)::int AS n FROM webhook_logs
  WHERE processed = false AND created_at >= ${sevenDaysAgo}::timestamptz
`
```

**`webhook_logs` não tem `created_at`.** As colunas reais são:

```
error_message, event_type, id, payload, processed, received_at, source
```

O Postgres devolve **42703 — `column "created_at" does not exist`** e a página
inteira cai. Medido em produção: a tela principal do admin está fora do ar.

Troque para **`received_at`**. É a única mudança neste arquivo.

### Já varri o resto — não procure mais

Cruzei **todo** SQL cru do `src/` contra o schema real do RDS (33 tabelas), em
duas passadas: referências qualificadas (`alias.coluna`, resolvendo o apelido
pela cláusula `FROM`/`JOIN`) e não qualificadas em blocos de tabela única.

**Resultado: esta é a única ocorrência.** Não saia procurando outras — não há.

Cuidado com falso positivo se você for conferir por conta: `u.created_at` em
`users` e `o.created_at` em `orders` são válidos; essas tabelas têm a coluna. As
que **não** têm são `webhook_logs`, `notification_logs`, `protocols`,
`prescription_audit_logs`, `quiz_responses`, `user_login_history`,
`user_rfm_scores`, `system_config`, `terms_acceptances`, `content_access`,
`nps_responses`, `pharmacy_api_logs`, `sunday_dispatch_logs`,
`purchase_confirmation_logs` e `shipping_notification_logs`.

## Correção 2 — `is_active` existe e ninguém olha

`professionals` tem a coluna **`is_active boolean NOT NULL DEFAULT true`**. Ela
existe para revogar o direito de assinar prescrição.

**Nenhuma consulta do código a consulta.** Em 17/08 marcamos um prescritor como
`is_active = false` no banco, e ele continua conseguindo assinar normalmente. É
uma revogação que não revoga.

Em `src/app/api/prescricao/assinar/route.ts`, linha ~115:

```ts
// hoje
FROM professionals pf
LEFT JOIN users u ON u.id = pf.user_id
WHERE pf.user_id = ${user.id}::uuid
LIMIT 1

// deve ficar
FROM professionals pf
LEFT JOIN users u ON u.id = pf.user_id
WHERE pf.user_id = ${user.id}::uuid
  AND pf.is_active = true
LIMIT 1
```

O 400 que a rota já devolve quando não acha o registro (`'Registro de
profissional não encontrado'`) passa a cobrir também o prescritor desativado.
Se quiser diferenciar a mensagem, tudo bem — mas **não** revele que a conta
existe e está desativada; hoje o texto é genérico e é melhor assim.

### NÃO filtre `is_active` nas telas de leitura

Existem outros três lugares que consultam `professionals`:

- `src/app/suplementos/(professional)/profissional/assinados/page.tsx`
- `src/app/suplementos/(professional)/profissional/protocolo/[id]/page.tsx`
- `src/app/suplementos/(admin)/admin/clientes/[id]/page.tsx`

**Deixe os três como estão.** Eles exibem quem assinou o que — histórico. Se
filtrarem por `is_active`, a assinatura de um prescritor desativado **some da
tela**, e some justamente do lugar que existe para provar que ela aconteceu.
Desativar tira o direito de assinar daqui pra frente; não apaga o passado.

A regra: `is_active` vale no **caminho de escrita**, nunca no de leitura.

## O que NÃO fazer

- **Não rode SQL contra o banco.** A verificação é minha, pela tarefa ECS.
- **Não faça deploy**, não mexa em task definition nem em Secrets Manager.
- **Não mexa na trava de assinatura concorrente** (o `UPDATE protocols` sem
  `AND status = 'pending_signature'`). Continua fora de escopo, como no 17.
- **Não crie a página `/nova-senha`.** Ela não existe e o fluxo de "esqueci
  minha senha" está quebrado por causa disso — mas é trabalho de outro tamanho
  e entra em prompt próprio.
- **Não mexa nos 3 sincronismos de conteúdo** (Hotmart, Omie, YouTube).

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `grep -n "created_at" src/app/suplementos/\(admin\)/admin/page.tsx` não
   mostra mais nenhuma linha referente a `webhook_logs`.
3. `assinar/route.ts` tem `pf.is_active = true` na busca do profissional.
4. Os outros três arquivos que leem `professionals` continuam **sem** filtro.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor.
