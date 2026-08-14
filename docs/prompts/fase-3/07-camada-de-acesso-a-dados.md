# Prompt 7 — Fase 3: a camada de acesso a dados

> Referencie no Cursor com `@07-camada-de-acesso-a-dados.md`.
> Branch: `reestrutura-suplementos`.

## Contexto

O banco clínico vai para o RDS Postgres, em subnet privada. `supabase-js` fala
com o PostgREST, que não existe lá — as consultas passam a ser SQL.

**Este prompt não converte o sistema.** Ele cria o módulo de conexão e converte
**dois arquivos** para provar o padrão. Vamos medir o resultado antes de soltar
os outros. Se o padrão estiver errado, é melhor descobrir em dois arquivos do
que em setenta.

Escopo total, para você dimensionar: 320 operações em 67 arquivos, sendo 13 com
junção aninhada.

## Parte 1 — o módulo de conexão

Crie `src/lib/db/index.ts` usando **`postgres`** (postgres.js). Adicione a
dependência.

Requisitos:

- **Uma instância só**, reaproveitada entre requisições. Criar conexão por
  requisição esgota o pool do RDS rapidamente.
- Configuração por `DATABASE_URL`. Erro claro se faltar.
- `ssl: 'require'` — o RDS com autenticação IAM exige TLS, e vamos usar IAM no
  corte final.
- Tipagem: as consultas devem devolver tipo declarado, não `any`.
- Timeout de consulta. Consulta pendurada num container é pior que erro.

Exponha também `withTransaction(fn)`, para as escritas que tocam várias tabelas
— `create-from-checkout.ts` grava em `quiz_responses`, `protocols`,
`protocol_items` e `subscriptions` no mesmo fluxo, com rollback manual hoje.
Transação de verdade substitui esse rollback à mão.

## Parte 2 — converter dois arquivos

Converta **apenas** estes, nesta ordem:

1. `src/app/api/products/route.ts` — o mais simples: um `select` com filtro e
   ordenação. Serve para fixar a forma básica.
2. `src/app/suplementos/(professional)/profissional/protocolo/[id]/page.tsx` —
   o mais difícil: junção aninhada de `protocols` + `users` +
   `quiz_responses` + `protocol_items` + `products`, e com a regra de
   autorização que acabamos de aplicar (fila aberta ou assinado por ele).

O segundo é proposital. Se o padrão aguenta a consulta mais complicada do
sistema, aguenta as outras 65.

**A regra de autorização precisa continuar dentro da consulta**, não em filtro
depois de carregar. Dado clínico não chega à memória se a pessoa não pode ver.

## Parte 3 — o que a conversão precisa preservar

- `maybeSingle()` → nenhuma linha devolve `null`, não lança.
- `single()` → nenhuma linha é erro.
- O formato aninhado que o PostgREST devolve (`protocol.users.full_name`) hoje
  alimenta o JSX. Ou monte o mesmo formato no SQL, ou ajuste o JSX — **diga qual
  você escolheu e por quê**.
- Nenhuma mudança de comportamento visível. Esta é uma troca de encanamento.

## Não faça

- **Não converta nenhum outro arquivo.** Nem que pareça trivial.
- Não mexa em `supabase-js` para Auth e Storage — os dois continuam na Supabase,
  e é assim de propósito.
- Não crie ORM nem gerador de consulta. SQL escrito à mão, legível, com
  parâmetros — nunca concatenação de string.
- Não altere esquema.
- Não remova `src/lib/supabase/admin.ts` — 65 arquivos ainda dependem dele.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Quanto tempo levou cada um dos dois arquivos.
2. Qual foi a parte mais difícil da junção aninhada.
3. Sua estimativa para os 65 restantes, agora que mediu.

Essas três respostas valem mais que o código — são elas que definem se
seguimos ou se mudamos de abordagem.

## Como será verificado

1. `/api/products` devolve exatamente o mesmo JSON de hoje.
2. A página de protocolo renderiza igual.
3. Profissional ainda não abre protocolo alheio — o teste do Prompt 1 tem que
   continuar passando.
4. Nenhuma consulta monta SQL por concatenação.
