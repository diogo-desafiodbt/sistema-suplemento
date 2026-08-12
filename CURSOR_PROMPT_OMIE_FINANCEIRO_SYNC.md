# Prompt para o Cursor — Sync financeiro do Omie (contas pagas/recebidas → fluxo de caixa/DRE)

Objetivo: abastecer o banco com os lançamentos financeiros **liquidados**
(pagos ou recebidos) do Omie, pra montar fluxo de caixa e DRE em cima
disso. Só armazenamento/relatório — não dispara nenhum efeito colateral no
app. Segue o mesmo padrão do sync do Hotmart (`hotmart-sales-sync.ts`,
`src/lib/hotmart/client.ts`): job Inngest com cron diário + script de
backfill avulso.

Diferente do Hotmart: a API do Omie é **só POST** (GET é rejeitado),
autentica com `app_key`/`app_secret` **dentro do corpo JSON** (não em
header, não é OAuth — não precisa de token/cache), e tem rate limit de
**4 requisições/segundo**.

Todas as chamadas abaixo foram testadas ao vivo contra a API real antes
desse prompt — os nomes de campo são confirmados, não chutados.

============================================================
PARTE 1 — MIGRATION
============================================================

1.1 — Criar tabela `omie_categorias` (plano de contas — full refresh, é
  pequena, ~150 registros):

  ```sql
  create table public.omie_categorias (
    codigo text primary key,
    descricao text,
    descricao_padrao text,
    categoria_superior text,
    codigo_dre text,
    conta_receita boolean,
    conta_despesa boolean,
    totalizadora boolean,
    conta_inativa boolean,
    tipo_categoria text,
    raw_payload jsonb not null default '{}'::jsonb,
    synced_at timestamptz not null default now()
  );

  alter table public.omie_categorias enable row level security;
  grant select, insert, update on public.omie_categorias to service_role;
  ```

1.2 — Criar tabela `omie_movimentos_financeiros` (um lançamento liquidado
  por linha — pago ou recebido, upsert por `codigo_titulo`):

  ```sql
  create table public.omie_movimentos_financeiros (
    id uuid primary key default gen_random_uuid(),
    codigo_titulo bigint not null unique,
    codigo_titulo_repeticao bigint,
    grupo text not null,
    natureza text,
    categoria_codigo text,
    projeto_codigo bigint,
    cliente_fornecedor_codigo bigint,
    cliente_cpf_cnpj text,
    conta_corrente_codigo bigint,
    numero_parcela text,
    origem text,
    tipo text,
    status text,
    data_emissao date,
    data_vencimento date,
    data_previsao date,
    data_registro date,
    data_pagamento date,
    valor_titulo numeric,
    liquidado boolean,
    valor_pago numeric,
    valor_liquido numeric,
    valor_aberto numeric,
    desconto numeric,
    juros numeric,
    multa numeric,
    raw_payload jsonb not null default '{}'::jsonb,
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );

  create index omie_mov_data_pagamento_idx on public.omie_movimentos_financeiros (data_pagamento);
  create index omie_mov_categoria_idx on public.omie_movimentos_financeiros (categoria_codigo);
  create index omie_mov_grupo_idx on public.omie_movimentos_financeiros (grupo);

  alter table public.omie_movimentos_financeiros enable row level security;
  grant select, insert, update on public.omie_movimentos_financeiros to service_role;
  ```

  Sem FK entre `categoria_codigo` e `omie_categorias.codigo` de propósito
  (evita que o job de movimentos quebre se rodar antes do de categorias,
  ou se vier uma categoria nova que ainda não foi sincronizada) — só índice.

  Sem policy de leitura pra `authenticated`/`anon` nas duas tabelas — mesmo
  padrão do `hotmart_sales`, só o job (service_role) escreve.

1.3 — Criar as duas views de relatório:

  ```sql
  create view public.omie_fluxo_caixa as
  select
    date_trunc('month', data_pagamento)::date as mes,
    conta_corrente_codigo,
    natureza,
    sum(valor_pago) as total
  from public.omie_movimentos_financeiros
  where liquidado = true
  group by 1, 2, 3
  order by 1;

  create view public.omie_dre as
  select
    date_trunc('month', m.data_pagamento)::date as mes,
    c.codigo as categoria_codigo,
    c.descricao as categoria_descricao,
    c.conta_receita,
    c.conta_despesa,
    sum(m.valor_liquido) as total
  from public.omie_movimentos_financeiros m
  left join public.omie_categorias c on c.codigo = m.categoria_codigo
  where m.liquidado = true
  group by 1, 2, 3, 4, 5
  order by 1;
  ```

  Nota: a view de DRE agrupa por categoria bruta, não pela estrutura
  oficial de linhas de DRE do Omie (não existe endpoint público que
  devolva essa árvore — testei vários nomes de método, nenhum existe).
  Serve bem como primeira versão; se precisar bater exatamente com o
  relatório de DRE de dentro do Omie, isso é uma iteração futura.

1.4 — Mesmo cuidado do Hotmart: `background_jobs.job_type` é um **enum**
  do Postgres, não texto livre. Adicionar o valor novo:

  ```sql
  DO $$
  BEGIN
    ALTER TYPE public.job_type ADD VALUE 'omie_financeiro_sync';
  EXCEPTION
    WHEN undefined_object THEN
      RAISE NOTICE 'enum public.job_type não encontrado — job_type pode ser text';
    WHEN duplicate_object THEN
      NULL;
  END $$;
  ```

============================================================
PARTE 2 — Cliente da API do Omie
============================================================

Criar `src/lib/omie/client.ts`, `fetch` nativo, sem dependência nova.

**Autenticação**: `app_key` e `app_secret` são campos de primeiro nível no
corpo JSON de toda chamada — não vão em header, não tem token pra buscar.

**Envelope de toda chamada** (confirmado — testei ao vivo):

```json
{
  "call": "<NomeDoMetodo>",
  "app_key": "<OMIE_APP_KEY>",
  "app_secret": "<OMIE_APP_SECRET>",
  "param": [ { /* parâmetros do método, sempre um array com 1 objeto */ } ]
}
```

Sempre `POST`, sempre `Content-Type: application/json`. GET não é aceito
pela API do Omie (retorna erro).

**Rate limit**: 4 requisições/segundo. Como os dois métodos abaixo
paginam, colocar um `await sleep(300)` (ou similar, ~3-4 chamadas/s) entre
páginas consecutivas dentro do loop de paginação, pra não estourar.

---

**2.1 — Listar categorias** (plano de contas):

```
POST https://app.omie.com.br/api/v1/geral/categorias/
call: "ListarCategorias"
param: [{ "pagina": 1, "registros_por_pagina": 50, "apenas_importado_api": "N" }]
```

Resposta (`categoria_cadastro[]`, paginação em `pagina`/`total_de_paginas`):

```json
{
  "codigo": "1.01.01",
  "descricao": "Clientes - Venda de Mercadoria Fabricadas",
  "descricao_padrao": "Clientes - Venda de Mercadoria Fabricadas",
  "categoria_superior": "0",
  "codigo_dre": "1.01.01",
  "conta_receita": "S",
  "conta_despesa": "N",
  "totalizadora": "N",
  "conta_inativa": "N",
  "tipo_categoria": ""
}
```

Mapear `"S"/"N"` pra boolean nos campos `conta_receita`, `conta_despesa`,
`totalizadora`, `conta_inativa`.

---

**2.2 — Listar movimentos financeiros liquidados** (pagos + recebidos):

```
POST https://app.omie.com.br/api/v1/financas/mf/
call: "ListarMovimentos"
param: [{
  "nPagina": 1,
  "nRegPorPagina": 50,
  "cStatus": "LIQUIDADO",
  "dDtPagtoDe": "01/08/2026",
  "dDtPagtoAte": "12/08/2026"
}]
```

**Atenção**: esse módulo usa nomes de parâmetro em Hungarian notation
(`nPagina`, `nRegPorPagina`, `dDtPagtoDe`, `dDtPagtoAte`) — diferente do
padrão `pagina`/`registros_por_pagina` usado em `ListarCategorias`. Não
tentar unificar, são módulos diferentes da API do Omie com convenções
próprias.

Resposta (`movimentos[]`, paginação em `nPagina`/`nTotPaginas`), cada item
com `detalhes` + `resumo`:

```json
{
  "detalhes": {
    "nCodTitulo": 2087481520,
    "nCodTitRepet": 2087481520,
    "cGrupo": "CONTA_A_RECEBER",
    "cNatureza": "R",
    "cCodCateg": "1.01.01",
    "cCodProjeto": 2087481459,
    "nCodCliente": 2087481005,
    "cCPFCNPJCliente": "42.608.507/0001-72",
    "nCodCC": 2087480949,
    "cNumParcela": "001/037",
    "cOrigem": "MANR",
    "cTipo": "99999",
    "cStatus": "RECEBIDO",
    "dDtEmissao": "16/03/2026",
    "dDtVenc": "16/03/2026",
    "dDtPrevisao": "16/03/2026",
    "dDtRegistro": "28/03/2026",
    "dDtPagamento": "28/03/2026",
    "nValorTitulo": 10210.82
  },
  "resumo": {
    "cLiquidado": "S",
    "nValPago": 10210.82,
    "nValLiquido": 10210.82,
    "nValAberto": 0,
    "nDesconto": 0,
    "nJuros": 0,
    "nMulta": 0
  }
}
```

`cGrupo` diferencia contas a pagar de contas a receber — os dois vêm
juntos nessa mesma chamada, sem precisar de dois endpoints separados.
Datas no formato `DD/MM/YYYY`, converter pra `date` do Postgres.

Mapeamento pra `omie_movimentos_financeiros`: `codigo_titulo` =
`detalhes.nCodTitulo`, `codigo_titulo_repeticao` = `detalhes.nCodTitRepet`,
`grupo` = `detalhes.cGrupo`, `natureza` = `detalhes.cNatureza`,
`categoria_codigo` = `detalhes.cCodCateg`, `projeto_codigo` =
`detalhes.cCodProjeto`, `cliente_fornecedor_codigo` =
`detalhes.nCodCliente`, `cliente_cpf_cnpj` = `detalhes.cCPFCNPJCliente`,
`conta_corrente_codigo` = `detalhes.nCodCC`, `numero_parcela` =
`detalhes.cNumParcela`, `origem` = `detalhes.cOrigem`, `tipo` =
`detalhes.cTipo`, `status` = `detalhes.cStatus`, `data_emissao` =
`detalhes.dDtEmissao`, `data_vencimento` = `detalhes.dDtVenc`,
`data_previsao` = `detalhes.dDtPrevisao`, `data_registro` =
`detalhes.dDtRegistro`, `data_pagamento` = `detalhes.dDtPagamento`,
`valor_titulo` = `detalhes.nValorTitulo`, `liquidado` =
`resumo.cLiquidado === 'S'`, `valor_pago` = `resumo.nValPago`,
`valor_liquido` = `resumo.nValLiquido`, `valor_aberto` =
`resumo.nValAberto`, `desconto`/`juros`/`multa` =
`resumo.nDesconto`/`nJuros`/`nMulta`, `raw_payload` = o item inteiro
(`{ detalhes, resumo }`).

============================================================
PARTE 3 — Job Inngest
============================================================

3.1 — Criar `src/lib/inngest/functions/omie-financeiro-sync.ts`:
  - Cron diário: `{ cron: 'TZ=America/Sao_Paulo 0 6 * * *' }` (antes do
    `hotmart-sales-sync`, que roda às 7h — evita concorrência desnecessária,
    não é uma exigência técnica, só organização)
  - **Passo 1 — categorias**: pagina `ListarCategorias` até acabar,
    upsert em `omie_categorias` (`on conflict (codigo) do update`)
  - **Passo 2 — movimentos**: calcula uma janela de **últimos 3 dias
    corridos** (`dDtPagtoDe`/`dDtPagtoAte`, formato `DD/MM/YYYY`,
    timezone America/Sao_Paulo — margem de segurança maior que o Hotmart
    porque aqui a paginação é mais pesada), sempre com `cStatus:
    "LIQUIDADO"`, pagina até acabar, upsert em `omie_movimentos_financeiros`
    (`on conflict (codigo_titulo) do update`)
  - Usa `createAdminClient()`, mesmo client admin dos outros jobs
  - Registra em `background_jobs`: `job_type: 'omie_financeiro_sync'`,
    `payload: { totalCategorias, totalMovimentosFetched,
    totalMovimentosUpserted, windowStart, windowEnd }`, `status:
    'completed'` ou `'failed'`

3.2 — Registrar a function em `src/app/api/inngest/route.ts` (import +
  array `functions`), igual às outras.

============================================================
PARTE 4 — Env vars
============================================================

Adicionar no `.env.example`:

```
# -----------------------------------------------------------------------------
# Omie — sync de financeiro (contas pagas/recebidas → fluxo de caixa/DRE)
# Ferramentas > API > Aplicativos
# -----------------------------------------------------------------------------
OMIE_APP_KEY=
OMIE_APP_SECRET=
```

`.env.local` já está preenchido com `OMIE_APP_KEY` e `OMIE_APP_SECRET`.

============================================================
PARTE 5 — Script de backfill (últimos 6 meses, roda uma vez)
============================================================

Mesmo padrão do `scripts/hotmart-backfill.mjs`: script standalone
(`scripts/omie-backfill.mjs`), lê `.env.local` na mão, conecta no Supabase
direto com `@supabase/supabase-js`, roda via `node scripts/omie-backfill.mjs`.
Não usa Inngest, não fica agendado.

5.1 — Primeiro sincroniza **todas** as categorias (mesma lógica do Passo 1
  do job, paginando `ListarCategorias` até acabar).

5.2 — Depois, janela total de **6 meses** (`end = hoje`, `start = 6 meses
  atrás`), quebrada em **fatias mensais** (6 chamadas de ~30 dias cada,
  mesmo motivo do Hotmart: mais fácil acompanhar progresso e re-rodar um
  mês específico se falhar). Pra cada fatia: pagina `ListarMovimentos` com
  `cStatus: "LIQUIDADO"` e a janela da fatia (`dDtPagtoDe`/`dDtPagtoAte`),
  respeitando o rate limit de 4 req/s entre páginas, faz upsert em
  `omie_movimentos_financeiros` (mesmo mapeamento da Parte 2.2), loga por
  fatia (itens da API, upsertados) e o total geral no final.

5.3 — Idempotente por natureza (upsert por `codigo_titulo`) — pode rodar
  de novo sem duplicar.

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- `.env.local` já tem `OMIE_APP_KEY` e `OMIE_APP_SECRET` preenchidos.
- Depois de aplicado e testado local, adicionar as 2 vars na Vercel
  (produção) também — necessário só pro job diário (Parte 3).
- Ordem de execução: 1) aplicar a migration, 2) rodar o script de backfill
  (Parte 5) pra trazer os últimos 6 meses, 3) só depois confiar no job
  diário (Parte 3) pra manter o fluxo daí pra frente.
- As views `omie_fluxo_caixa` e `omie_dre` já ficam prontas assim que os
  dados existirem — não precisa de passo extra, é só consultar.
