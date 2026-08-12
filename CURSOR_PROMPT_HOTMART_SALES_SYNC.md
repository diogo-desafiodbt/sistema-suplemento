# Prompt para o Cursor — Sync de vendas do Hotmart (Guia Primeiro Passo)

Objetivo: abastecer o banco com as vendas do produto "Guia Primeiro Passo",
vendido no Hotmart — só armazenamento/relatório, **não** dispara nenhum
efeito colateral no sistema (sem criar `user`, sem `entitlement`, sem
e-mail). Duas peças:

- **Job recorrente** (Partes 1-4): cron diário via Inngest, segue o mesmo
  padrão do `pharmacy-reconciliation.ts` — escreve no Supabase, registra em
  `background_jobs`. Cobre só os últimos 2 dias a cada execução.
- **Script de backfill** (Parte 5): roda uma vez só, na mão, pra trazer o
  histórico dos últimos 6 meses de vendas que já aconteceram antes de o job
  recorrente existir.

============================================================
PARTE 1 — MIGRATION
============================================================

1.1 — Criar tabela `hotmart_sales` (uma linha por transação, upsert por
  `transaction_code` — o Hotmart pode reenviar a mesma venda com status
  atualizado, ex.: aprovado → reembolsado):

  ```sql
  create table public.hotmart_sales (
    id uuid primary key default gen_random_uuid(),
    transaction_code text not null unique,
    product_id bigint not null,
    product_name text,
    buyer_name text,
    buyer_email text,
    buyer_ucode text,
    status text not null,
    order_date timestamptz,
    approved_date timestamptz,
    price_value numeric,
    price_currency text,
    payment_method text,
    is_subscription boolean,
    recurrency_number integer,
    commission_as text,
    raw_payload jsonb not null default '{}'::jsonb,
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );

  create index hotmart_sales_order_date_idx on public.hotmart_sales (order_date);
  create index hotmart_sales_status_idx on public.hotmart_sales (status);

  alter table public.hotmart_sales enable row level security;
  grant select, insert, update on public.hotmart_sales to service_role;
  ```

  Sem policy de leitura pra `authenticated`/`anon` — só o job (service_role,
  que ignora RLS) escreve, e por enquanto ninguém no app precisa ler daqui.
  Seguir o padrão de RLS já usado nas outras tabelas internas
  (`pharmacy_api_logs`, `webhook_logs`).

============================================================
PARTE 2 — Cliente da API do Hotmart
============================================================

Criar `src/lib/hotmart/client.ts` com um client mínimo (sem dependência
nova, usar `fetch` nativo — mesmo estilo dos outros integrations do
projeto, ex. `src/lib/shipping/envie-agora/`).

**Autenticação (OAuth2 client_credentials):**

```
POST https://api-sec-vlc.hotmart.com/security/oauth/token
  ?grant_type=client_credentials
  &client_id=<HOTMART_CLIENT_ID>
  &client_secret=<HOTMART_CLIENT_SECRET>

Headers:
  Authorization: <HOTMART_BASIC_TOKEN>   (já vem pronto como "Basic xxxxx", usar o valor direto)
  Content-Type: application/x-www-form-urlencoded
```

Resposta:
```json
{ "access_token": "...", "token_type": "bearer", "expires_in": 86400 }
```

Token vale 24h — cachear em memória do processo (variável de módulo com
`{ token, expiresAt }`) e só renovar quando expirar. Não precisa persistir
em banco, é um job serverless de execução curta.

**Listagem de vendas:**

```
GET https://developers.hotmart.com/payments/api/v1/sales/history
  ?product_id=<HOTMART_PRODUCT_ID>
  &start_date=<epoch_ms>
  &end_date=<epoch_ms>
  &max_results=50
  &page_token=<opcional, cursor da próxima página>

Headers:
  Authorization: Bearer <access_token>
  Content-Type: application/json
```

Paginação por cursor: resposta traz `page_info.next_page_token`; repetir a
chamada passando esse valor em `page_token` até não vir mais token.

**Nota importante**: sem passar `transaction_status`, o endpoint só retorna
vendas `APPROVED` e `COMPLETE` — é o comportamento default do Hotmart e
serve bem pro objetivo atual (só abastecer o banco com vendas concretizadas).
Não precisa filtrar por status explicitamente.

Formato de cada item em `items[]` (usar pra montar a linha da tabela):

```json
{
  "product": { "name": "Product06", "id": 2125812 },
  "buyer": { "name": "...", "ucode": "...", "email": "..." },
  "purchase": {
    "transaction": "HP12455690122399",
    "order_date": 1622948400000,
    "approved_date": 1622948400000,
    "status": "APPROVED",
    "recurrency_number": 2,
    "is_subscription": false,
    "commission_as": "PRODUCER",
    "price": { "value": 235.76, "currency_code": "BRL" },
    "payment": { "method": "BILLET", "installments_number": 1, "type": "BILLET" }
  }
}
```

Mapeamento pra `hotmart_sales`: `transaction_code` = `purchase.transaction`,
`order_date`/`approved_date` = converter epoch ms pra timestamptz,
`price_value`/`price_currency` = `purchase.price.value`/`currency_code`,
`payment_method` = `purchase.payment.method`, `status` = `purchase.status`,
`raw_payload` = o item inteiro (guardar bruto pra reprocessar se precisar de
campo que não foi mapeado).

============================================================
PARTE 3 — Job Inngest
============================================================

3.1 — Criar `src/lib/inngest/functions/hotmart-sales-sync.ts`:
  - Cron diário: `{ cron: 'TZ=America/Sao_Paulo 0 7 * * *' }`
  - Calcula uma janela de **últimos 2 dias corridos** (não só "ontem" —
    dá uma margem de segurança contra falha do job no dia anterior; como o
    upsert é por `transaction_code`, reprocessar não duplica)
  - Busca token via o client da Parte 2
  - Pagina `sales.history` com `product_id = process.env.HOTMART_PRODUCT_ID`
    e a janela de datas calculada, juntando todos os `items` de todas as
    páginas
  - Faz upsert em `hotmart_sales` (`on conflict (transaction_code) do
    update`) com os campos mapeados na Parte 2, usando `createAdminClient()`
    (mesmo client admin usado em `pharmacy-reconciliation.ts`)
  - Registra o resultado em `background_jobs`: `job_type:
    'hotmart_sales_sync'`, `status: 'completed'` (ou `'failed'` se a chamada
    à API do Hotmart falhar), `payload: { totalFetched, totalUpserted,
    windowStart, windowEnd }`, `affected_rows: totalUpserted`
  - Sem envio de e-mail — diferente do `pharmacy-reconciliation.ts`, aqui não
    precisa (só se quiser adicionar isso depois)

3.2 — Registrar a function nova em `src/app/api/inngest/route.ts` (import +
  adicionar no array `functions`), igual às outras já registradas.

============================================================
PARTE 4 — Env vars
============================================================

Adicionar no `.env.example` (sem valor, só documentando):

```
# -----------------------------------------------------------------------------
# Hotmart — sync diário de vendas (Guia Primeiro Passo)
# Manager: Ferramentas > Manager de Aplicações > Credenciais
# -----------------------------------------------------------------------------
HOTMART_CLIENT_ID=
HOTMART_CLIENT_SECRET=
HOTMART_BASIC_TOKEN=
HOTMART_PRODUCT_ID=
```

`.env.local` já está preenchido com `HOTMART_CLIENT_ID`,
`HOTMART_CLIENT_SECRET`, `HOTMART_BASIC_TOKEN` e `HOTMART_PRODUCT_ID`
(`7689853`, produto "Guia Primeiro Passo").

============================================================
PARTE 5 — Script de backfill (últimos 6 meses, roda uma vez)
============================================================

Separado do job da Parte 3 — não usa Inngest, não fica agendado. É um
script standalone, mesmo padrão dos que já existem em `scripts/`
(`validate-regua-cobranca.mjs`): lê `.env.local` na mão com `readFileSync`,
conecta no Supabase direto com `@supabase/supabase-js` usando
`SUPABASE_SERVICE_ROLE_KEY`, roda via `node scripts/hotmart-backfill.mjs`.

5.1 — Criar `scripts/hotmart-backfill.mjs`:
  - Reimplementa (duplica, não importa de `src/lib/hotmart/client.ts` — é
    `.mjs` puro, fora do build do Next) a mesma lógica de auth OAuth e
    paginação da Parte 2.
  - Janela total: `end_date = Date.now()`, `start_date = 6 meses atrás em
    ms` (`Date.now() - 6 * 30 * 24 * 60 * 60 * 1000` é suficiente, não
    precisa ser exato).
  - **Quebrar a janela total em fatias mensais** (6 chamadas com
    `start_date`/`end_date` de ~30 dias cada, em vez de uma janela só de 6
    meses) — mais fácil de acompanhar o progresso no log e de re-rodar só
    um mês específico se algo falhar no meio.
  - Pra cada fatia: pagina `sales.history` com `product_id =
    HOTMART_PRODUCT_ID` até `page_info.next_page_token` acabar, faz upsert
    em `hotmart_sales` em lote (`on conflict (transaction_code) do
    update`), e loga no console quantos itens vieram e quantos foram
    upsertados naquela fatia.
  - No final, logar o total geral (soma de todas as fatias).
  - Idempotente por natureza (upsert por `transaction_code`) — pode rodar
    de novo sem medo de duplicar se precisar re-executar.

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Depois de aplicado e testado local, adicionar as 4 vars
  (`HOTMART_CLIENT_ID`, `HOTMART_CLIENT_SECRET`, `HOTMART_BASIC_TOKEN`,
  `HOTMART_PRODUCT_ID=7689853`) na Vercel (produção) também — necessário só
  pro job recorrente (Parte 3), que roda lá. O script de backfill (Parte 5)
  eu rodo uma vez local, não precisa subir pra Vercel.
- Testar local rodando o job manualmente antes de confiar no cron — Inngest
  Dev Server permite invocar a function na mão pela UI (`npx inngest-cli@latest dev`).
- Ordem de execução: 1) aplicar a migration, 2) rodar o script de backfill
  (Parte 5) pra trazer os últimos 6 meses, 3) só depois ativar/confiar no
  job diário (Parte 3) pra manter o fluxo daí pra frente.
