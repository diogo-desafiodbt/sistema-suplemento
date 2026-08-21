# Prompt — Fase 5, passo 1: a janela do paciente

> Referencie no Cursor com `@01-janela-do-paciente.md`.
> Branch: `reestrutura-suplementos`.
> Contrato completo: `docs/contratos/portal-do-paciente.md` — **leia antes.**

Nove rotas novas no núcleo. **Este passo não move o portal ainda** — ele constrói
a janela pela qual o portal vai passar a perguntar.

## Por que isto existe

A regra de arquitetura do projeto diz:

> **Zona 1 — operacional**: referencia pessoas, não lê prontuário.
> **Consome API de contrato, nunca credencial de banco.**

Hoje o portal do paciente lê o banco direto. Se alguém invadir o processo dele,
leva `SELECT nome, cpf, endereço FROM users` — a base inteira de clientes. Com o
contrato, leva **uma conta**.

## A regra que vale para as nove

**Toda pergunta começa com "meu".** O dono vem **sempre** da sessão validada no
servidor — nunca do corpo, nunca da URL, nunca de cabeçalho.

Se você se pegar escrevendo `user_id` vindo do request, parou: está errado.

## As rotas

`src/app/api/contrato/paciente/<nome>/route.ts`, todas POST.

| Rota | Entra | Sai |
|---|---|---|
| `meu-perfil` | — | full_name, email, phone, cpf, birth_date |
| `atualizar-perfil` | full_name, phone, birth_date | `{ok:true}` |
| `meu-endereco` | — | zip_code, street, number, complement, neighborhood, city, state |
| `salvar-endereco` | os campos acima | `{ok:true}` |
| `minha-assinatura` | — | id, plan_type, status, expires_at, grace_period_ends_at, pagarme_sub_id |
| `cancelar-assinatura` | — | `{ok:true}` |
| `meus-pagamentos` | — | últimos 5: id, amount, status, paid_at |
| `meus-pedidos` | — | lista: id, status, created_at, tracking_code, itens |
| `meu-pedido` | `{ order_id }` | detalhe + rastreamento |

**Reaproveite as consultas que já existem** nas telas de
`src/app/suplementos/(patient)/` e em `api/perfil/atualizar`,
`api/assinatura/cancelar`, `api/auth/profile`. A lógica está certa; muda o lugar.

## Identidade

Cada rota valida a sessão com `createClient()` de `@/lib/supabase/server` e
`supabase.auth.getUser()`, como as rotas de hoje. Sem sessão válida: **401**.

O núcleo **não confia em quem chamou** — ele mesmo valida e extrai o dono. Não
aceite um `user_id` no corpo "porque o portal já validou".

## `meu-pedido` é a única que recebe um id

Confira que o pedido pertence ao dono da sessão. Se não pertencer, devolva
**404, nunca 403** — um 403 confirmaria que aquele pedido existe.

O caminho é o mesmo do que a tela usa hoje: `orders → subscriptions → user_id`.

## Um defeito para corrigir ao mover

Na tela de assinatura, a consulta de pagamentos filtra por `subscription_id` e
só é segura porque a consulta **anterior** buscou a assinatura filtrando por
usuário. A proteção depende de duas consultas em sequência estarem certas.

Em `meus-pagamentos`, **confira o dono na própria consulta** — junte
`payments → subscriptions → user_id` num `WHERE` só. Não replique a sequência.

## O que NÃO fazer

- **Não mexa nas telas do portal ainda.** Elas continuam lendo o banco direto
  neste passo. Trocar as duas coisas ao mesmo tempo esconde qual delas quebrou.
- **Não crie credencial, serviço no ECS, regra de ALB nem task definition.**
- **Não aceite `user_id`, `cpf` ou e-mail como entrada** em nenhuma das nove.
  E-mail se troca no Auth; CPF não se corrige por formulário de perfil.
- **Não invente rota fora da lista.** Se faltar dado para alguma tela, **pare e
  me avise** — pode ser que o contrato esteja incompleto, e prefiro corrigir o
  contrato a ganhar uma décima rota improvisada.
- **Não rode SQL contra o banco**, não faça deploy, não mexa em infraestrutura.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. As nove rotas existem e devolvem **401 sem sessão**.
3. `grep -rn "user_id" src/app/api/contrato/` não mostra nenhum `user_id` vindo
   do request — só da sessão.
4. `meu-pedido` devolve 404 (não 403) para pedido de outro dono.
5. `meus-pagamentos` confere o dono numa consulta só.
6. As telas do portal continuam funcionando **exatamente como antes** — este
   passo não mexe nelas.

Quando terminar, me chame para verificar. Eu testo as nove com sessão real,
incluindo tentar ler o pedido de outro cliente.
