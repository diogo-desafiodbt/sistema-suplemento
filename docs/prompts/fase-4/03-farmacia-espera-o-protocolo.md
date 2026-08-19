# Prompt — Fase 4, passo 3b: a farmácia espera o protocolo

> Referencie no Cursor com `@03-farmacia-espera-o-protocolo.md`.
> Branch: `reestrutura-suplementos`.

Um arquivo. Fecha uma corrida criada pelo passo 3.

## O que aconteceu

Com a criação do protocolo assíncrona, **duas funções reagem ao mesmo evento**:

```
pagamento/confirmado
   ├── processar-protocolos   cria o protocolo
   └── pharmacy-order         monta o pedido para a farmácia
```

E `pharmacy-order` **depende do protocolo existir**: a consulta dela tem
`JOIN protocols p ON p.id = s.protocol_id` e monta o pedido a partir de
`protocol_items`.

Se a farmácia chegar primeiro — e vai, em boa parte das vezes — o `JOIN` não
casa, nenhuma linha volta, e o pedido não é criado. **Sem erro, sem log.**

Antes existia um `throw` no webhook da Pagar.me que impedia isso, removido no
passo 3. Ele estava no lugar errado: derrubava o webhook inteiro em vez de
esperar. Removê-lo foi certo; falta pôr a garantia no lugar certo.

## A correção

Em `src/lib/inngest/functions/pharmacy-order.ts`, **antes** da consulta que faz
o `JOIN protocols` (~linha 165):

1. Leia `s.protocol_id` da assinatura.
2. Se for nulo, chame `ensureProtocolAfterPayment(subscriptionId, userId)` de
   `@/lib/protocol/create-from-checkout`.
3. Só então siga para a consulta atual.

Isso é seguro e não duplica: `ensureProtocolAfterPayment` já trata idempotência
e trava (`protocol_creation_locks`). Se o `processar-protocolos` estiver criando
no mesmo instante, a trava resolve — uma das duas ganha e a outra reaproveita.

`pharmacy-order` **é função do núcleo**, não da entrada: ela já lê prontuário
para montar o pedido. Dar a ela essa responsabilidade não amplia alcance nenhum.

## Se ainda assim não houver protocolo

Se depois da chamada `protocol_id` continuar nulo, **não estoure**. Registre com
`console.error` identificando a assinatura, feche o job com `status: 'failed'`
em `background_jobs`, e retorne.

O vigia pega esse caso pelo invariante que já existe — *pagamento pago há mais
de 10 minutos sem pedido*. Derrubar a função faria o Inngest repetir em laço
sem resolver nada.

## O que NÃO fazer

- **Não mude a consulta existente** nem a montagem do `pharmacy_json`. Só
  acrescente a garantia antes.
- **Não crie evento novo** (`protocolo/criado` ou parecido). Encadear eventos
  resolveria também, mas cria uma topologia a mais para manter e quebra o
  reprocessamento de compras antigas.
- **Não reescreva `ensureProtocolAfterPayment`.**
- **Não aplique migração**, não rode SQL, não faça deploy, não mexa em
  infraestrutura.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `pharmacy-order.ts` chama `ensureProtocolAfterPayment` quando
   `protocol_id` é nulo, antes da consulta com `JOIN protocols`.
3. Protocolo ausente depois disso vira `failed` em `background_jobs`, não
   exceção.
4. A consulta e o `pharmacy_json` continuam iguais.

Quando terminar, me chame para verificar.
