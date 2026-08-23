# Prompt — Fase 8, passo 3: o conteúdo sai da Supabase

> Referencie no Cursor com `@03-conteudo-sai-da-supabase.md`.
> Branch: `reestrutura-suplementos`.

O passo 2 tirou a autenticação da Supabase, mas **não tirou a Supabase**. Três
jobs continuam gravando lá pela API REST: Hotmart, Omie e YouTube.

> **Recorte decidido pelo Diogo em 23/08/2026:** migram **Omie e Hotmart**. O
> **YouTube Analytics é desligado** — ele não vai usar esse dado por enquanto.
> As 10 tabelas dele ficam prontas e vazias no RDS; religar depois é apontar o
> job para o banco novo. O dado é todo re-sincronizável da origem, então nada
> se perde ao desligar.

Saiu a biblioteca, ficou a dependência. Este passo fecha isso — e depois dele o
projeto da Supabase pode ser apagado sem que nada pare, que é o critério do
plano para esta fase.

## O que eu já preparei

As **13 tabelas existem no banco `conteudo` do RDS**, com a mesma estrutura,
chaves e índices que têm hoje na Supabase. Conferidas.

Papel **`job_conteudo`**, token IAM, com `SELECT/INSERT/UPDATE` nas 13 e
**sem DELETE**.

Ele vive **só no banco `conteudo`**. Não existe no `clinico` — quem sincroniza
vendas e métricas não alcança prontuário nem por consulta mal escrita.

## O que muda no código

**Apague `src/lib/conteudo/rest.ts`.** Ele foi uma ponte para o passo 2 não
quebrar, e a ponte acabou.

No lugar, `src/lib/conteudo/db.ts`: uma conexão `postgres` para o banco
`conteudo`, com token IAM — **o mesmo padrão de `src/lib/db.ts`**, trocando o
banco e o usuário. Leia aquele arquivo e siga a forma dele, inclusive o cuidado
com `idle_timeout`.

```
banco    conteudo
usuário  job_conteudo
host     o mesmo do clinico
```

**Dois** jobs passam a usar SQL direto:

```
src/lib/inngest/functions/hotmart-sales-sync.ts
src/lib/inngest/functions/omie-financeiro-sync.ts
```

### O terceiro sai do ar

`youtube-analytics-sync` **sai da lista servida em `src/app/api/inngest/route.ts`**,
como o `create-shipping-label` saiu. O arquivo **fica no repositório** — não
apague. Ele volta quando o Diogo quiser o canal de novo, e aí é reescrever a
gravação como nos outros dois.

Deixe um comentário no topo dele dizendo que está desligado desde 23/08/2026 e
que a gravação ainda é a antiga.

## As armadilhas desta tradução, que já custaram caro antes

Isto não é teoria: são os três erros que apareceram quando o núcleo saiu do
PostgREST para SQL cru, em agosto.

**1. `ON CONFLICT` precisa de índice único.** O `upsert` do PostgREST virava
isso sozinho. Em SQL cru, use as chaves que já existem:

| tabela | conflito |
|---|---|
| `hotmart_sales` | `(transaction_code)` |
| `omie_categorias` | `(codigo)` |
| `omie_movimentos_financeiros` | `(codigo_titulo)` |

**2. `numeric` volta como texto**, não número. O PostgREST convertia. Se algum
lugar somar ou comparar, converta antes — há `asNumber` em `src/lib/db.ts`.

**3. `timestamptz` volta como `Date`**, não string. Cuidado ao montar chave ou
comparar com texto.

E uma quarta, desta vez: **array vazio não pode ser interpolado**. `${[]}` vira
parâmetro onde o SQL espera cláusula, e dá `syntax error at or near "$3"`.
Aconteceu no job da farmácia. Se um lote vier vazio, **não chame o banco**.

## Contagem: era `count: 'exact'`, agora é outra coisa

O cliente REST devolvia contagem por cabeçalho. Em SQL, use o que o `postgres`
já dá — `result.count` — ou `RETURNING` quando precisar do que foi gravado.

Não invente `SELECT count(*)` extra depois de gravar: é uma ida a mais ao banco
para saber o que a própria escrita já respondeu.

## O que NÃO fazer

- **Não migre dado.** As 91.838 linhas são todas re-sincronizáveis da origem: os
  jobs rodam e reconstroem. Migrar seria uma janela de risco para nada.
- **Não use `job_conteudo` para nada fora desses três jobs**, e não o faça
  alcançar o `clinico`.
- **Não apague nada na Supabase.** O projeto sai depois, e é minha mão.
- **Não mexa nos satélites nem na autenticação.**
- **Não crie tabela nem papel** — estão prontos.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `src/lib/conteudo/rest.ts` não existe mais.
3. `grep -rniE "postgrest|rest/v1|apikey" src/` volta vazio.
4. Os **dois** jobs importam de `src/lib/conteudo/db.ts` e usam SQL direto.
5. Todo `ON CONFLICT` bate com a tabela acima.
6. Nenhum job chama o banco com lote vazio.
7. `youtube-analytics-sync` **não aparece** na lista de funções do Inngest, e o
   arquivo dele **continua existindo**.

Quando terminar, me chame antes de mexer em outra coisa. Eu troco os segredos,
subo, e **disparo os dois jobs à mão** — só ver a tabela encher prova que
funcionou.

Aí eu tiro o YouTube da lista que o vigia cobra (senão ele acusa cron atrasado
todo dia) e **apago o projeto da Supabase**.
