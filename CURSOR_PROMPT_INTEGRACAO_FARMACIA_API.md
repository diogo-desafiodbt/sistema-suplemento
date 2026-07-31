# Prompt para o Cursor — Split de origem Norte/Nordeste + API de integração com a farmácia

Duas frentes:
(1) cotação/etiqueta passam a escolher a origem do frete (Curitiba ou
Fortaleza) conforme o destino do pedido;
(2) a farmácia (Miligrama) passa a **puxar** os pedidos da nossa API
diretamente (pull, com token), em vez de receber só por e-mail. O e-mail
continua existindo em paralelo por enquanto (não remover), a API é um canal
a mais.

============================================================
PARTE 1 — MIGRATION
============================================================

1.1 — Inserir em `system_config` (on conflict do nothing) o endereço da
  filial de Fortaleza:
  - shipping_sender_fortaleza_nome        | 'Miligrama'
  - shipping_sender_fortaleza_cep         | '60150161'
  - shipping_sender_fortaleza_logradouro  | 'Av. Santos Dumont'
  - shipping_sender_fortaleza_numero      | '2284'
  - shipping_sender_fortaleza_complemento | '1º andar'
  - shipping_sender_fortaleza_bairro      | 'Aldeota'
  - shipping_sender_fortaleza_cidade      | 'Fortaleza'
  - shipping_sender_fortaleza_uf          | 'CE'

1.2 — Criar tabela `pharmacy_api_logs` (log de cada chamada que a Miligrama
  fizer nos endpoints novos, usado na checagem diária da Parte 4):
  ```sql
  create table public.pharmacy_api_logs (
    id uuid primary key default gen_random_uuid(),
    endpoint text not null,
    query_params jsonb not null default '{}'::jsonb,
    order_ids_returned jsonb not null default '[]'::jsonb,
    called_at timestamptz not null default now()
  );
  grant select, insert on public.pharmacy_api_logs to service_role;
  ```

============================================================
PARTE 2 — Origem do frete por região (Curitiba x Fortaleza)
============================================================

2.1 — Criar `src/lib/shipping/sender-region.ts`:
  ```ts
  const NORTE_NORDESTE_UFS = [
    'AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO',
    'AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE',
  ]

  export function isNorteNordeste(uf: string): boolean {
    return NORTE_NORDESTE_UFS.includes(uf.trim().toUpperCase())
  }

  export type SenderAddress = {
    nome: string
    cep: string
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    cidade: string
    uf: string
  }

  export async function getSenderAddress(destinoUf: string): Promise<SenderAddress> {
    const prefix = isNorteNordeste(destinoUf)
      ? 'shipping_sender_fortaleza'
      : 'shipping_sender'
    // buscar em system_config as chaves `${prefix}_nome`, `${prefix}_cep`,
    // `${prefix}_logradouro`, `${prefix}_numero`, `${prefix}_complemento`,
    // `${prefix}_bairro`, `${prefix}_cidade`, `${prefix}_uf` e montar o objeto
  }
  ```

2.2 — Em `src/lib/shipping/envie-agora/cotacao.ts` (`getCotacao`): hoje o
  `ceporigem` vem fixo de `system_config.shipping_sender_cep`. Trocar pra
  receber um novo parâmetro `destinoUf: string`, chamar
  `getSenderAddress(destinoUf)` e usar o `.cep` retornado como `ceporigem`.

2.3 — Em `src/lib/shipping/envie-agora/etiqueta.ts` (`criarEtiqueta`): hoje o
  `remetente` inteiro vem fixo de `system_config.shipping_sender_*`. Trocar
  pra receber `destinoUf` (ou já receber o `SenderAddress` calculado pelo
  chamador — pode escolher a forma mais limpa) e montar o `remetente` a
  partir de `getSenderAddress(destinoUf)` em vez dos valores fixos.

2.4 — Em `src/app/api/shipping/cotacao/route.ts`: adicionar `uf: z.string().length(2)`
  no `bodySchema`, e passar pro `getCotacao({ ..., destinoUf: uf })`.

2.5 — Em `src/app/(public)/checkout/page.tsx`: no fetch pra
  `/api/shipping/cotacao`, incluir `uf: state` no body (o estado já é
  coletado no formulário de endereço).

2.6 — Em `src/lib/inngest/functions/create-shipping-label.ts` e nas rotas
  admin (`gerar-etiqueta`, e onde mais chamar `criarEtiqueta`): usar o `state`
  do endereço do pedido (já buscado do banco) como `destinoUf` ao chamar
  `criarEtiqueta`.

NÃO mexer no campo `Empresa` do JSON da farmácia — continua sempre o mesmo
código fixo (`pharmacy_company_id`), independente da origem/filial.

============================================================
PARTE 3 — Endpoints da API pra Miligrama puxar os pedidos
============================================================

Autenticação: header `Authorization: Bearer <token>`, comparado contra
`process.env.FARMACIA_API_TOKEN`. Se não bater, 401.

Toda chamada bem-sucedida nos dois endpoints abaixo grava uma linha em
`pharmacy_api_logs` (endpoint, query_params, order_ids_returned, called_at) —
isso alimenta a checagem diária da Parte 4.

3.1 — `GET /api/farmacia/pedidos` (listagem leve — número, data, status):
  - Query params opcionais: `data` (YYYY-MM-DD, um dia específico),
    `desde`/`ate` (intervalo). Se nenhum for passado, retorna TODO o
    histórico.
  - Filtra por `orders.created_at` (interpretar `data`/`desde`/`ate` na
    timezone America/Sao_Paulo)
  - Retorna array: `[{ numero_pedido: orders.id, data_compra: orders.created_at, status: orders.status }]`
  - Loga em `pharmacy_api_logs` com `endpoint: 'listagem'`

3.2 — `GET /api/farmacia/pedidos/json` (JSON completo pra importar):
  - Mesmos query params (`data`/`desde`/`ate`, mesmo default de histórico
    completo se nenhum for passado)
  - Filtra também por `pharmacy_json is not null` (só retorna pedidos que já
    têm o JSON montado — não faz sentido devolver pedido que ainda não tem)
  - Retorna array: `[{ numero_pedido: orders.id, data_compra: orders.created_at, status: orders.status, pedido: orders.pharmacy_json }]`
  - Loga em `pharmacy_api_logs` com `endpoint: 'json'`

============================================================
PARTE 4 — Checagem diária de reconciliação
============================================================

Nova function Inngest com cron diário (ex: `0 9 * * *`, ajustar timezone se
necessário — América/São Paulo):

4.1 — Criar `src/lib/inngest/functions/pharmacy-reconciliation.ts`:
  - Calcula "ontem" (dia anterior à execução)
  - Busca em `orders` todos os pedidos com `created_at` em "ontem"
  - Busca em `pharmacy_api_logs` todas as chamadas com `called_at` também em
    "ontem" (de qualquer um dos dois endpoints), reunindo todos os
    `order_ids_returned` retornados nesse dia
  - Compara: todo `orders.id` de ontem apareceu em pelo menos uma chamada
    logada? Também checa se HOUVE alguma chamada logada nesse dia (se não
    houve nenhuma, é erro mesmo que não haja pedido nenhum de ontem — avisar
    que a Miligrama não puxou nada)
  - Envia e-mail (usar Resend, mesmo padrão de `lib/pharmacy/sender.ts`) pro
    mesmo destinatário já usado (`diretorcomercialtk2@gmail.com`) SEMPRE,
    nos dois casos:
    - Tudo certo: "Reconciliação OK — N pedidos de [data], todos puxados
      pela Miligrama."
    - Erro: "Reconciliação com pendência — [lista de números de pedido que
      não apareceram em nenhuma chamada, ou aviso de que não houve chamada
      nenhuma nesse dia]"

============================================================
PARTE 5 — Documentação pra Miligrama
============================================================

Criar `DOCUMENTACAO_API_FARMACIA_MILIGRAMA.md` na raiz do projeto, em
linguagem simples pra time não-técnico de TI de farmácia, contendo:
- URL base de produção
- Como autenticar (header `Authorization: Bearer <token>`, com o token real
  — usar o valor `023bfed494bffbcff0ce1a31bf14ed129cffab7b591f5b056cbbb9b65e10849f`)
- Os dois endpoints (`/api/farmacia/pedidos` e `/api/farmacia/pedidos/json`),
  com exemplo de request (curl) e exemplo de resposta JSON de cada um
- Explicação dos parâmetros `data`/`desde`/`ate` e o comportamento default
  (sem parâmetro = histórico completo)
- Recomendação de uso: chamar `/pedidos/json?data=<ontem>` uma vez por dia
- Aviso de que cada chamada é registrada do nosso lado pra fins de
  conferência diária

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Depois de aplicado, adicionar `FARMACIA_API_TOKEN` no `.env.local` e na
  Vercel (produção) com o valor
  `023bfed494bffbcff0ce1a31bf14ed129cffab7b591f5b056cbbb9b65e10849f`
- Mandar o documento gerado (Parte 5) pra Miligrama
