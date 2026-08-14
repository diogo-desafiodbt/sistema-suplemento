# Prompt 3 — Fase 0: tirar a credencial de admin das rotas públicas

> Referencie no Cursor com `@03-rotas-publicas-sem-credencial-de-admin.md`.
> Branch: `reestrutura-suplementos`.

## O problema não é falta de login

`src/app/api/products/route.ts` e `src/app/api/funnel/track/route.ts` são
alcançáveis sem autenticação — **e devem continuar sendo.** Catálogo é público, e
evento de funil vem de visitante que ainda não tem conta.

O problema é que as duas usam `createAdminClient()`, a credencial que ignora RLS
e alcança as 58 tabelas, para servir dado público. Qualquer falha nelas — uma
injeção, um erro de parâmetro, uma dependência comprometida — acontece com a
chave mais poderosa do sistema na mão.

**Corrigir é trocar a credencial, não fechar a porta.**

## Levantamento já feito (não precisa refazer)

| | Situação |
|---|---|
| `products` — política RLS | `products_read`, `SELECT`, `USING (true)` |
| `products` — permissão do `anon` | **já tem** `SELECT` |
| `funnel_events` — políticas | **nenhuma** |
| `funnel_events` — permissão do `anon` | **não tem** `INSERT` |

Ou seja: `products` funciona só trocando o client. `funnel_events` precisa de
migração.

## Parte 1 — `/api/products`

Troque `createAdminClient()` pelo client anônimo. Use `@/lib/supabase/server`
(`createClient()`), que já usa a chave publicável.

Nada mais muda: a política existente libera a leitura, e a rota já filtra
`is_active = true`.

## Parte 2 — `/api/funnel/track`

Troque `createAdminClient()` pelo mesmo client anônimo **e** crie uma migração
em `supabase/migrations/` que:

1. Conceda ao papel `anon` **apenas `INSERT`** em `public.funnel_events`.
   Nada de `SELECT`, `UPDATE` ou `DELETE` — a rota só escreve, e quem escreve
   não precisa poder ler o funil dos outros.

2. Crie uma política de `INSERT` cujo `WITH CHECK` aceite **somente** os quatro
   tipos de evento já validados na rota:
   `quiz_started`, `quiz_completed`, `quiz_eligible`, `checkout_started`.

O ponto da política: hoje a lista de eventos válidos existe só no código da
rota. Colocá-la também no banco significa que **contornar a rota não contorna a
validação**.

Mantenha o `upsert` com `onConflict: 'session_id,event_type'` e
`ignoreDuplicates: true` — vira `ON CONFLICT DO NOTHING`, que precisa apenas de
`INSERT`.

## Não faça

- Não exija login em nenhuma das duas. Quebraria o quiz do visitante.
- Não altere a política `products_read` nem as permissões de `products`.
- Não adicione limite de taxa: precisa de infraestrutura que não existe, e o
  risco aqui é enchimento de tabela, não vazamento. Fica anotado para depois.
- Não mexa em nenhuma outra rota.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

**Não aplique a migração.** Eu aplico e verifico contra o banco.

## Como será verificado

1. Com a chave publicável, `select` em `products` funciona.
2. Com a chave publicável, `insert` em `funnel_events` com tipo válido funciona.
3. Com a chave publicável, `insert` com tipo **inventado** é recusado **pelo
   banco** — não pela rota.
4. Com a chave publicável, `select` em `funnel_events` é recusado.
5. Com a chave publicável, `select` em `quiz_responses` continua recusado.
