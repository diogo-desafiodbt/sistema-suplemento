# Prompt para o Cursor — Painel de Visão Geral do admin (funil + alertas)

Criar a página inicial do admin (`/admin`, hoje só redireciona pra
`/admin/usuarios` — isso muda) com duas seções: funil de conversão da
operação inteira, e alertas do que precisa de ação humana agora.

============================================================
PARTE 1 — Nav compartilhada entre as páginas do admin
============================================================

Hoje as páginas do admin não têm navegação entre si. Criar
`src/app/(admin)/layout.tsx` com uma barra de navegação simples no topo,
aplicada a todas as páginas do grupo `(admin)`, com links pra: Visão Geral
(`/admin`), Clientes (`/admin/clientes`), Pedidos (`/admin/pedidos`),
Usuários (`/admin/usuarios`), Cupons (`/admin/cupons`), Config
(`/admin/config`), Auditoria (`/admin/auditoria`). Seguir o estilo visual já
usado nas páginas existentes do admin (mesma paleta, tipografia).

============================================================
PARTE 2 — Funil de conversão
============================================================

Em `src/app/(admin)/admin/page.tsx` (remover o redirect atual), criar a
seção de funil com um seletor de período (padrão: últimos 30 dias; opções:
7/30/90 dias, ou tudo). Para o período selecionado, contar e exibir em
sequência (com número absoluto e % de queda em relação à etapa anterior):

1. **Quiz iniciado** — `quiz_sessions` criadas no período
2. **Quiz concluído** — `quiz_responses` criadas no período
3. **Checkout iniciado** — `terms_acceptances` criados no período (é o
   evento mais confiável pra isso: acontece logo após a criação da
   assinatura no checkout, e sobrevive mesmo quando o pagamento falha e a
   subscription é deletada — ver `subscription_id` podendo ser null nesses
   casos)
4. **Pagamento confirmado** — `payments` com `status = 'paid'` no período
5. **Prescrição assinada** — `protocols` com `status = 'signed'` no período
   (usar `signed_at`)
6. **Enviado à farmácia** — `orders` com `pharmacy_sent_at` preenchido no
   período
7. **Despachado** — `orders` com `status = 'dispatched'` no período
8. **Entregue** — `orders` com `status = 'delivered'` no período

Exibir como uma lista vertical simples (número grande + label + % de queda
da etapa anterior), não precisa ser um gráfico sofisticado — clareza acima
de estética aqui.

============================================================
PARTE 3 — Alertas operacionais
============================================================

3.1 — Antes de tudo, ajustar
`src/lib/inngest/functions/pharmacy-reconciliation.ts`: depois de montar o
`report` (já existe essa variável), inserir o resultado também em
`background_jobs` (job_type, status, payload, affected_rows, completed_at) —
hoje esse job só manda e-mail, sem deixar rastro consultável no banco. Usar
`job_type: 'pharmacy_json'` (reaproveitar o enum existente, já que não dá
pra adicionar valor novo sem migration — ou criar migration adicionando
`'pharmacy_reconciliation'` ao enum `job_type` se preferir mais clareza,
critério do Cursor) e `status: 'completed'` se `report.ok`, `'failed'` caso
contrário, com o `report` inteiro no campo `payload`.

3.2 — Na página `/admin` (mesma página do funil), seção de alertas:
  - **Protocolos parados**: `protocols` com `status = 'pending_signature'`
    e `generated_at` há mais de 3 dias — listar nome do paciente e há
    quantos dias está parado
  - **Pedidos sem envio à farmácia**: `orders` com `pharmacy_sent_at` nulo
    e `created_at` há mais de 2 dias
  - **Reconciliação da farmácia**: buscar o registro mais recente de
    `background_jobs` do job_type usado no item 3.1 — se `status = 'failed'`
    ou se não houver nenhum registro nas últimas 24h, mostrar alerta
  - **Pagamentos falhados recentes**: `payments` com `status = 'failed'`
    nos últimos 7 dias
  - **Webhooks não processados**: `webhook_logs` com `processed = false`
    nos últimos 7 dias

Cada alerta deve linkar pro lugar certo pra resolver (ex: protocolo parado
→ `/admin/clientes/[id]` daquele paciente, se a página de cliente já
existir; pedido sem farmácia → `/admin/pedidos`).

Se uma categoria de alerta estiver vazia, mostrar um estado neutro tipo
"Tudo certo por aqui" — não esconder a seção, pra reforçar que foi
checado.

============================================================
NOTAS TÉCNICAS
============================================================

- Usar `createAdminClient()` (service role), mesmo padrão das outras
  páginas admin.
- Proteger a rota com a mesma checagem de role admin já usada nas demais
  páginas do grupo `(admin)`.
- Essa página é só leitura — nenhuma ação de escrita aqui além do que já
  foi descrito em 3.1.
