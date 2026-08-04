# Prompt para o Cursor — Correções da 6ª rodada de /code-review (5 achados)

Nota sobre um achado que **não** entra aqui: o review apontou risco de
duplicar linha em `payments` se o mesmo webhook chegar 2x quase junto.
Conferido direto no banco: já existe `UNIQUE (pagarme_charge_id)` nessa
tabela (constraint anterior às migrations rastreadas no repo) — isso já
impede a duplicidade fisicamente. Só vale garantir que o `insert` da
Parte 1 da rodada anterior trate esse erro (23505) sem quebrar (ver Parte
2 abaixo), não precisa de mecanismo novo.

============================================================
PARTE 1 — Evento pagamento/confirmado deve carregar o payment_id certo
============================================================

Hoje `pharmacy-order.ts`/`purchase-confirmed.ts` descobrem o pagamento
buscando "o mais recente dessa subscription" — funciona quase sempre, mas
é ambíguo se um pagamento novo for inserido antes do evento anterior
terminar de processar (fila atrasada, retry, etc.), fazendo a função
pegar o pagamento errado. A causa raiz é o evento
`pagamento/confirmado` não carregar qual pagamento especificamente o
originou.

1.1 — Nos 3 lugares que disparam esse evento, adicionar `payment_id` ao
`data`:
- `src/app/api/webhooks/pagarme/route.ts` (~linha 207): capturar o `id`
  do pagamento (seja do `UPDATE...select('id')` quando encontrou, seja do
  `INSERT...select('id').single()` quando criou linha nova — ajustar os
  dois pra devolver o id) e incluir `payment_id: paymentId` no evento.
- `src/app/api/checkout/create/route.ts` (~linha 401 e ~linha 465):
  encadear `.select('id').single()` nos dois `insert` em `payments` que
  já existem, e incluir `payment_id: payment.id` nos dois disparos do
  evento (~linha 418 e ~linha 482).

1.2 — Em `pharmacy-order.ts` e `purchase-confirmed.ts`: ler
`payment_id` direto de `event.data` em vez de buscar "o mais recente".
Manter a busca por "mais recente" só como fallback, caso `payment_id`
não venha no evento (não deveria acontecer depois da Parte 1.1, mas
evita quebrar se algum evento antigo ainda estiver na fila do Inngest no
momento do deploy).

============================================================
PARTE 2 — Erros engolidos no update/insert de payments
============================================================

Em `src/app/api/webhooks/pagarme/route.ts`:
- Se o `UPDATE` em `payments` (linha ~137) retornar `updateError`
  verdadeiro, hoje nada acontece — nem loga, nem tenta o insert de
  fallback. Adicionar `console.error` nesse caso, pra pelo menos ficar
  visível em log.
- O `INSERT` de linha nova (fallback de renovação, linha ~146) não trata
  erro nenhum. Capturar o `error` e, se for `23505` (colisão com a
  `UNIQUE (pagarme_charge_id)` — outra entrega concorrente do mesmo
  webhook já inseriu), ignorar em silêncio (idempotente, correto). Pra
  qualquer outro erro, `console.error`.

============================================================
PARTE 3 — Logar quando o valor da cobrança não é encontrado
============================================================

`extractAmountFromPayload` (mesmo arquivo) retorna `0` sem avisar quando
nenhum formato conhecido do payload tem o valor. Adicionar
`console.error('extractAmountFromPayload: nenhum valor encontrado no payload', payload)`
antes do `return 0` — isso hoje contamina silenciosamente o dashboard de
receita do admin e manda "Seu pagamento de R$ 0,00" pro cliente sem
ninguém saber.

============================================================
PARTE 4 — PDF da prescrição precisa do mesmo fallback legado que a tela do profissional já tem
============================================================

Na rodada anterior, a tela `/profissional/protocolo/[id]/page.tsx` ganhou
fallback pros 3 pacientes pré-migração (sem `birth_date`, mostra
`years_diagnosed`/`allergies`/`conditions_serious` em vez de campo em
branco) — mas o **PDF da prescrição** (`src/lib/pdf/prescription-template.tsx`,
gerado em `src/app/api/prescricao/assinar/route.ts`) não recebeu a mesma
correção. Se um desses protocolos antigos (ainda `pending_signature`)
for assinado agora, o PDF oficial mostra "Idade: —" e perde toda a
informação que a própria tela de revisão já mostra antes de assinar.

4.1 — Em `src/app/api/prescricao/assinar/route.ts` (~linha 39): trazer de
volta `years_diagnosed`, `hba1c_range`, `allergies` no select de
`quiz_responses`, e repassar pro `PrescriptionDocument`.

4.2 — Em `src/lib/pdf/prescription-template.tsx`: mesmo padrão da tela do
profissional — se `data.quiz.birth_date` existir, mostra o painel novo
(idade/sexo/gravidez/renal/hepática); se não existir, mostra o bloco
antigo (tempo de diagnóstico, HbA1c, alergia — incluindo o mesmo
tratamento especial pro caso antigo de `allergies` começando com
`'idade:'`, que a tela do profissional já trata).

============================================================
PARTE 5 — Migrar os 2 lugares que ainda reimplementam claim manual
============================================================

`src/lib/shipping/notify.ts` (linha ~213-224, insert em
`shipping_notification_logs` checando `23505` manualmente) e
`src/lib/inngest/functions/support-inbox-poll.ts` (linha ~173, insert em
`support_messages` checando `23505` manualmente) reimplementam o mesmo
padrão que `claimOnce` já resolve. Trocar os dois por
`claimOnce(admin, 'shipping_notification_logs', { order_id, event_id })`
e `claimOnce(admin, 'support_messages', { ...linha completa da mensagem })`
respectivamente — usar o retorno booleano no lugar do `if (insertError?.code === '23505')`
atual. **Não mexer** no outro trecho de `support-inbox-poll.ts` (linha
~53, resolução de qual thread usar quando duas execuções competem pra
criar a mesma thread nova) — esse caso precisa devolver o `id` da thread
existente, não só um booleano, tem formato diferente do `claimOnce`.

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final.
- Nenhuma migration nova nesta rodada.
- A Parte 1 é a mais importante — remove a ambiguidade que motivou boa
  parte dos achados das últimas rodadas (a idempotência agora aponta pro
  pagamento exato, não mais "o mais recente").
