# Prompt para o Cursor — Corrigir enum de notification_logs + e-mail de novidade no frete

Duas tarefas nesta leva: (1) um bug pequeno na entrega anterior
(`purchase-confirmed.ts` grava um `type` que não existe no enum do banco,
fazendo o dedupe de 15 min falhar silenciosamente); (2) e-mail novo pro
comprador toda vez que houver novidade no frete do pedido (despacho,
evento de rastreio, entrega).

============================================================
PARTE 1 — Corrigir o enum notification_type
============================================================

1.1 — Nova migration em `supabase/migrations/` (timestamp após a última
existente):
```sql
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'purchase_confirmed';
```
Igual à Parte 1 da tarefa da triagem clínica: `ADD VALUE` não pode ser
usado na mesma transação em que o valor é referenciado — deixar esse
`ALTER TYPE` sozinho no arquivo, sem mais nada junto.

1.2 — O enum já tem um valor `tracking_update` (não usado ainda) — vai ser
reaproveitado na Parte 2, não precisa criar nada pra ele.

1.3 — Nada mais muda em `purchase-confirmed.ts` — o código já está
correto, só faltava esse valor existir no banco.

============================================================
PARTE 2 — E-mail de novidade no frete
============================================================

Contexto: hoje 3 pontos do código atualizam o rastreio de um pedido, e
nenhum deles avisa o comprador:
- `src/app/api/webhooks/shipping/etiqueta/route.ts` — webhook da
  transportadora quando a etiqueta é gerada (define `tracking_code` e
  `status: 'dispatched'`).
- `src/app/api/webhooks/shipping/rastreamento/route.ts` — webhook a cada
  novo evento de trânsito (usa `mergeTrackingEvents` pra acumular em
  `orders.shipping_json.eventos`, marca `status: 'delivered'` quando algum
  evento vem com `finalizado === 1`).
- `src/app/api/admin/pedidos/[id]/atualizar-rastreio/route.ts` — mesma
  lógica de rastreamento, só que disparada manualmente pelo admin.

2.1 — Migration nova (pode ir no mesmo arquivo da Parte 1.1 se preferir
separar por causa do `ALTER TYPE`, ou em outro arquivo de migration à
parte):
```sql
CREATE TABLE IF NOT EXISTS shipping_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event_id)
);
```
`event_id` guarda o `id` numérico do evento de rastreio (convertido pra
texto) pros casos de trânsito, e um valor fixo tipo `'etiqueta'` ou
`'entregue'` pros casos de despacho/entrega. A constraint `UNIQUE
(order_id, event_id)` é o que garante que o mesmo evento nunca dispara
e-mail duas vezes, mesmo se o webhook da transportadora reenviar (comum em
integrações desse tipo).

2.2 — Criar `src/lib/shipping/notify.ts`, módulo compartilhado usado pelos
3 pontos de entrada:

```ts
export type ShippingNotificationKind = 'dispatched' | 'tracking' | 'delivered'

export async function notifyShippingUpdate(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    orderId: string
    eventId: string // 'etiqueta' | 'entregue' | String(evento.id)
    kind: ShippingNotificationKind
    trackingCode?: string | null
    descricao?: string | null
    local?: string | null
    cidade?: string | null
  }
): Promise<void>
```

Lógica interna:
- Buscar o pedido: `orders` (`id, user_id`) pelo `orderId`.
- Buscar o comprador: `users` (`full_name, email`) pelo `user_id` do
  pedido.
- Se não tiver e-mail, retornar sem fazer nada (mesmo padrão de
  `purchase-confirmed.ts`).
- Tentar inserir em `shipping_notification_logs` (`order_id, event_id`).
  Se der erro de constraint única (já existe esse `order_id`+`event_id`),
  **não mandar o e-mail** — já foi notificado antes, encerra em silêncio.
  Se o insert funcionar, segue pro envio.
- Montar o e-mail conforme `kind` (mesmo estilo visual dos outros e-mails
  do projeto — header azul `#13244f` "Desafio Diabetes", corpo, rodapé
  "não responda"; reaproveitar a função `getAppBaseUrl` já usada em
  `avulso-renewal-reminder.ts`, duplicando-a aqui):
  - `'dispatched'`: assunto "Seu pedido foi despachado!" — corpo com o
    código de rastreio (`trackingCode`) e um aviso de que o rastreio vai
    sendo atualizado no painel.
  - `'tracking'`: assunto "Atualização no rastreio do seu pedido" — corpo
    com `descricao` + `cidade`/`local` (o que estiver preenchido).
  - `'delivered'`: assunto "Seu pedido foi entregue! 🎉" — tom
    comemorativo, sem código de rastreio.
  - CTA em todos: "Ver meu pedido", linkando pra
    `${baseUrl}/dashboard/pedidos/${orderId}` (página de detalhe que já
    existe).
- Enviar via Resend, `from: 'Desafio Diabetes <noreply@desafiodiabetes.com>'`.
- Registrar em `notification_logs` (`user_id`, `type: 'tracking_update'`,
  `channel: 'email'`, `status: 'sent'`/`'failed'`) — mesmo padrão dos
  outros jobs. Erro ao enviar e-mail não deve derrubar o webhook (try/catch,
  só logar).

2.3 — Em `src/app/api/webhooks/shipping/etiqueta/route.ts`: depois do
`admin.from('orders').update(...)` que seta `tracking_code` e `status:
'dispatched'`, chamar:
```ts
await notifyShippingUpdate(admin, {
  orderId: order.id,
  eventId: 'etiqueta',
  kind: 'dispatched',
  trackingCode: payload.numero_etiqueta,
})
```

2.4 — Em `src/app/api/webhooks/shipping/rastreamento/route.ts`: antes de
chamar `mergeTrackingEvents`, calcular quais `eventos` do payload **não
existiam ainda** em `order.shipping_json` (comparar por `id` contra o
array `eventos` que já estava salvo — o mesmo dado que
`mergeTrackingEvents` já usa internamente). Depois de atualizar o pedido
no banco, para cada evento novo (em ordem cronológica por `datahora`),
chamar `notifyShippingUpdate` com:
- `kind: 'delivered'` e `eventId: 'entregue'` se `evento.finalizado === 1`;
- senão `kind: 'tracking'` e `eventId: String(evento.id)`, passando
  `descricao`, `local`, `cidade` do evento.

2.5 — Em
`src/app/api/admin/pedidos/[id]/atualizar-rastreio/route.ts`: mesma lógica
da 2.4 (calcular eventos novos antes do merge, notificar depois de
salvar) — é o mesmo tipo de atualização, só que disparada manualmente pelo
admin; o comprador deve ser avisado igual.

============================================================
NOTAS
============================================================

- Se um mesmo lote de rastreio vier com mais de um evento novo de uma vez
  (ex.: a transportadora atualiza 2 status seguidos entre uma checagem e
  outra), a pessoa recebe 1 e-mail por evento — não juntar num só, a
  constraint única já impede duplicidade, e cada status é uma informação
  diferente.
- Testar reenviando o mesmo payload de webhook duas vezes (simular retry
  da transportadora) e confirmar que só 1 e-mail sai.
- Depois de aplicado, ainda falta eu rodar as duas migrations no Supabase
  (enum + tabela nova) — não esquecer de avisar quando terminar de
  implementar.
