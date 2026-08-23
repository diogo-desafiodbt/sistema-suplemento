# Prompt — Fase 8, passo 5: o backfill vira função

> Referencie no Cursor com `@05-backfill-vira-funcao.md`.
> Branch: `reestrutura-suplementos`.

Os dois backfills do passo 4 estão certos e **não têm como rodar**. Erro meu no
prompt anterior, não seu.

```
RDS público?             não
alcança de fora da VPC?  não
a imagem leva scripts/?  não — só .next/standalone, .next/static e public
```

O banco vive em subnet privada de propósito. Script na máquina de alguém não
alcança, e a imagem do contêiner não carrega a pasta `scripts/`.

**O que roda lá dentro é o próprio app.** Então o backfill vira função do
Inngest, que já vive no contêiner com credencial e acesso ao banco.

## O que se aproveita

Quase tudo: paginação, fatiamento em janelas, tratamento de limite da API,
montagem da linha, gravação com `ON CONFLICT`. **Mude o invólucro, não a
lógica** — ela foi conferida no passo 4.

## As duas funções

```
src/lib/inngest/functions/hotmart-backfill.ts
src/lib/inngest/functions/omie-backfill.ts
```

Disparadas por evento, **sem cron** — rodam quando eu mandar:

```
conteudo/hotmart.backfill   data: { conta: 1 | 2 }
conteudo/omie.backfill      data: {}
```

Registre as duas em `src/app/api/inngest/route.ts`.

## Uma fatia por passo — é o ganho da mudança

Isto não é detalhe de estilo. Cada janela de tempo vira um `step.run` próprio:

```ts
for (let i = 0; i < 12; i++) {
  await step.run(`fatia-${i + 1}`, async () => { ... })
}
```

Assim, se a fatia 7 falhar por limite da API, **o Inngest repete só a 7** — as
outras onze não são refeitas. Com script, um tropeço no fim significa começar de
novo e torcer.

Passo que já terminou não roda duas vezes, então o retry não regrava o que já
estava gravado.

## Cuidados que continuam valendo

- **`conta_product_id` em toda venda.** Conta 1 → `HOTMART_*`; conta 2 →
  `HOTMART2_*`. Se vier outro valor em `conta`, falhe alto em vez de assumir 1.
- **Janela vazia não chama o banco.** Vai acontecer: 12 meses atrás pode não ter
  nada, e `${[]}` interpolado vira `syntax error at or near "$3"`.
- **`ON CONFLICT DO UPDATE`** com as chaves que já existem —
  `transaction_code`, `codigo_titulo`, `codigo`.
- Registre em `background_jobs` com `registrarInicio`/`registrarFim`, como os
  outros. Sem isso o vigia não enxerga a execução.

## Diga quanto veio e quanto entrou

No `payload` do fim, e no log de cada fatia:

```
fatia 3/12 — 217 buscadas, 217 gravadas
```

Os dois números, sempre. **"217 gravadas" sozinho não diz se faltou alguma
coisa** — a diferença entre buscar e gravar é o que denuncia problema de chave
ou linha recusada.

## O que NÃO fazer

- **Não apague** `scripts/hotmart-backfill.mjs`, `scripts/omie-backfill.mjs`
  nem `scripts/lib/conteudo-db.mjs`. Ficam para quando existir um jeito de
  rodar de dentro da VPC.
- **Não ponha cron nessas duas.** Backfill é uma vez, no meu comando.
- **Não mexa nos jobs diários** de Hotmart e Omie.
- **Não religue o YouTube.**
- **Não leia da Supabase.**
- **Não rode nada, não faça deploy.**

## Critério de pronto

1. `npx tsc --noEmit` e `npm run build` passam.
2. As duas funções aparecem em `src/app/api/inngest/route.ts` — **14 no total**,
   e o YouTube continua fora.
3. Nenhuma das duas tem `cron`.
4. Cada janela é um `step.run` separado.
5. Janela vazia não chama o banco.
6. O log de cada fatia traz **buscadas e gravadas**.
7. Os scripts do passo 4 continuam no repositório.

Quando terminar, me chame. Eu subo, disparo os três eventos pelo painel —
Hotmart nas duas contas e Omie — e acompanho fatia a fatia. Depois confiro
total por conta e intervalo de datas.
