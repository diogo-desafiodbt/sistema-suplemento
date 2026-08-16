# Prompt 14 — Fase 3: o resto, e a faxina

> Referencie no Cursor com `@14-resto-e-faxina.md`.
> Branch: `reestrutura-suplementos`.

Trinta e nove arquivos, 78 operações. **É o último bloco da conversão.** Quando
ele fechar, o único `supabase-js` tocando tabela no sistema serão os três
arquivos de sincronismo de conteúdo — e aí o corte para o RDS fica possível.

A maior parte é mecânica: `select`, `insert`, `update` sem junção e sem
transação. Mas tem **uma armadilha de runtime** que vale o bloco inteiro, então
comece por ela.

## Parte 1 — o `middleware.ts` não roda `postgres.js` como está

O middleware consulta `users.role` (linha 88) para barrar quem não é admin ou
profissional. Ele roda no **runtime Edge**, que é o padrão do Next quando nada é
declarado — e Edge **não tem socket TCP**. O `postgres.js` precisa de TCP.
Trocar por `getSql()` sem mais nada quebra em execução, não em build.

Duas saídas, e eu quero a primeira:

**1. Declare o runtime Node no middleware** e converta normalmente:

```ts
export const runtime = 'nodejs'
```

O projeto está no Next 16.2.6, onde isso é suportado. O custo por requisição não
muda: a consulta já acontece hoje, só que por HTTP em vez de TCP.

**2. Se por algum motivo o Node runtime não funcionar aqui**, pare e me diga —
**não deixe o middleware no `supabase-js` sem avisar.** Depois do corte ele
estaria lendo o `users` de um banco congelado, enquanto as páginas leem do RDS.
Não vira buraco de segurança, porque cada página confere o papel de novo por
conta própria, mas vira uma incoerência silenciosa: a pessoa passa pelo
middleware e é barrada pela página, sem explicação na tela.

## Parte 2 — onze cópias da mesma pergunta viram uma função

Estes onze arquivos fazem, cada um, a mesma consulta — `select role from users
where id = ?` — e decidem redirecionamento a partir dela:

```
middleware.ts
api/prescricao/assinar/route.ts
(admin)/admin/auditoria/page.tsx
(admin)/admin/clientes/[id]/page.tsx
(admin)/admin/clientes/page.tsx
(admin)/admin/pedidos/page.tsx
(admin)/admin/usuarios/page.tsx
(patient)/dashboard/page.tsx
(professional)/profissional/assinados/page.tsx
(professional)/profissional/fila/page.tsx
(professional)/profissional/protocolo/[id]/page.tsx
```

Já existe o lugar certo para isso: `src/lib/supabase/profile.ts`, com
`getUserProfile`. **Converta essa função para `getSql()` e faça os onze
passarem a usá-la.**

Duas coisas ao mexer nela:

- **O fallback do erro `42501` sai.** Ele existe porque, sob RLS, o papel
  `authenticated` podia não ter `SELECT` em `users`, e o código caía para a
  credencial de admin. Com RLS fora e `app_web` com grant explícito, esse
  caminho não pode mais acontecer — e um fallback que silenciosamente escala
  privilégio é a última coisa que se quer manter num arquivo de autorização.
- **O arquivo deveria mudar de lugar.** `src/lib/supabase/profile.ts` deixa de
  falar com a Supabase; mover para `src/lib/auth/profile.ts` evita que alguém
  em janeiro conclua que a autorização ainda passa por lá. Se o `git mv` sujar
  muito o diff, deixe onde está e me diga — eu faço em commit separado.

Não mude a regra de nenhuma tela. Quem redireciona para onde continua igual;
muda só de onde vem a resposta.

## Parte 3 — as outras quatro famílias

### Bibliotecas (8 arquivos, 21 operações)

`shipping/notify.ts` (5), `support/mailer.ts` (4), `support/facts.ts` (3),
`support/identify.ts` (3), `pdf/verificar-integridade.ts` (2),
`supabase/profile.ts` (2), `shipping/package.ts` (1),
`shipping/sender-region.ts` (1).

`notify.ts` usa claim — segue a regra de sempre: claim fora de transação.
`verificar-integridade.ts` **também usa Storage**; a parte de Storage fica no
`supabase-js`, só a consulta de tabela converte.

### Rotas de API (14 arquivos, 33 operações)

Conversão direta. Duas com atenção:

- `api/protocol/[id]/remove-item/route.ts` (5 operações) — é paciente mexendo no
  próprio protocolo. O filtro por dono **fica na consulta**, não em `if` depois
  de carregar.
- `api/entitlements/route.ts` e `api/assinatura/cancelar/route.ts` — mesma
  coisa, dado do próprio usuário.

### Páginas (6 arquivos, 13 operações)

`admin/suporte`, `admin/config`, `admin/cupons`, `admin/page`,
`dashboard/assinatura`, `dashboard/perfil`. As duas de `dashboard` são de
paciente: `user_id` na consulta.

### Conteúdo (3 arquivos) — **não toque**

`youtube-analytics-sync.ts`, `omie-financeiro-sync.ts`,
`hotmart-sales-sync.ts` ficam exatamente como estão, pelo motivo do bloco 6:
as tabelas deles não existem no banco clínico.

## Parte 4 — a faxina

Com a conversão terminada, sobrou entulho do caminho.

**Os parâmetros `_admin`.** `claimOnce`, `releaseClaim`,
`markClaimCompleted`, `claimByFlag` e `ensureProtocolAfterPayment` recebem um
cliente Supabase que **não usam** — já estão marcados com underscore. Mantê-los
foi certo no meio da conversão, para não mexer em seis chamadores de uma vez;
agora é dívida. Remova o parâmetro dessas funções e ajuste os chamadores.

O efeito prático: alguns arquivos deixam de chamar `createAdminClient()` só
para passar adiante um objeto que ninguém lê. Enquanto essas chamadas existirem,
não dá para responder "o sistema ainda fala com a Supabase?" olhando o código.

**Não remova `src/lib/supabase/admin.ts`** — Storage e os três de conteúdo ainda
dependem dele.

## O que preservar

- Toda restrição por usuário ou papel **fica no SQL**.
- `maybeSingle()` → `null`; `single()` → erro.
- Dinheiro por `asNumber`.
- Auth (`auth.getUser`, cookie de sessão) e Storage seguem no `supabase-js`.
- Não altere esquema. Não crie migração.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Se o `runtime = 'nodejs'` no middleware funcionou, e se o build reclamou de
   alguma coisa por causa dele.
2. Quantos `createAdminClient()` sobraram no repositório e em quais arquivos —
   quero conferir que só restam Storage e os três de conteúdo.
3. Se algum dos onze não coube em `getUserProfile` e por quê.

## Como será verificado

1. **O número que fecha a fase:** os únicos arquivos com `.from('` do
   `supabase-js` devem ser os **três** de conteúdo. Vou contar.
2. Nenhuma tabela de conteúdo em consulta por `getSql()`.
3. Nenhuma chamada externa dentro de transação.
4. `getUserProfile` não tem mais o fallback de `42501`, e nenhum caminho de
   autorização escala privilégio em caso de erro.
5. As telas de paciente continuam devolvendo 0 linhas para dado de outro
   paciente — vou testar `remove-item` e `dashboard/perfil` com id alheio.
