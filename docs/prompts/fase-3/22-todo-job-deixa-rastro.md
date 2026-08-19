# Prompt 22 — todo job deixa rastro

> Referencie no Cursor com `@22-todo-job-deixa-rastro.md`.
> Branch: `reestrutura-suplementos`.

Etapa 1 da fase de observabilidade. Oito funções do Inngest e uma migração.

## O problema

São **13 jobs**. Só **5** registram execução em `background_jobs`. Os outros 8
não deixam rastro nenhum — então nem dá para perguntar *"quando isso rodou pela
última vez?"*.

Isso não é teórico. Em 19/08 o app estava registrado no Inngest com um endereço
inválido e **nenhuma função era chamada, por dias, sem gerar um único erro**. O
vigia que roda de hora em hora hoje consegue ver 5 dos 7 jobs por horário. Os
outros podem parar e ninguém fica sabendo.

## Os 8 que faltam

| Função | Tipo | Gatilho |
|---|---|---|
| `support-inbox-poll` | horário | `*/5 * * * *` |
| `support-pending-reminder` | horário | `0 */12 * * *` |
| `support-analyze` | evento | `suporte/email-recebido` |
| `purchase-confirmed` | evento | `pagamento/confirmado` |
| `pharmacy-order` | evento | `pagamento/confirmado` |
| `create-shipping-label` | evento | `pagamento/confirmado` |
| `avulso-renewal-reminder` | evento | `pagamento/confirmado` |
| `payment-retry` | evento | `pagamento/falhou` |

## Correção 1 — a migração do enum

`background_jobs.job_type` é **enum**, não texto. Hoje tem 9 valores:

```
rfm_recalc, sunday_dispatch, pharmacy_json, pdf_generation, payment_retry,
pharmacy_reconciliation, hotmart_sales_sync, omie_financeiro_sync,
youtube_analytics_sync
```

**`payment_retry` já existe** — reaproveite, não crie de novo. Faltam **sete**:

```
support_inbox_poll, support_pending_reminder, support_analyze,
purchase_confirmed, pharmacy_order, create_shipping_label,
avulso_renewal_reminder
```

Crie `supabase/migrations/<timestamp>_job_type_restantes.sql` seguindo o padrão
das migrações que já fizeram isso (`20260812000000_hotmart_sales.sql` tem o
formato, com `DO $$ ... EXCEPTION` para não quebrar se o enum não existir).

Use `ADD VALUE IF NOT EXISTS`. **Não aplique a migração** — eu aplico no RDS e
confiro.

**Armadilha:** `ALTER TYPE ... ADD VALUE` não roda dentro de bloco de transação
em versões antigas do Postgres. O RDS é 17, onde funciona, mas mantenha cada
`ADD VALUE` em instrução própria como as migrações anteriores fazem.

## Correção 2 — um helper compartilhado

Hoje a função `insertBackgroundJob` está **copiada em três arquivos**
(`youtube-analytics-sync`, `hotmart-sales-sync`, `omie-financeiro-sync`), todas
idênticas. `rfm-recalc` e `pharmacy-reconciliation` fazem o INSERT à mão.

Extraia para **`src/lib/jobs/registro.ts`**:

```ts
export async function registrarInicio(jobType: string): Promise<string>
export async function registrarFim(id: string, opts: {
  status: 'completed' | 'failed'
  affectedRows?: number
  payload?: unknown
}): Promise<void>
```

`registrarInicio` insere com `status = 'running'` e devolve o id.
`registrarFim` fecha com `completed_at`.

Faça os **cinco que já registram** passarem a usar o helper, removendo as
cópias. Não mude o comportamento deles — só a origem do código.

## Correção 3 — os oito passam a registrar

Em cada uma das 8 funções: `registrarInicio` no começo, `registrarFim` no fim,
e `registrarFim(..., { status: 'failed' })` no caminho de erro.

### Regras que importam

**O registro nunca pode derrubar o job.** Se gravar em `background_jobs`
falhar, registre com `console.error` e siga — o trabalho de verdade vale mais
que a telemetria dele. Envolva as chamadas do helper em `try/catch` interno.

**`support-inbox-poll` roda a cada 5 minutos** — são ~288 linhas por dia só
dele. Não grave `payload` grande nele; `affected_rows` com a contagem de
mensagens basta. Nos outros, `payload` pequeno e útil (ids, contagens), nunca
corpo de e-mail nem dado clínico.

**Job por evento que não tem o que fazer também registra**, com
`affected_rows = 0`. "Rodou e não havia trabalho" é informação diferente de
"não rodou" — e a segunda é justamente a que o vigia procura.

## O que NÃO fazer

- **Não aplique a migração** nem rode SQL contra o banco.
- **Não faça deploy**, não mexa em task definition, Secrets Manager,
  EventBridge, CloudWatch nem em `db/vigia/`.
- **Não crie a aba de alertas no admin** — ela foi decidida como primeiro
  satélite da Fase 6, fora do núcleo.
- **Não mexa na lógica de negócio de nenhuma das 8 funções.** Só instrumentação:
  se um `if` de regra mudar, está errado.
- **Não crie `/nova-senha`** nem mexa na trava de assinatura concorrente.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `grep -rn "function insertBackgroundJob" src/` não devolve nada — o helper
   vive só em `src/lib/jobs/registro.ts`.
3. `grep -rln "registrarInicio" src/lib/inngest/functions/` devolve **13**
   arquivos.
4. A migração acrescenta exatamente **7** valores, sem repetir `payment_retry`.
5. Nenhuma função pode falhar por causa do registro — o `try/catch` interno
   está lá.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor.
