# Prompt para o Cursor — Pix na compra única (checkout)

Adicionar Pix como forma de pagamento no checkout, disponível **apenas para a
compra única** (plan_type '1mes'). Assinatura (assinatura_mensal/3meses/1ano)
continua só com cartão, porque cobrança recorrente automática exige cartão
salvo.

CONTEXTO IMPORTANTE:
- O webhook `/api/webhooks/pagarme/route.ts` **já trata** `charge.paid` /
  `order.paid` de forma genérica (ativa entitlement, cria protocolo, dispara
  `pagamento/confirmado`) — não precisa mexer nele, funciona igual pra Pix.
- Hoje o fluxo assume que o cartão aprova na hora, dentro da mesma request.
  Pix não aprova na hora — o cliente ainda precisa escanear o QR code e pagar,
  então o checkout precisa de uma tela de espera + confirmação assíncrona.
- Formato real da API Pagar.me v5 pra Pix (já confirmado na doc oficial):

  Request (dentro de `payments`):
  ```json
  { "payment_method": "pix", "pix": { "expires_in": 3600 } }
  ```

  Response (dentro de `charges[0]`):
  ```json
  {
    "status": "pending",
    "last_transaction": {
      "status": "waiting_payment",
      "qr_code": "00020101021226480019BR.COM.STONE...",
      "qr_code_url": "https://api.pagar.me/core/v1/transactions/.../qrcode.png",
      "expires_at": "2026-07-30T18:00:00Z"
    }
  }
  ```

============================================================
PARTE 1 — Back-end: `src/app/api/checkout/create/route.ts`
============================================================

1.1 — No `checkoutSchema` (zod):
  - adicionar `payment_method: z.enum(['credit_card', 'pix'])`
  - tornar `card` opcional (`z.object({...}).optional()`)
  - depois do `safeParse`, validar manualmente:
    - se `payment_method === 'credit_card'` e `card` ausente → erro 400
    - se `payment_method === 'pix'` e `isRecurringPlan(data.plan_type)` for
      true → erro 400 ("Pix disponível apenas para compra única")

1.2 — No bloco `if (!isRecurringPlan(data.plan_type))` (compra única), separar
  a montagem do `pagarmePayload` por método:
  - se `credit_card`: manter exatamente como está hoje (`payment_method:
    'credit_card', credit_card: { recurrence: false, installments: 1,
    statement_descriptor, card }`)
  - se `pix`: usar
    ```js
    payments: [{ payment_method: 'pix', pix: { expires_in: 3600 } }]
    ```
    (sem card, sem billing_address — pix não usa isso)

1.3 — Depois de receber `pagarmeData`, ao montar o retorno pro cliente
  (dentro do bloco `!isRecurringPlan`), se `payment_method === 'pix'`,
  incluir no JSON de resposta:
  ```js
  pix: charge?.last_transaction ? {
    qr_code: charge.last_transaction.qr_code,
    qr_code_url: charge.last_transaction.qr_code_url,
    expires_at: charge.last_transaction.expires_at,
  } : null
  ```
  O resto da lógica (insert em `payments`, `webhook_logs`, checar
  `charge?.status === 'paid'` pra finalizar inline) continua igual — pra Pix
  isso normalmente vai ficar `pending` e será finalizado depois pelo webhook,
  o que já funciona sem mudança nenhuma.

============================================================
PARTE 2 — Nova rota: `src/app/api/checkout/status/route.ts`
============================================================

GET, autenticado (usar `createClient()` normal, não admin — RLS já permite o
usuário dono ler sua própria `subscription`/`payments`, não precisa de
service role aqui).

- recebe `subscription_id` via query string
- busca em `payments` o pagamento mais recente dessa subscription
  (`subscription_id` + `order by created_at desc limit 1`)
- retorna `{ status: 'pending' | 'paid' | 'failed' }`

============================================================
PARTE 3 — Front-end: `src/app/(public)/checkout/page.tsx`
============================================================

3.1 — Adicionar estado `paymentMethod: 'credit_card' | 'pix'` (default
  'credit_card'). Mostrar o toggle "Cartão de crédito / Pix" **somente
  quando `plan === '1mes'`** — esconder completamente pra
  `assinatura_mensal`.

3.2 — Quando `paymentMethod === 'pix'`: esconder os campos de cartão
  (número, nome, validade, cvv) e não exigi-los pra habilitar o botão de
  finalizar.

3.3 — Em `handlePayment`, montar o body condicionalmente:
  - `payment_method: paymentMethod`
  - se `paymentMethod === 'credit_card'`: manter `card: {...}` como já é
  - se `paymentMethod === 'pix'`: omitir `card` do body

3.4 — Novo estado de tela após o submit quando `paymentMethod === 'pix'` (não
  redirecionar direto pro `/obrigado` como no cartão):
  - mostrar `<img src={pix.qr_code_url} />`
  - mostrar o texto copia-e-cola (`pix.qr_code`) num campo com botão "Copiar"
    (`navigator.clipboard.writeText`)
  - mostrar contagem regressiva até `pix.expires_at`
  - iniciar polling: `GET /api/checkout/status?subscription_id=...` a cada
    4 segundos
  - quando `status === 'paid'`: limpar o intervalo, limpar o mesmo
    sessionStorage que já é limpo hoje no sucesso do cartão, e redirecionar
    pra `/obrigado`
  - se a contagem regressiva zerar antes de pagar: mostrar mensagem
    "QR code expirado" com botão pra gerar um novo (chama `handlePayment` de
    novo)
  - limpar o `setInterval` no unmount do componente (`useEffect` cleanup)
