# Prompt para o Cursor — Correções da 10ª rodada de /code-review (achado raiz + 2 pontuais)

O achado principal exige mudar o `claimOnce` de verdade — os outros 6
achados dessa rodada são, no fundo, o mesmo problema raiz aparecendo em
lugares diferentes (`pharmacy-order`, `support-inbox-poll`,
`shipping/notify`, `create-from-checkout`), então uma correção só resolve
a maioria. Os 2 que sobram (payload sem `chargeId`, e o resto) entram nas
Partes 2 e 3.

============================================================
PARTE 1 — claimOnce precisa distinguir "travou" de "terminou com sucesso"
============================================================

Hoje `claimOnce` trata **qualquer** claim com mais de 10 minutos como
abandonada — certo pra quando o processo morreu no meio, errado quando o
trabalho **terminou com sucesso** e a claim só continua existindo como
registro permanente (ex.: pedido criado, aguardando o profissional
assinar a prescrição — isso leva horas, não minutos). Se o mesmo evento
chegar de novo depois de 10 min (reenvio de webhook, comum no Pagar.me),
o sistema hoje apaga o pedido válido em revisão e recria um duplicado.

1.1 — Migration nova: adicionar `completed_at timestamptz` (nullable) em
4 tabelas:
```sql
ALTER TABLE public.pharmacy_order_dispatch_logs ADD COLUMN completed_at timestamptz;
ALTER TABLE public.purchase_confirmation_logs ADD COLUMN completed_at timestamptz;
ALTER TABLE public.shipping_notification_logs ADD COLUMN completed_at timestamptz;
ALTER TABLE public.support_messages ADD COLUMN completed_at timestamptz;
```

1.2 — Em `src/lib/idempotency.ts`, `ClaimOnceOptions` ganha
`completedColumn?: string`. Na lógica de reclaim: se `completedColumn` foi
passado e a linha existente já tem valor nele (não nulo), **nunca**
tratar como abandonada — retornar `{ won: false }` direto, sem nem olhar
a idade. Só entra na checagem de "mais de X minutos" quando
`completedColumn` está vazio (ou não foi passado).

Adicionar também um helper novo:
```ts
export async function markClaimCompleted(
  admin: AdminClient,
  table: string,
  keyColumn: string,
  keyValue: string,
  completedColumn: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from as any)(table)
    .update({ [completedColumn]: new Date().toISOString() })
    .eq(keyColumn, keyValue)
}
```

1.3 — Atualizar os 4 lugares que usam `claimOnce` pra passar
`completedColumn: 'completed_at'` e chamar `markClaimCompleted` assim que
o trabalho de verdade terminar com sucesso:
- `pharmacy-order.ts`: chamar `markClaimCompleted` no fim do bloco
  try/catch que já existe (depois do `order_items` insert dar certo, antes
  do `return { orderId: order.id }`).
- `purchase-confirmed.ts`: chamar logo após `resend.emails.send` ter
  sucesso.
- `shipping/notify.ts`: idem, após o envio bem-sucedido.
- `support-inbox-poll.ts`: aqui não precisa de chamada separada — como a
  mensagem já está "completa" no instante em que é salva (não tem uma
  etapa posterior que possa falhar), incluir `completed_at: new Date().toISOString()`
  **já no objeto inserido** junto com o resto da linha, na mesma chamada
  de `claimOnce`.

1.4 — `protocol_creation_locks` (usado em `ensureProtocolAfterPayment`)
não precisa de `completed_at` — tem um jeito mais simples: essa tabela é
só um lock temporário, não um registro permanente (quem quer saber "já
tem protocolo?" já confere `subscriptions.protocol_id` no início da
função). Em vez de completar-e-nunca-liberar, **liberar a claim
(`releaseClaim`) assim que o protocolo for criado com sucesso**, logo
antes do `return protocol.id as string` (não só nos `catch`, que já
liberam em caso de erro). Isso mantém a tabela sempre vazia entre uma
corrida e outra, e os 10 minutos de "abandonada" passam a valer só pra
quando o processo morreu de verdade no meio.

1.5 — Como consequência da 1.4 (claim sempre liberada rápido no caminho
feliz), aumentar um pouco a janela de espera de `waitForProtocolId` de
10s (20×500ms, da rodada 9) pra 15s (30×500ms) — margem extra sem deixar
o checkout pendurado por muito tempo.

============================================================
PARTE 2 — Webhook sem chargeId não avisa ninguém
============================================================

Em `handlePaymentSucceeded` (`webhooks/pagarme/route.ts`), se
`getChargeId(payload)` vier vazio, o bloco inteiro de atualizar/criar
`payments` é pulado em silêncio — sem log nenhum. Adicionar
`console.warn('handlePaymentSucceeded: payload sem chargeId, payments não atualizado', payload)`
nesse caso (mesmo raciocínio de visibilidade das rodadas anteriores).

============================================================
NOTAS — achados que não entram nesta correção
============================================================

- **Fallback de "pagamento mais recente" em `pharmacy-order.ts`/
  `purchase-confirmed.ts` sem correlação garantida com a cobrança exata**:
  já mitigado o suficiente entre a filtragem por `status = 'paid'` (rodada
  8) e o `payment_id` vindo direto no evento na maioria dos casos (rodada
  6). O que sobra é um cenário bem mais raro (falha dupla no registro do
  pagamento) que já cai no log `CRÍTICO` da rodada 8/9 — aceito como está,
  não vale mais uma camada de correção em cima.
- **`insertPaymentWithRetry` retentar em qualquer tipo de erro, não só
  transitório**: na prática não causa dano — o pior caso é uma tentativa
  extra desperdiçada antes do log crítico já existente. Não vale a
  complexidade de distinguir tipo de erro agora.
- **`productKeyFromName` só loga em `console.error`, sem alerta de
  admin**: já é o nível de visibilidade certo pra essa raridade (nome de
  produto divergindo do catálogo) — criar UI de alerta seria
  desproporcional ao problema.

============================================================
NOTAS GERAIS
============================================================

- Rodar `npm run build`/typecheck no final.
- 1 migration nova (Parte 1.1) — ainda preciso rodar no Supabase depois.
