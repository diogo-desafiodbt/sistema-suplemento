# Prompt — Fase 4, passo 3: a criação do protocolo sai da entrada

> Referencie no Cursor com `@02-caixa-de-saida-do-protocolo.md`.
> Branch: `reestrutura-suplementos`.
>
> **Esta é a segunda versão.** A primeira pedia uma tabela `protocolos_pendentes`
> gravada na transação do pagamento. Estava errada em dois pontos — a explicação
> está no fim, porque as duas armadilhas valem para o resto do projeto.

Uma rota nova, uma função de Inngest, e a remoção de duas chamadas. **Sem
migração, sem tabela nova, sem mexer em transação.**

## O problema

`api/checkout/create` e `api/webhooks/pagarme` chamam `ensureProtocolAfterPayment`
de forma síncrona. Isso os faz ler e escrever `protocols`, `protocol_items`,
`quiz_responses` e `protocol_creation_locks` — tabelas clínicas, em rota
pública. É o último obstáculo para a credencial separada.

## O desenho

O banco **já sabe** quem precisa de protocolo: assinatura com pagamento `paid` e
`protocol_id IS NULL`. Não precisa de tabela de intenção — ela seria um segundo
lugar dizendo a mesma coisa, e dois lugares divergem.

```
entrada    grava o pagamento, emite pagamento/confirmado   ← nunca toca protocols
   ↓
   ├── Inngest              caminho rápido
   ├── EventBridge → ECS    reserva, NÃO depende do Inngest   (minha, depois)
   └── vigia                alerta se ficar pendente          (já existe)
```

**Você faz a rota interna e a função do Inngest.** As camadas 2 e 3 são
infraestrutura e são minhas.

## Correção 1 — tirar a chamada da entrada

`src/app/api/checkout/create/route.ts`, em `finalizePaidSubscription` (~183):
mantenha `activateSubscriptionRow`, **remova** a chamada a
`ensureProtocolAfterPayment` e o `return` dela. A função passa a devolver `void`.

`src/app/api/webhooks/pagarme/route.ts` (~396): remova a chamada.

Nos dois casos o evento `pagamento/confirmado` **já é emitido** — não mexa nisso.

A resposta do checkout passa a devolver `protocol_id: null` sempre. Conferi:
nenhum consumidor usa esse campo; o front lê só `results`, `pix` e
`subscription_id`.

## Correção 2 — a rota interna que executa

`src/app/api/interno/processar-protocolos/route.ts`, POST.

- Autentica por token no mesmo padrão de `src/lib/security/token.ts` que os
  webhooks já usam. Segredo `INTERNO_TOKEN`. **Sem token válido, 401.**
- Busca as pendentes:

```sql
SELECT s.id, s.user_id
FROM subscriptions s
JOIN payments p ON p.subscription_id = s.id AND p.status = 'paid'
WHERE s.protocol_id IS NULL
ORDER BY p.paid_at
LIMIT 20
```

- Para cada uma chama `ensureProtocolAfterPayment(subscriptionId, userId)` —
  **a mesma função de hoje. Não reescreva a lógica**: ela já trata idempotência,
  trava e retomada.
- Falha em uma não interrompe as outras: `try/catch` por item, com
  `console.error` identificando a assinatura.
- Devolve `{ processadas, falhas }`.

## Correção 3 — a função do Inngest (caminho rápido)

`src/lib/inngest/functions/processar-protocolos.ts`, disparada por
`pagamento/confirmado`, com `subscription_id` e `user_id` vindos do evento.

Chama `ensureProtocolAfterPayment` e registra em `background_jobs` com
`registrarInicio`/`registrarFim`, como as outras 13. Inclua no `serve()` de
`src/app/api/inngest/route.ts`.

Precisa de um valor no enum `job_type`: `processar_protocolos`. Migração
separada, no padrão de `20260819020000_job_type_restantes.sql`. **Não aplique.**

## O que NÃO fazer

- **Não crie tabela de intenção** nem mexa em transação de pagamento. Ver o fim
  deste documento.
- **Não reescreva `ensureProtocolAfterPayment`.**
- **Não crie credencial, usuário de banco, serviço no ECS, regra de ALB nem
  agendamento.** Passo 4, e é meu.
- **Não aplique migração**, não rode SQL, não faça deploy, não mexa em task
  definition, Secrets Manager, EventBridge ou CloudWatch.
- **Não mexa em `api/prescricao/assinar`** — é núcleo, não entrada.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `grep -rn "ensureProtocolAfterPayment" src/app/api/checkout/ src/app/api/webhooks/pagarme/` **não devolve nada**.
3. `/api/interno/processar-protocolos` devolve 401 sem token.
4. Uma migração escrita (só o enum) e **não aplicada**.

## Por que a primeira versão estava errada

**A transação faria mal.** Se pagamento e intenção estivessem no mesmo `BEGIN` e
a intenção falhasse, os dois reverteriam — e a Pagar.me já teria cobrado.
`ROLLBACK` não desfaz cobrança em outra empresa. Trocaria um problema
recuperável (pagamento gravado, protocolo pendente, vigia avisa) por um
invisível (cobrança sem registro nenhum).

**Regra que vale para o resto do projeto:** o que já saiu para fora — cobrança,
e-mail, pedido para a farmácia — nunca entra em transação com o que é nosso. O
registro local do fato externo tem que sobreviver mesmo quando o resto falha.

**A tabela era redundante.** `subscriptions.protocol_id IS NULL` com pagamento
`paid` já é exatamente "precisa de protocolo". Uma tabela nova seria um segundo
lugar dizendo o mesmo, e dois lugares divergem — depois vira "qual dos dois está
certo?".

Quando terminar, me chame. Eu confiro refazendo a medição das rotas de entrada:
`checkout/create` e `webhooks/pagarme` têm que sair da lista de quem lê clínico.
