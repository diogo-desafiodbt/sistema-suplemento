# Prompt para o Cursor — Correções da 3ª rodada de /code-review (4 achados)

Mesma dinâmica das duas rodadas anteriores: o pattern de idempotência
(claim + libera em falha) ficou incompleto em pontos que ainda não
tinham sido cobertos, e sobrou duplicação de labels entre profissional e
PDF.

============================================================
PARTE 1 — pharmacy-order.ts: cobrir TODA a sequência pós-claim, não só o insert do pedido
============================================================

Hoje só o `orders.insert` tem liberação de claim em caso de erro. Duas
falhas depois disso não são cobertas:
- O `update` de `pharmacy_json` (linha ~265) não checa erro nenhum — se
  falhar, o pedido fica sem `pharmacy_json` e
  `prescricao/assinar/route.ts` (que confere `if (pendingOrder?.pharmacy_json)`
  antes de despachar) pula o envio pra farmácia silenciosamente, sem
  nunca reintentar.
- O `insert` em `order_items` (linha ~270) lança erro mas **não** libera
  a claim — o retry do Inngest esbarra em "already_dispatched" mesmo o
  pedido tendo ficado sem itens.

Corrigir envolvendo tudo que vem **depois** de criar o `order` (o
`update` de `pharmacy_json` e o `insert` de `order_items`) num único
try/catch. Em caso de qualquer erro nesse bloco: apagar o `order` recém-criado
e apagar a claim, depois relançar — assim um retry recria o pedido do
zero, em vez de deixar um pedido incompleto (sem `pharmacy_json` ou sem
itens) parado no banco:

```ts
try {
  const { error: pharmacyJsonError } = await admin
    .from('orders')
    .update({ pharmacy_json: pharmacyJson })
    .eq('id', order.id)

  if (pharmacyJsonError) {
    throw new Error(`Erro ao salvar pharmacy_json: ${pharmacyJsonError.message}`)
  }

  const { error: itemsError } = await admin.from('order_items').insert(
    activeItems.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      pharmacy_sku: item.products?.[skuKey] ?? '',
      quantity: 1,
      unit_price: getUnitPriceFromProduct(item.products, planType),
    }))
  )

  if (itemsError) {
    throw new Error(`Erro ao criar itens do pedido: ${itemsError.message}`)
  }
} catch (err) {
  await admin.from('orders').delete().eq('id', order.id)
  await admin
    .from('pharmacy_order_dispatch_logs')
    .delete()
    .eq('payment_id', payment.id)
  throw err
}

return { orderId: order.id }
```

============================================================
PARTE 2 — support-analyze.ts: liberar a claim do auto-ack se o envio falhar
============================================================

A claim atômica (`auto_ack_sent_at`) resolveu o envio duplicado, mas
introduziu o problema oposto: se `sendSupportEmail` falhar (erro
transitório de SMTP, por exemplo), o catch só loga — `auto_ack_sent_at`
já ficou marcado, então nenhuma execução futura (nem a próxima mensagem
da mesma thread) tenta mandar o aviso de novo. O cliente nunca recebe
nada.

Corrigir o catch pra desfazer a claim, permitindo nova tentativa depois:
```ts
} catch (error) {
  console.error('Falha ao enviar auto-ack de suporte:', error)
  await admin
    .from('support_threads')
    .update({ auto_ack_sent_at: null })
    .eq('id', threadId)
}
```

============================================================
PARTE 3 — Labels duplicados entre profissional e PDF
============================================================

`diagnosisLabel`, `RENAL_LABELS` e `HEPATIC_LABELS` estão copiados
palavra por palavra em
`src/app/(professional)/profissional/protocolo/[id]/page.tsx` (linhas
42-61) e em `src/lib/pdf/prescription-template.tsx` (linhas ~552-571).
Mover as 3 constantes pra `src/lib/protocol/triage.ts` (exportadas, junto
com `calcAge`/`PRODUCT_NAME_BY_KEY`, que já vivem lá) e trocar os dois
arquivos pra importar de lá em vez de redeclarar.

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final.
- Nenhuma migration nova nesta rodada.
- Padrão geral pra guardar: toda vez que uma claim de idempotência for
  inserida antes de uma sequência de passos, **todo** o resto da
  sequência até o "sucesso final" precisa estar dentro do mesmo
  try/catch que libera a claim em caso de erro — não só o primeiro passo
  logo depois da claim.
