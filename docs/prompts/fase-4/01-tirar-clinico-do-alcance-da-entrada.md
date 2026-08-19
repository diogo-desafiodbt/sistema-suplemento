# Prompt — Fase 4, passo 1 e 2: tirar o clínico do alcance da entrada

> Referencie no Cursor com `@01-tirar-clinico-do-alcance-da-entrada.md`.
> Branch: `reestrutura-suplementos`.

Primeiro movimento da Fase 4. **Não é a segurança em si** — é o que a torna
possível. Hoje as rotas de entrada leem prontuário, então nenhuma separação de
processo funcionaria: a nova credencial quebraria o checkout no primeiro pedido.

## O que foi medido

Segui os imports de cada rota de `src/app/api` até os módulos de `src/lib`, três
níveis, e cruzei com as tabelas clínicas. **Nove rotas de entrada leem dado
clínico.** Este prompt elimina seis.

## Correção 1 — apagar duas rotas mortas

```
src/app/api/protocol/[id]/route.ts
src/app/api/protocol/[id]/remove-item/route.ts
```

As duas leem `protocols` e `protocol_items`. **Nenhuma é chamada por ninguém** —
`grep -rn "api/protocol" src/` fora do próprio diretório não devolve nada.

Apague as duas, e o diretório `src/app/api/protocol/` se ficar vazio.

Código morto que lê prontuário é risco sem contrapartida: continua exposto na
internet, continua carregando a credencial, e ninguém testa porque ninguém usa.

**Se você encontrar algum uso que eu não vi, PARE e me avise** em vez de apagar.

## Correção 2 — consulta estreita nas quatro que só querem o PDF

Estas quatro leem `protocols` por **um campo só**, `prescription_pdf_path`:

```
src/app/api/webhooks/shipping/etiqueta/route.ts
src/app/api/webhooks/shipping/rastreamento/route.ts
src/app/api/farmacia/pedidos/route.ts
src/app/api/farmacia/pedidos/json/route.ts
```

Hoje o `JOIN protocols` traz a linha inteira — status, `signed_by`,
`quiz_response_id`, `creation_subscription_id`. Nada disso é usado.

Ajuste cada consulta para selecionar **apenas** `p.prescription_pdf_path` (e o
que mais for comprovadamente usado — confira antes, não presuma). O `JOIN`
continua onde for necessário para chegar ao pedido; o que muda é o que se lê da
tabela.

Isso é pré-requisito de um `GRANT SELECT (prescription_pdf_path)` que eu vou
aplicar depois: com o grant estreito, ler outra coluna passa a ser
`permission denied` — deixa de depender de alguém lembrar.

**Não mude a lógica.** Se um `if` de regra mudar, está errado. É só o conjunto
de colunas.

## O que NÃO fazer

- **Não mexa em `api/checkout/create` nem em `api/webhooks/pagarme`.** São as
  duas últimas e dependem de mover a criação do protocolo para evento — passo 3,
  prompt próprio.
- **Não mexa em `api/prescricao/assinar`.** Ele lê clínico porque é o
  profissional trabalhando: é núcleo, não entrada.
- **Não crie credencial nova, usuário de banco, serviço no ECS nem regra de
  ALB.** Isso é o passo 4 e é meu.
- **Não rode SQL contra o banco**, não faça deploy, não mexa em task definition,
  Secrets Manager, EventBridge ou CloudWatch.
- **Não crie `/nova-senha`** nem mexa na trava de assinatura concorrente.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `src/app/api/protocol/` não existe mais.
3. Nas quatro rotas, nenhuma coluna de `protocols` além de
   `prescription_pdf_path` é selecionada.
4. Nenhuma regra de negócio mudou — o diff é remoção de colunas e de arquivos.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor. Eu confiro rodando as consultas novas contra o RDS e refazendo a
medição das nove rotas — tem que cair para três.
