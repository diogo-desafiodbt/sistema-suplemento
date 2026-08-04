# Prompt para o Cursor — Correções da 8ª rodada de /code-review (7 achados)

============================================================
PARTE 1 — Reverter parcialmente a correção da rodada 7 (checkout não pode abortar depois de cobrar o cliente)
============================================================

Na rodada 7, pedi pra `payments.insert` lançar erro quando falhasse. Isso
foi longe demais: nesse ponto do código **o cartão já foi cobrado com
sucesso pelo Pagar.me**. Se o insert falhar por motivo transitório depois
disso, o cliente recebe erro 500 sem protocolo nem confirmação — e pode
tentar de novo, arriscando cobrança duplicada (não há chave de
idempotência reaproveitada contra o Pagar.me entre tentativas).

Em `src/app/api/checkout/create/route.ts`, nos 2 lugares (avulso ~linha
401, recorrente ~linha 480): trocar o `throw` por retry único + log
crítico, **sem abortar o fluxo** — se a cobrança foi aprovada
(`charge?.status === 'paid'` / `cycleStatus === 'paid'`), sempre chamar
`finalizePaidSubscription` mesmo que o registro de pagamento tenha
falhado (o cliente pagou, não pode ficar sem acesso por causa de um
problema interno de registro):

```ts
async function insertPaymentWithRetry(admin: AdminClient, row: Record<string, unknown>) {
  let { data, error } = await admin.from('payments').insert(row).select('id').single()
  if (error) {
    console.error('Checkout payments.insert error (tentativa 1):', error)
    ;({ data, error } = await admin.from('payments').insert(row).select('id').single())
  }
  if (error) {
    console.error(
      'CRÍTICO — payments.insert falhou 2x; cobrança aprovada sem registro interno de pagamento:',
      error,
      { row }
    )
    return null
  }
  return data
}
```
Usar essa função nos 2 lugares. `payment` pode ser `null` depois disso —
o resto do código já trata isso como opcional (`...(payment?.id ? { payment_id: payment.id } : {})`
no disparo do evento, igual já estava).

============================================================
PARTE 2 — Protocolo pode duplicar por corrida cartão + webhook
============================================================

`ensureProtocolAfterPayment` (`src/lib/protocol/create-from-checkout.ts`)
é chamada tanto pelo checkout (síncrono) quanto pelo webhook do Pagar.me
(assíncrono) pra mesma subscription. A guarda de "já tem protocol_id" é
um `SELECT` seguido de `INSERT` mais tarde, sem trava nenhuma — exatamente
o tipo de corrida que já resolvemos em `pharmacy-order.ts`/
`purchase-confirmed.ts`, só que essa função específica ficou de fora.
Se as duas chamadas caírem quase juntas, as duas criam
`quiz_responses`+`protocols`+`protocol_items` duplicados — um profissional
pode abrir e assinar o protocolo órfão sem saber que é duplicata.

2.1 — Migration nova:
```sql
CREATE TABLE public.protocol_creation_locks (
  subscription_id uuid PRIMARY KEY REFERENCES public.subscriptions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.protocol_creation_locks TO service_role;
```
(Já incluir `DELETE` desde já — ver Parte 3, não repetir o esquecimento.)

2.2 — Em `ensureProtocolAfterPayment`, logo depois de confirmar que
`subscription.protocol_id` está vazio: reivindicar a claim com
`claimOnce(admin, 'protocol_creation_locks', { subscription_id: subscriptionId })`.
- Se `won`, prossegue normalmente criando tudo (fluxo atual).
- Se **não** ganhou (outra execução está criando ou já criou), não é erro
  — espera um pouco e reconsulta `subscriptions.protocol_id` algumas
  vezes (ex.: até 5 tentativas, 500ms entre cada) até achar o valor
  preenchido pela outra execução, e retorna ele. Se esgotar as tentativas
  sem achar, loga erro e retorna `null` (mesmo comportamento de erro que
  já existe hoje pros outros casos de falha dessa função).

============================================================
PARTE 3 — shipping_notification_logs sem permissão de DELETE
============================================================

Diferente de `pharmacy_order_dispatch_logs`/`purchase_confirmation_logs`
(que ganharam `DELETE` na migration `20260804020000`), a tabela
`shipping_notification_logs` **nunca** recebeu esse grant — só tem
`SELECT, INSERT`. Isso quebra silenciosamente a auto-recuperação de claim
antiga em `claimOnce` só pra essa tabela (o `DELETE` falha, ninguém vê o
erro, a função só devolve `won: false` pra sempre).

Migration nova:
```sql
GRANT DELETE ON public.shipping_notification_logs TO service_role;
```

Também em `src/lib/idempotency.ts`: o `await deleteQuery` no reclaim de
`claimOnce` não checa erro nenhum — capturar o `error` e, se vier
preenchido, dar `console.error` (não silenciar) antes de tentar o segundo
insert.

============================================================
PARTE 4 — shipping/notify.ts: claim não é liberada se o envio falhar
============================================================

Mesmo padrão já corrigido em `pharmacy-order.ts`/`purchase-confirmed.ts`,
mas não aplicado aqui: se `resend.emails.send` falhar dentro de
`notifyShippingUpdate` (depois da claim já ter sido feita em
`shipping_notification_logs`), a claim fica presa — o evento de rastreio
já foi mesclado no `orders.shipping_json` de qualquer forma, então esse
mesmo evento nunca mais vai ser visto como "novo" numa próxima consulta,
e o cliente nunca recebe aquele e-mail. Envolver o `resend.emails.send`
em try/catch e, no catch, chamar `releaseClaim(admin, 'shipping_notification_logs', ...)`
antes de logar a falha — usando as mesmas chaves (`order_id`, `event_id`)
passadas pro `claimOnce`.

============================================================
PARTE 5 — Não mostrar "R$ 0,00" quando o valor da cobrança não foi encontrado
============================================================

Quando `extractAmountFromPayload` cai no fallback de `0` (já loga erro
desde a rodada 6), esse `0` ainda é gravado em `payments.amount` e
aparece pro cliente como "Seu pagamento de R$ 0,00 foi aprovado" no
e-mail de compra confirmada. Em `purchase-confirmed.ts`
(`formatCurrency`): se `amount` for `0` ou `null`, mostrar "valor não
disponível" em vez de "R$ 0,00" — evita mostrar um dado visivelmente
errado pro cliente.

============================================================
PARTE 6 — pharmacy-order.ts: fallback de payment deveria preferir status pago
============================================================

Quando o evento não traz `payment_id` (caso raro agora, mas ainda
possível), o fallback busca "o pagamento mais recente da subscription"
sem filtrar status — numa assinatura com histórico de pagamento
`pending`/`failed` misturado com o que acabou de ser aprovado, pode pegar
o registro errado. Adicionar `.eq('status', 'paid')` nessa query de
fallback (linha ~44), tanto em `pharmacy-order.ts` quanto em
`purchase-confirmed.ts`.

============================================================
PARTE 7 — Chave de dedupe de rastreio menos frágil quando falta id
============================================================

`trackingEventKey` cai pra `JSON.stringify(ev)` quando o evento não tem
`id` — funciona, mas qualquer variação de ordem/campo no JSON gera uma
chave diferente pro "mesmo" evento, quebrando o dedupe. Trocar esse
fallback por uma chave baseada só nos campos estáveis do evento (ex.:
`` `${ev.descricao}|${ev.datahora}|${ev.local ?? ''}` ``) em vez do JSON
inteiro — mais estável entre reconsultas da mesma API.

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final.
- Depois de aplicado, ainda faltam 2 migrations novas (Parte 2 e Parte 3)
  pra eu rodar no Supabase.
