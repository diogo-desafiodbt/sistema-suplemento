# Prompt para o Cursor — Correções da 5ª rodada de /code-review (achado raiz + 2 regressões)

O achado principal desta rodada é um bug **pré-existente** (não introduzido
pelas correções anteriores) que as correções de idempotência acabaram
expondo: renovação de assinatura mensal nunca gera pedido nem e-mail de
confirmação a partir do 2º ciclo. Corrigindo na raiz.

============================================================
PARTE 1 — Webhook não cria linha de payments em renovação (causa raiz)
============================================================

Em `src/app/api/webhooks/pagarme/route.ts`, `handlePaymentSucceeded`
(linha ~96) só faz:
```ts
if (chargeId) {
  await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('pagarme_charge_id', chargeId)
}
```
Isso funciona na primeira cobrança (já inserida no checkout), mas numa
renovação de `assinatura_mensal` o Pagar.me cobra com um `charge_id`
novo que nunca existiu — o `UPDATE` não acha linha nenhuma e não faz
nada. A tabela `payments` nunca ganha registro de renovação, e a
idempotência de `pharmacy-order.ts`/`purchase-confirmed.ts` (que busca
"o payment mais recente dessa subscription") acaba sempre achando o
mesmo pagamento antigo do 1º ciclo — bloqueando pedido e e-mail de
confirmação em toda renovação seguinte.

Corrigir pra inserir uma linha nova quando o `UPDATE` não encontrar
nenhuma:
```ts
if (chargeId) {
  const { data: updated, error: updateError } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('pagarme_charge_id', chargeId)
    .select('id')

  if (!updateError && (!updated || updated.length === 0)) {
    // Cobrança nova (renovação) — não existia linha ainda, cria uma.
    await admin.from('payments').insert({
      subscription_id: subscriptionId,
      pagarme_charge_id: chargeId,
      amount: extractAmountFromPayload(payload), // ver 1.1
      status: 'paid',
      paid_at: new Date().toISOString(),
    })
  }
}
```

1.1 — Extrair o valor cobrado do payload do webhook (Pagar.me manda o
valor em centavos, geralmente em `data.amount` pra
`charge.paid`/`order.paid`, ou dentro de `data.current_cycle`/
`data.last_transaction` pra `subscription.payment_succeeded` — **conferir
contra o payload real recebido em produção**, o formato exato pode variar
por tipo de evento). Adicionar esse campo ao tipo `PagarmePayload` e
escrever `extractAmountFromPayload(payload): number` que tenta os
caminhos prováveis e cai pra `0` se não achar nada (melhor que quebrar o
webhook). Se o valor vier em centavos, dividir por 100 antes de gravar
(mesma unidade que os outros `payments.amount` já gravados no checkout).

Isso corrige sozinho o sintoma em `pharmacy-order.ts` e
`purchase-confirmed.ts` — nenhuma mudança necessária nesses dois
arquivos, já que a query "payment mais recente" passa a achar a linha
certa assim que ela existir.

============================================================
PARTE 2 — Profissional perde dado clínico de paciente pré-migração
============================================================

A tela `/profissional/protocolo/[id]/page.tsx` trocou os campos antigos
do quiz (`years_diagnosed`, `allergies`, `conditions_serious`) pelos
novos (`birth_date`, `sex`, etc.) sem fallback. Os pacientes que fizeram
a triagem **antes** da migração de 02/08 têm os campos novos vazios — a
tela mostra "Idade: —", "Sexo: —" e nenhum banner, quando antes mostrava
tempo de diagnóstico/alergia normalmente. A fila do profissional
(`/profissional/fila/page.tsx`) ainda mostra esses campos antigos —
ficou inconsistente entre as duas telas do mesmo fluxo.

2.1 — Adicionar de volta `years_diagnosed`, `allergies`,
`conditions_serious` ao `select` de `quiz_responses` e ao tipo
`QuizResponse` na página de detalhe.

2.2 — Na renderização: se `quiz.birth_date` existir, mostrar o painel
novo (idade calculada, sexo, gravidez, banner renal/hepática) como já
está. Se `quiz.birth_date` for `null` (registro pré-migração), mostrar em
vez disso o bloco antigo (tempo de diagnóstico, alergias, condições
sérias) — não deixar a tela em branco pro profissional nesse caso.

============================================================
PARTE 3 — Claim travada pra sempre se o processo morrer no meio
============================================================

`claimOnce`/`claimByFlag` não têm reconciliação: se a execução for
interrompida (timeout de plataforma, por exemplo) entre reivindicar a
claim e completar a ação, a claim fica travada pra sempre — nenhum retry
futuro consegue reivindicar de novo, e a ação nunca acontece.

Adicionar uma checagem de "claim antiga = abandonada" em `claimOnce`: se
o `insert` falhar por unicidade (23505), buscar a linha existente e
comparar `created_at` com agora; se tiver mais de 10 minutos (parâmetro
configurável, default 10 min), tratar como abandonada — apagar e tentar
reivindicar de novo uma única vez. Se a segunda tentativa também colidir
(outra execução legitimamente em andamento), aí sim retorna `false`.
Mesma lógica em `claimByFlag`, usando o timestamp já gravado no próprio
flag.

============================================================
NOTAS
============================================================

- **Não seguir** a sugestão de trocar os 3 mecanismos de claim por
  `step.run` do Inngest: `step.run` só torna seguro o retry *dentro* da
  mesma execução — não resolve o motivo original da claim existir (duas
  fontes diferentes, cartão e webhook, disparando o mesmo evento
  `pagamento/confirmado` pro mesmo pagamento). Trocaria a proteção atual
  por uma que não cobre o caso que motivou tudo isso.
- Rodar `npm run build`/typecheck no final.
- Nenhuma migration nova nesta rodada (a Parte 1 só muda lógica de
  aplicação, não schema).
- Depois de aplicado, seria bom simular uma renovação (2ª cobrança) num
  ambiente de teste do Pagar.me pra confirmar que `payments` ganha linha
  nova e o pedido/e-mail saem certos.
