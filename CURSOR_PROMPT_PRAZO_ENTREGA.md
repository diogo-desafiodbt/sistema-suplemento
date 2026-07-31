# Prompt para o Cursor — Ajuste de prazo de entrega e data de retirada

Dois ajustes relacionados a prazo, definidos com o Diogo:

1. O prazo mostrado pro CLIENTE deve ter margem (prazo real da Envie Agora +
   2 dias de manipulação + 3 dias de margem de erro). O que vai pro JSON da
   farmácia continua sendo o prazo puro da Envie Agora, sem margem.
2. A criação da etiqueta não deve mais depender de quando o médico assina a
   prescrição — deve ser sempre D+2 a partir do dia da COMPRA do cliente,
   independente de quando a prescrição é assinada.

============================================================
PARTE 1 — Margem de prazo só na exibição pro cliente
============================================================

1.1 — Criar `src/lib/shipping/estimate.ts`:
```ts
export const PHARMACY_HANDLING_DAYS = 2
export const SAFETY_MARGIN_DAYS = 3

export function estimateCustomerDeliveryDays(prazoTransporteDias: number): number {
  return prazoTransporteDias + PHARMACY_HANDLING_DAYS + SAFETY_MARGIN_DAYS
}
```

1.2 — Em `src/app/(public)/checkout/page.tsx`, no ponto onde hoje mostra
  `chega em até {opt.prazoDias} dia(s) útil(eis)` (por volta da linha 643),
  trocar pra usar `estimateCustomerDeliveryDays(opt.prazoDias)` no texto
  exibido. **Importante**: isso é só de exibição — continuar guardando e
  enviando o `opt.prazoDias` puro (sem margem) em tudo que for pro back-end
  (`shipping.prazoDias` no body de `/api/checkout/create`, `pending_checkout`,
  `orders.shipping_quote_json`, `PrevisaoEntregaEmDias` no JSON da farmácia).
  Só o texto que o cliente lê na tela usa a versão com margem.

1.3 — Se houver outro lugar no site que mostre prazo de entrega pro cliente
  (ex: página de "obrigado", dashboard do paciente com status do pedido),
  usar a mesma função `estimateCustomerDeliveryDays` ali também — não
  duplicar a fórmula em texto solto.

============================================================
PARTE 2 — Data de retirada D+2 a partir da compra (não da assinatura)
============================================================

CONTEXTO: hoje `create-shipping-label.ts` é disparado pelo evento
`farmacia/pedido-enviado`, que só é emitido quando o médico assina a
prescrição (em `src/app/api/prescricao/assinar/route.ts`) — e isso pode
acontecer horas ou dias depois da compra. Precisamos desacoplar isso: a
criação da etiqueta deve mirar sempre "dia da compra + 2 dias corridos",
não importa quando a prescrição foi assinada.

2.1 — Em `src/app/api/prescricao/assinar/route.ts`: REMOVER o
  `await inngest.send({ name: 'farmacia/pedido-enviado', ... })` (e o código
  ao redor que só existia pra isso) — não é mais necessário disparar esse
  evento aqui.

2.2 — Em `src/lib/inngest/functions/create-shipping-label.ts`:
  - trocar o trigger de `farmacia/pedido-enviado` pra `pagamento/confirmado`
    (o MESMO evento que `pharmacy-order.ts` já escuta pra criar o pedido)
  - a function recebe `subscription_id` e `user_id` do evento, igual
    `pharmacy-order.ts` já faz
  - buscar `subscriptions.created_at` pra esse `subscription_id`
  - calcular `pickupDate = created_at + 2 dias ÚTEIS` (pula sábado e
    domingo — NÃO considera feriados nacionais, só fim de semana; criar uma
    função utilitária `addBusinessDays(date, days)` em
    `src/lib/shipping/estimate.ts` pra isso, não inline)
  - usar `step.sleepUntil('aguardar-data-retirada', pickupDate)` (data
    absoluta, não um intervalo relativo — se `pickupDate` já tiver passado
    no momento em que a function rodar, o Inngest resolve isso
    imediatamente, sem esperar)
  - SÓ DEPOIS do sleepUntil, buscar o pedido em `orders` por
    `subscription_id` (a essa altura o pedido já existe com certeza, porque
    `pharmacy-order.ts` roda em segundos a partir do mesmo evento — não tem
    condição de corrida real aqui, mesmo rodando em paralelo, porque a
    espera de 2 dias garante que o outro já terminou)
  - o resto da lógica (calcular dimensions, usar shipping_service_code com
    fallback de cotação, chamar criarEtiqueta, salvar shipping_request_id/
    shipping_json) continua igual

2.3 — Registrar a function com o novo trigger no client do Inngest (só
  confirmar que o registro em `src/app/api/inngest/route.ts` continua
  correto depois da troca de evento).

2.4 — O botão manual "Gerar etiqueta agora" no admin não muda — continua
  disponível como está, pra disparar antes do D+2 se precisar.

NOTA: "D+2" aqui é 2 dias ÚTEIS (pula sábado/domingo, não considera feriado)
a partir de `subscriptions.created_at`.
