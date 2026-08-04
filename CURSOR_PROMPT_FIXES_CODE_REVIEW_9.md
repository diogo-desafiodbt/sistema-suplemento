# Prompt para o Cursor — Correções da 9ª rodada de /code-review (5 achados; 1 aceito como esperado)

Nota sobre um achado que **não** entra aqui: o review apontou que
`pharmacy-order.ts` lança erro permanente se não achar nenhum `payments`
pra subscription (cenário possível se o `insertPaymentWithRetry` do
checkout falhar 2x). Isso é esperado, não é bug novo: esse caso já é
logado como `CRÍTICO` no checkout (rodada 8) exatamente pra alguém
investigar na mão — se não existe pagamento nenhum registrado, não tem
como criar pedido corretamente mesmo, e falhar alto/visível (pro Inngest
alertar) é o comportamento certo aqui, não silenciar.

============================================================
PARTE 1 — insertPaymentWithRetry pode confundir "já salvou" com "falhou"
============================================================

Em `src/app/api/checkout/create/route.ts`, `insertPaymentWithRetry` tenta
de novo sem checar se a 1ª tentativa na verdade já tinha sucedido (resposta
perdida por timeout de rede, por exemplo). Como `payments.pagarme_charge_id`
tem `UNIQUE`, a 2ª tentativa nesse cenário bate em erro `23505` — e hoje
isso é tratado como falha genérica, logando "CRÍTICO" indevidamente
quando o pagamento **já estava** registrado.

Corrigir: se a 2ª tentativa falhar com `error.code === '23505'`, buscar a
linha existente por `pagarme_charge_id` e tratar como sucesso (retornar
ela) em vez de log crítico:
```ts
if (error?.code === '23505') {
  const { data: existing } = await admin
    .from('payments')
    .select('id')
    .eq('pagarme_charge_id', row.pagarme_charge_id)
    .maybeSingle()
  if (existing) return existing
}
```

============================================================
PARTE 2 — pharmacy-order.ts: update do order_id na claim sem checar erro
============================================================

O `update({ order_id: order.id }).eq('payment_id', payment.id)` (logo
após criar o pedido) não verifica erro. Se falhar silenciosamente, a
claim fica sem `order_id`, e se um dia essa claim for reivindicada por
estar antiga, a limpeza de pedido órfão (`reclaimedStale?.order_id`) não
encontra nada pra apagar — o pedido incompleto vaza. Capturar o `error`
desse update e dar `console.error` se vier preenchido (visibilidade, pelo
menos).

============================================================
PARTE 3 — create-from-checkout.ts: janela de espera menor que o limite de claim abandonada
============================================================

`waitForProtocolId` desiste depois de só 2,5s (5×500ms), mas `claimOnce`
só considera uma claim abandonada depois de 10 minutos. Se quem ganhou a
corrida (checkout ou webhook) estiver só um pouco mais lento que 2,5s —
não travado, só lento — quem perdeu desiste cedo demais e retorna `null`,
fazendo o webhook pular o despacho pra farmácia permanentemente pra
aquele evento.

Aumentar a janela de espera pra algo bem mais generoso que o tempo normal
de criação de protocolo, mas ainda bem menor que os 10 min de claim
abandonada — por exemplo, 20 tentativas de 500ms (10s no total) em vez de
5.

============================================================
PARTE 4 — quiz/page.tsx: produto pode sumir do catálogo em silêncio
============================================================

Desde a correção da rodada 4 (`productKeyFromName` retorna `null` em
match ambíguo em vez de adivinhar), se dois produtos ativos no banco
baterem no mesmo critério de substring, o produto correspondente
simplesmente **desaparece** do catálogo do quiz — sem erro, sem log,
paciente nunca vê aquele produto como opção. Isso já era arriscado por
segurança (não adivinhar é certo), mas ficar completamente silencioso
esconde um problema de catálogo que devia ser corrigido no cadastro do
produto.

Em `productKeyFromName` (`src/lib/protocol/triage.ts`): quando o
resultado for `null` por ambiguidade (mais de 1 produto batendo o
critério) ou por não achar nenhum, dar `console.error` com o nome do
produto que não foi resolvido — não muda o comportamento (continua
`null`, continua seguro), só passa a ficar visível em log que algum
produto do catálogo precisa de nome mais específico no banco.

============================================================
PARTE 5 — pharmacy-order.ts: ordem de checagem de erro mascara a causa real
============================================================

Hoje a checagem de "não achei payment" roda antes da checagem de erro na
busca da subscription — se as duas falharem juntas (ex.: `subscription_id`
inválido no evento), o erro logado é "nenhum payment para subscription X"
em vez do problema real, "assinatura não encontrada". Inverter a ordem:
checar `subError`/`!subscription` primeiro, só depois checar `!payment?.id`.

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final.
- Nenhuma migration nova nesta rodada.
