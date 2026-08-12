# Prompt para o Cursor — Backfill de 6 meses de vendas do Hotmart

O sync diário do Hotmart (`hotmart-sales-sync`, tabela `hotmart_sales`,
cliente em `src/lib/hotmart/client.ts`) já está implementado e commitado —
não mexer nisso. Ele só cobre os últimos 2 dias a cada execução.

Falta agora um **script avulso, rodado uma vez só, na mão** — não Inngest,
não cron — pra trazer o histórico dos últimos 6 meses de vendas que já
aconteceram antes de esse job existir. Mesmo padrão dos scripts que já
existem em `scripts/` (ver `scripts/validate-regua-cobranca.mjs`): lê
`.env.local` na mão com `readFileSync`, conecta no Supabase direto com
`@supabase/supabase-js` usando `SUPABASE_SERVICE_ROLE_KEY`.

============================================================
Criar `scripts/hotmart-backfill.mjs`
============================================================

- É `.mjs` puro, fora do build do Next — **reimplementar** a mesma lógica
  de auth OAuth e paginação que já existe em `src/lib/hotmart/client.ts`
  (não dá pra importar TS direto num script `.mjs` standalone). São só duas
  funções: pegar token OAuth e paginar `sales/history` — pode copiar a
  lógica de lá adaptando pra JS puro.

  - Token: `POST https://api-sec-vlc.hotmart.com/security/oauth/token`
    com `?grant_type=client_credentials&client_id=...&client_secret=...`,
    header `Authorization: <HOTMART_BASIC_TOKEN>` (o valor já vem pronto
    como `"Basic xxxxx"`) + `Content-Type:
    application/x-www-form-urlencoded`. Resposta: `{ access_token,
    expires_in }`.
  - Sales: `GET
    https://developers.hotmart.com/payments/api/v1/sales/history?product_id=...&start_date=...&end_date=...&max_results=50&page_token=...`,
    header `Authorization: Bearer <access_token>`. Paginar seguindo
    `page_info.next_page_token` até acabar.

- Janela total: `end = Date.now()`, `start = 6 meses atrás`
  (`Date.now() - 6 * 30 * 24 * 60 * 60 * 1000` é suficiente, não precisa
  ser exato).

- **Quebrar a janela total em fatias mensais** (6 chamadas com
  `start`/`end` de ~30 dias cada, em vez de uma janela só de 6 meses) —
  mais fácil de acompanhar o progresso no log e de re-rodar só um mês
  específico se algo falhar no meio.

- Pra cada fatia:
  - Pagina `sales/history` com `product_id = process.env.HOTMART_PRODUCT_ID`
    até `page_info.next_page_token` acabar.
  - Mapeia cada item pro formato da tabela `hotmart_sales` — **usar
    exatamente o mesmo mapeamento de `mapSaleRow` em
    `src/lib/inngest/functions/hotmart-sales-sync.ts`** (mesmos campos:
    `transaction_code`, `product_id`, `product_name`, `buyer_name`,
    `buyer_email`, `buyer_ucode`, `status`, `order_date`, `approved_date`,
    `price_value`, `price_currency`, `payment_method`, `is_subscription`,
    `recurrency_number`, `commission_as`, `raw_payload`, `synced_at`).
    Itens sem `transaction`, `product.id` ou `purchase.status` são
    descartados (mesma regra do job).
  - Faz upsert em `hotmart_sales` em lote (`on conflict (transaction_code)
    do update`) via `@supabase/supabase-js`.
  - Loga no console: mês da fatia, quantos itens vieram da API, quantos
    foram upsertados.

- No final, logar o total geral (soma de todas as fatias) e quantos foram
  descartados por falta de campo obrigatório (se houver).

- Idempotente por natureza (upsert por `transaction_code`) — pode rodar de
  novo sem medo de duplicar se precisar re-executar (ex.: se travar no meio
  ou eu quiser reprocessar um mês específico depois).

- Uso: `node scripts/hotmart-backfill.mjs` (ler `.env.local` — já tem
  `HOTMART_CLIENT_ID`, `HOTMART_CLIENT_SECRET`, `HOTMART_BASIC_TOKEN` e
  `HOTMART_PRODUCT_ID=7689853` preenchidos, mesma env var que o job diário
  usa).

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Migration e env vars de produção (Vercel) já aplicadas — não precisa
  mexer nisso de novo.
- Depois que o Cursor implementar, rodar `node scripts/hotmart-backfill.mjs`
  localmente uma vez pra trazer o histórico.
