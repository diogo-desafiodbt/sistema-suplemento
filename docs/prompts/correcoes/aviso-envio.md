# Mover o aviso de envio ao cliente para o Inngest

## O que está quebrado

Os dois webhooks da Envie Agora avisam o cliente na própria rota:

- `src/app/api/webhooks/shipping/rastreamento/route.ts:120` → `notifyNewTrackingEvents`
- `src/app/api/webhooks/shipping/etiqueta/route.ts:78` → `notifyShippingUpdate`

Essas rotas não rodam no serviço do núcleo. A regra do ALB manda `/api/webhooks*`
para o target group `tg-sistema-entrada`, que usa o segredo
`sistema/DATABASE_URL_ENTRADA` e conecta como **`app_entrada`**, não `app_web`.

E `app_entrada` não tem privilégio nenhum em `shipping_notification_logs` nem em
`notification_logs`. Por isso o aviso quebra com `permission denied for table
shipping_notification_logs` e o cliente nunca recebe e-mail de despacho, de
rastreio nem de entrega.

O mesmo código funciona quando chamado por
`src/app/api/admin/pedidos/[id]/atualizar-rastreio/route.ts:78`, porque essa rota
não tem regra no ALB e cai no serviço padrão, que é `app_web`.

## O que fazer

Tirar o envio de e-mail de dentro das rotas de webhook. A rota passa a só emitir
um evento Inngest e responder 200. Uma função Inngest nova faz o trabalho — e
funções Inngest rodam sob `/api/inngest*`, que o ALB manda para o núcleo, como
`app_web`, que já tem todos os grants.

Não conceder os grants a `app_entrada`. Esse papel atende webhook público
autenticado só por token de parceiro, e é o papel que deve continuar mínimo.

Mover também resolve um segundo defeito: hoje a falha do aviso é engolida num
`try/catch` que só grava em `webhook_logs.error_message`, sem retry. O aviso se
perde para sempre. No Inngest ele reexecuta sozinho.

## Passo a passo

### 1. Nova função `src/lib/inngest/functions/shipping-notify.ts`

Duas funções, ou uma com dois eventos — escolha o que ficar mais limpo:

- evento `envio/etiqueta-gerada`, com `{ order_id, tracking_code }`, chama
  `notifyShippingUpdate({ orderId, eventId: <o mesmo eventId usado hoje na rota
  de etiqueta>, kind: 'dispatched', trackingCode })`
- evento `envio/rastreio-atualizado`, com `{ order_id, eventos }` (a lista de
  eventos de rastreio, serializada), chama `notifyNewTrackingEvents(order_id,
  eventos)`

Siga o padrão de `src/lib/inngest/functions/purchase-confirmed.ts`: mesmo uso de
`registrarFim`/registro de job, mesmo tratamento de erro, mesma forma de deixar o
erro subir para o Inngest reexecutar.

Não mexa em `src/lib/shipping/notify.ts`. A lógica de claim, heal e envio já está
correta — o problema era só o papel do banco que a executava.

### 2. Registrar em `src/app/api/inngest/route.ts`

Ao lado de `purchaseConfirmed`.

### 3. Rota de rastreamento

Em `src/app/api/webhooks/shipping/rastreamento/route.ts`, trocar o bloco
`try { ... notifyNewTrackingEvents ... } catch` (linhas ~118-131) por um
`inngest.send` com `envio/rastreio-atualizado`, mandando `order.id` e os eventos.

Mantenha o cálculo de `getNewTrackingEvents` **fora** do send se ele depender de
`order.shipping_json` lido antes do UPDATE — hoje ele depende. Ou mande o payload
inteiro e deixe a função Inngest recalcular contra o `shipping_json` já salvo. A
segunda opção é mais simples e é idempotente do mesmo jeito, porque o claim é por
`(order_id, event_id)`.

Manter o `catch` só ao redor do `inngest.send`, gravando em
`webhook_logs.error_message` como hoje: falhar em enfileirar não pode virar 500,
pela mesma razão de sempre — a transportadora reenviaria o evento para sempre.

### 4. Rota de etiqueta

Mesmo tratamento em `src/app/api/webhooks/shipping/etiqueta/route.ts:78`.

### 5. Conferir os grants de `app_web`

Já verificados em produção em 26/08 e todos presentes: `shipping_notification_logs`
com SELECT/INSERT/UPDATE/DELETE e `notification_logs` com INSERT. Nada a fazer no
banco. Não escreva SQL novo.

## Como saber que funcionou

Depois do deploy dos dois serviços, um POST no webhook de rastreio com o payload
real da Envie Agora tem que produzir: linha em `shipping_notification_logs` com
`email_sent_at` e `completed_at` preenchidos, linha em `notification_logs` com
`status='sent'`, e `webhook_logs.error_message` nulo.

Hoje `shipping_notification_logs` tem zero linhas — nenhum aviso jamais saiu por
esse caminho.
