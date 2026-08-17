# Prompt 16 — Fase 3: enum comparado com text, e o logout do IMAP

> Referencie no Cursor com `@16-enum-vs-text-e-logout-do-imap.md`.
> Branch: `reestrutura-suplementos`.

Quatro arquivos. É correção de defeito achado em produção depois do corte para
o RDS — não é refatoração, não é feature. Mudança pequena e cirúrgica.

## O defeito, medido no banco

Depois do corte, três consultas quebraram em produção com **42883**:

```
ERROR:  operator does not exist: support_thread_status = text
HINT:   No operator matches the given name and argument types.
        You might need to add explicit type casts.
```

O PostgREST resolvia esse cast sozinho. **SQL cru não resolve.** Quando a
coluna é `enum` e o parâmetro chega marcado como `text`, o Postgres não acha
operador de igualdade e derruba a consulta inteira.

Rodei as três contra o RDS, exatamente como o código as envia. Resultado:

| Consulta | Como está hoje | Com o cast certo |
|---|---|---|
| `support-pending-reminder.ts:31` | **42883** | 2 linhas |
| `admin/suporte/page.tsx:38` | **42883** | 2 linhas |
| `api/assinatura/cancelar/route.ts:56` | **42883** | 2 linhas |

Não é teoria: as três devolvem dado real assim que o cast muda.

### Por que só o cast explícito quebra

Comparação de valor único **não** quebra:

```ts
WHERE status = ${'active'}          // funciona — o Postgres infere o enum
```

O que quebra é o cast explícito para `text`, porque ele força o tipo antes de
o Postgres poder inferir:

```ts
WHERE status = ANY(${sql.array([...])}::text[])   // 42883
```

Guarde essa distinção: ela é o critério da varredura no fim deste prompt.

## Correção 1 — `src/lib/inngest/functions/support-pending-reminder.ts:31`

Este job está **quebrado 100% desde o corte**, e tem trabalho parado: existem
2 threads em `aguardando_dados` esperando virar e-mail de lembrete.

```ts
// hoje
WHERE status = ANY(${sql.array(['aguardando_revisao', 'aguardando_dados'])}::text[])

// deve ficar
WHERE status = ANY(${sql.array(['aguardando_revisao', 'aguardando_dados'])}::support_thread_status[])
```

## Correção 2 — `src/app/suplementos/(admin)/admin/suporte/page.tsx:38`

Mesma tabela, mesma coluna, três valores. **A página do painel de suporte não
renderiza** — é justamente a tela para onde o e-mail da Correção 1 aponta.

```ts
// hoje
WHERE t.status = ANY(${sql.array(['aguardando_revisao', 'aguardando_dados', 'novo'])}::text[])

// deve ficar
WHERE t.status = ANY(${sql.array(['aguardando_revisao', 'aguardando_dados', 'novo'])}::support_thread_status[])
```

## Correção 3 — `src/app/api/assinatura/cancelar/route.ts:56`

Outra coluna, outro enum. Esta é a mais séria das três: é **rota de paciente**.
Hoje não morde porque o portão de pré-lançamento está fechado, mas do jeito que
está, **cancelamento de assinatura devolve 500 no dia do lançamento**. Há 2
assinaturas ativas no banco.

```ts
// hoje
AND status = ANY(${sql.array(['active', 'past_due', 'grace_period'])}::text[])

// deve ficar
AND status = ANY(${sql.array(['active', 'past_due', 'grace_period'])}::subscription_status[])
```

### Não resolva pelo outro lado

Existe uma correção alternativa que parece equivalente e não é:

```ts
WHERE status::text = ANY(...)   // NÃO fazer
```

Isso funciona, mas converte a coluna linha a linha e **inutiliza qualquer
índice sobre ela**. Casta-se o array para o tipo da coluna, nunca a coluna para
text.

## Correção 4 — `src/lib/inngest/functions/support-inbox-poll.ts` (bloco `finally`, ~linha 318)

Problema diferente, mesmo arquivo de assunto. Desde o corte foram **643 falhas
registradas em ~13 horas** — e o trabalho estava dando certo o tempo todo.

O que acontece: o socket TLS do IMAP estoura (`ETIMEOUT`), e aí o `finally`
chama `client.logout()` numa conexão que já morreu, o que lança
`Connection not available` (`code: 'NoConnection'`). Esse segundo erro escapa
do `finally` e **reprova a run inteira no Inngest**, mesmo quando todas as
mensagens foram processadas e marcadas como lidas.

Conferi no banco: os dois e-mails reais que chegaram foram gravados, dispararam
evento e receberam `completed_at`. O trabalho passa. A falha é só no encerramento.

```ts
// hoje
} finally {
  lock.release()
  await client.logout()
}

// deve ficar
} finally {
  lock.release()
  try {
    await client.logout()
  } catch (logoutError) {
    // A conexão já pode ter morrido (socket timeout do IMAP). O trabalho
    // desta run já terminou; encerrar mal não deve reprovar a run.
    console.warn('support-inbox-poll: logout do IMAP falhou:', logoutError)
  }
}
```

**Não mexa em mais nada deste arquivo.** A lógica de claim, de cura de claim
parcial e de `\\Seen` está correta e verificada contra o banco — o único defeito
é o `logout()` desprotegido.

Deixe `lock.release()` fora do `try`: se ele falhar, é problema real e deve
aparecer.

## Varredura — o resto do código

Depois das quatro correções, varra o `src/` inteiro por **cast explícito para
`text` ou `text[]` em comparação com coluna enum**. O padrão a procurar é
`::text[]` e `::text` dentro de template de SQL.

Estas são as **25 colunas enum** do banco `clinico`. Se uma delas aparecer
comparada com valor castado para text, é o mesmo defeito:

| Tabela | Coluna | Tipo enum |
|---|---|---|
| `background_jobs` | `job_type` | `job_type` |
| `background_jobs` | `status` | `job_status` |
| `content_access` | `content_key` | `content_key_type` |
| `discount_coupons` | `type` | `coupon_type` |
| `funnel_events` | `event_type` | `funnel_event_type` |
| `health_records` | `record_type` | `record_type` |
| `notification_logs` | `channel` | `notification_channel` |
| `notification_logs` | `status` | `notification_status` |
| `notification_logs` | `type` | `notification_type` |
| `orders` | `status` | `order_status` |
| `payments` | `status` | `payment_status` |
| `prescription_audit_logs` | `action` | `audit_action` |
| `protocols` | `status` | `protocol_status` |
| `quiz_responses` | `diagnosis_type` | `diagnosis_type` |
| `subscriptions` | `plan_type` | `plan_type` |
| `subscriptions` | `status` | `subscription_status` |
| `sunday_dispatch_logs` | `channel` | `notification_channel` |
| `sunday_dispatch_logs` | `tier_at_dispatch` | `rfm_tier` |
| `support_threads` | `status` | `support_thread_status` |
| `user_entitlements` | `product_key` | `entitlement_product` |
| `user_entitlements` | `status` | `entitlement_status` |
| `user_rfm_scores` | `previous_tier` | `rfm_tier` |
| `user_rfm_scores` | `tier` | `rfm_tier` |
| `users` | `role` | `user_role` |
| `webhook_logs` | `source` | `webhook_source` |

### Três ocorrências que estão CERTAS — não mexer

Estas usam `::text[]` contra `system_config.key`, que é `text` de verdade.
Já conferi no banco. Deixe como estão:

- `src/lib/inngest/functions/pharmacy-order.ts:271`
- `src/lib/shipping/sender-region.ts:82`
- `src/lib/shipping/package.ts:26`

E `src/app/suplementos/(admin)/admin/clientes/page.tsx:58` usa `${search}::text`
sobre um parâmetro, não sobre coluna enum. Também está certo.

## O que NÃO fazer

- **Não rode SQL contra o banco.** O `clinico` não é alcançável da sua máquina,
  e a verificação é minha — eu rodo pela tarefa ECS depois que você terminar.
- **Não mexa no `rfm-recalc.ts`.** Ele está correto; conferi as 17 execuções da
  noite. Ele grava 0 linhas porque a fila está vazia, não por defeito.
- **Não converta os 3 arquivos de conteúdo** (Hotmart, Omie, YouTube). Eles
  ainda usam `supabase-js` de propósito.
- **Não faça deploy.** Nada vai para produção sem o Diogo por perto.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. As quatro correções estão aplicadas.
3. A varredura terminou e você diz explicitamente **quantas ocorrências novas
   achou** — inclusive se forem zero. Se achar alguma, liste arquivo e linha
   antes de corrigir.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor. Eu rodo o SQL contra o RDS, confirmo que as três consultas voltaram a
responder, e só então commito e envio.
