# Prompt para o Cursor — Correções da 2ª rodada de /code-review (4 achados)

Segunda rodada de review, agora em cima das próprias correções da leva
anterior (`CURSOR_PROMPT_FIXES_CODE_REVIEW.md`). Achou 2 bugs sérios que
a própria correção de idempotência introduziu, e 2 riscos menores.

============================================================
PARTE 1 — Claim de idempotência "engole" falha real (pharmacy-order.ts)
============================================================

Hoje o `insert` em `pharmacy_order_dispatch_logs` acontece logo depois de
buscar o `payment`, **antes** de qualquer busca de assinatura/endereço/
config e antes de criar o pedido. Problema: se qualquer coisa depois
disso falhar (busca de endereço, `system_config`, o próprio `insert` em
`orders`), a função lança erro, o Inngest tenta de novo automaticamente
— e a claim já feita bate na constraint única, faz a função retornar
`{ ok: true, skipped: 'already_dispatched' }`, e o Inngest entende que
deu certo. **O pedido nunca é criado, silenciosamente, pra sempre.**

Corrigir assim:
1.1 — Mover o `insert` em `pharmacy_order_dispatch_logs` (hoje logo após
buscar `payment`) pra **imediatamente antes** do `admin.from('orders').insert(...)`
— depois de todas as buscas somente-leitura (subscription, endereço,
config, `packageItems`, `pharmacyItems`, `priorOrder`) já terem sido
feitas com sucesso.

1.2 — Se o `insert` em `orders` falhar (`orderError`) **depois** da claim
já ter sido feita, apagar a claim antes de lançar o erro:
```ts
if (orderError || !order) {
  await admin
    .from('pharmacy_order_dispatch_logs')
    .delete()
    .eq('payment_id', payment.id)
  throw new Error(`Erro ao criar pedido: ${orderError?.message ?? 'unknown'}`)
}
```
Isso garante que uma tentativa seguinte (retry do Inngest) consiga
reivindicar a claim de novo e tentar criar o pedido, em vez de ficar pra
sempre marcado como "já disparado" sem nunca ter disparado de verdade.

============================================================
PARTE 2 — Mesmo problema em purchase-confirmed.ts
============================================================

Mesmo padrão: o `insert` em `purchase_confirmation_logs` acontece antes
do `resend.emails.send(...)`. Se o envio falhar (erro transitório de
rede/API), a função relança o erro pra o Inngest tentar de novo — e o
retry esbarra na claim já feita, retorna `skipped: 'duplicate_payment'`,
e o cliente **nunca recebe o e-mail de compra confirmada**, sem nenhum
alerta.

2.1 — Mover a claim (`insert` em `purchase_confirmation_logs`) pra depois
da checagem de `RESEND_API_KEY` e da montagem do `subject`/`html` (essas
partes são só leitura/montagem, sem efeito colateral), ficando bem colada
ao `resend.emails.send(...)`.

2.2 — No `catch` do envio (hoje só loga e relança o erro), apagar a claim
antes de relançar:
```ts
catch (error) {
  console.error('Erro ao enviar e-mail de compra confirmada:', error)
  await admin
    .from('purchase_confirmation_logs')
    .delete()
    .eq('payment_id', payment.id)
  await logNotification(user_id, 'failed')
  throw error
}
```

============================================================
PARTE 3 — Risco de colisão "Berberina" x "Berberina Homeopata"
============================================================

Em `src/lib/protocol/triage.ts`, `productKeyFromName` (usado agora em
`quiz/page.tsx` e `create-from-checkout.ts`) tem um fallback de
substring que pode casar tanto "Berberina" quanto "Berberina Homeopata"
com a mesma `ProductKey`. Hoje "Berberina Homeopata" está `is_active =
false`, então não aparece em `/api/products` — mas se um dia for
reativada (ou outro produto futuro compartilhar prefixo de nome), a
função pode silenciosamente vincular o produto errado, sem ninguém
perceber.

Corrigir o fallback: se **mais de um** produto bater no critério de
substring, é ambíguo — retornar `null` em vez de escolher um
arbitrariamente (mesmo princípio já usado noutros lugares desse fluxo:
na dúvida, não adivinha).

============================================================
PARTE 4 — `.eq()` no e-mail do suporte depende de um pressuposto não garantido
============================================================

Em `src/lib/support/identify.ts`, a troca de `.ilike('email', email)` por
`.eq('email', email.toLowerCase())` resolve o risco de coringa, mas
assume que `public.users.email` está sempre gravado em minúsculo — isso
hoje só é garantido pelo GoTrue (Auth) normalizar `auth.users.email`, não
por nada no schema deste projeto. Se existir (ou vier a existir) alguma
linha com e-mail em caixa mista, o `.eq()` deixa de achar o usuário onde
o `ilike` antigo acharia.

Corrigir voltando a usar `ilike` (preserva case-insensitive
independente de como está gravado), mas **escapando** os caracteres
curinga do padrão LIKE (`%`, `_`, `\`) antes de montar a busca:
```ts
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
```
E usar `.ilike('email', escapeLikePattern(email))` no lugar do `.eq()`
atual — resolve os dois problemas ao mesmo tempo (sem risco de coringa, e
sem depender de tudo estar em minúsculo no banco).

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final.
- Nenhuma migration nova nesta rodada.
- Depois disso, acho razoável considerar o `/code-review` fechado pra
  essas 4 tarefas — próxima rodada seria só o `/security-review`.
