# Prompt para o Cursor — Remover disparo de domingo, corrigir gap de cartão, trocar e-mail por confirmação de compra

Três mudanças independentes na comunicação transacional com o comprador.
Nenhuma delas mexe no cálculo de RFM em si (`rfm-recalc.ts` continua rodando
normalmente, o tier continua aparecendo no Admin Cliente 360 — só o e-mail
automático de domingo sai).

============================================================
PARTE 1 — Remover o disparo de domingo por RFM
============================================================

1.1 — Apagar `src/lib/inngest/functions/sunday-dispatch.ts`.

1.2 — Em `src/app/api/inngest/route.ts`: remover o import de
`sundayDispatch` e a entrada correspondente no array `functions`. O array
passa a ter: `rfmRecalc, pharmacyOrder, paymentRetry, avulsoRenewalReminder,
createShippingLabel, pharmacyReconciliation`.

1.3 — A tabela `sunday_dispatch_logs` pode continuar existindo no banco
(histórico do que já foi enviado) — não precisa de migration pra isso, só
ninguém mais escreve nela.

============================================================
PARTE 2 — Corrigir gap: pagamento por cartão não disparava `pagamento/confirmado`
============================================================

Hoje o evento `pagamento/confirmado` só é emitido em
`src/app/api/webhooks/pagarme/route.ts` (fluxo Pix, confirmado depois via
webhook). Pagamento por **cartão**, confirmado na hora dentro de
`src/app/api/checkout/create/route.ts`, nunca dispara esse evento — então
`avulso-renewal-reminder` (e agora a Parte 3) nunca rodam pra quem paga no
cartão.

2.1 — Em `src/app/api/checkout/create/route.ts`, adicionar
`import { inngest } from '@/lib/inngest/client'` no topo.

2.2 — Logo após cada uma das duas chamadas a `finalizePaidSubscription(...)`
nesse arquivo (uma no branch `!isRecurringPlan` quando `charge?.status ===
'paid'`, por volta da linha 408-413; outra no branch de assinatura quando
`cycleStatus === 'paid'`, por volta da linha 466-471), emitir o mesmo
evento que o webhook já emite:
```ts
await inngest.send({
  name: 'pagamento/confirmado',
  data: { subscription_id: subscription.id, user_id: user.id },
})
```
Só disparar quando o pagamento já veio `paid` de fato (ou seja, dentro do
`if (charge?.status === 'paid')` / `if (cycleStatus === 'paid')` — não
antes). Pagamento por Pix continua não disparando aqui (fica `pending`
nesse ponto), o que está correto — ele só dispara depois, no webhook,
quando o Pix é efetivamente pago.

============================================================
PARTE 3 — Trocar "prescrição assinada" por "compra confirmada"
============================================================

3.1 — Em `src/app/api/prescricao/assinar/route.ts`, remover o bloco do
e-mail ao paciente ("Seu pedido está em preparação") — é o `if
(resendApiKey && patient.email) { ... }` que vai da declaração de
`resendApiKey` até o fechamento desse `if`, aproximadamente linhas 199-263.
**Não mexer** em nada antes desse bloco (o envio da prescrição em PDF pra
farmácia, `sendToPharmacyWithPdf`, continua exatamente como está — só o
e-mail ao paciente sai).

3.2 — Criar `src/lib/inngest/functions/purchase-confirmed.ts`, nova função
Inngest disparada pelo mesmo evento `pagamento/confirmado` (roda em
paralelo com `pharmacy-order` e `avulso-renewal-reminder`, sem depender do
resultado de nenhuma delas):

```ts
export const purchaseConfirmed = inngest.createFunction(
  { id: 'purchase-confirmed', name: 'E-mail de compra confirmada', triggers: [{ event: 'pagamento/confirmado' }] },
  async ({ event }) => {
    const { subscription_id, user_id } = event.data as { subscription_id: string; user_id: string }
    // ...
  }
)
```

Dentro da função:
- Buscar `subscriptions` (`plan_type, expires_at`) pelo `subscription_id`,
  e `users` (`full_name, email`) pelo `user_id`.
- Buscar o valor pago mais recente em `payments` (`amount`) pra essa
  `subscription_id` (`order by created_at desc limit 1`), pra mostrar o
  valor no e-mail.
- IMPORTANTE: **não depender da tabela `orders`** pra montar esse e-mail —
  como `pharmacy-order` roda em paralelo escutando o mesmo evento, o pedido
  pode ainda não existir no banco no momento em que este e-mail dispara.
  Manter o e-mail genérico (sem lista de produtos), só confirmando a
  compra e o valor.
- Enviar via Resend (mesmo padrão visual dos outros e-mails: header azul
  `#13244f` "Desafio Diabetes", corpo, rodapé "não responda"), assunto algo
  como "Compra confirmada! 🎉" — sem emoji se preferir manter o padrão
  sóbrio dos outros e-mails (ver os demais arquivos de
  `src/lib/inngest/functions/*.ts` pro tom usado). Conteúdo: confirma que o
  pagamento foi aprovado, mostra o valor pago, e avisa que a farmácia já
  está preparando o pedido pra envio (mesma mensagem que existia no e-mail
  antigo de prescrição, só que disparada mais cedo — logo após o
  pagamento, não só quando o médico assina).
- Registrar em `notification_logs` (`user_id`, `type: 'purchase_confirmed'`,
  `channel: 'email'`, `status: 'sent'`/`'failed'`), mesmo padrão já usado em
  `sunday-dispatch.ts`/`payment-retry.ts`.

3.3 — Registrar `purchaseConfirmed` em `src/app/api/inngest/route.ts`
(import + adicionar ao array `functions`).

============================================================
NOTAS
============================================================

- Depois de aplicado, testar uma compra completa em cartão (avulso e
  assinatura) e confirmar que chega exatamente 1 e-mail de "compra
  confirmada" (não 2), e que o pharmacy-order/avulso-renewal-reminder
  continuam dececionando igual.
- Assinatura recorrente: como `pagamento/confirmado` também dispara em
  cada cobrança mensal bem-sucedida (não só na primeira), o assinante vai
  receber esse e-mail de "compra confirmada" todo mês, no ciclo de
  cobrança — isso é esperado (funciona como recibo mensal). Se não for o
  que o Diogo quer, avisar antes de finalizar.
