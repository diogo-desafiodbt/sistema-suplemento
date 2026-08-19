# Prompt 20 — o perfil nasce na Supabase e o RDS nunca fica sabendo

> Referencie no Cursor com `@20-o-perfil-nasce-na-supabase.md`.
> Branch: `reestrutura-suplementos`.

Um módulo novo e dois arquivos. **Este é o defeito que impede qualquer cliente
novo de comprar.** Achado em 19/08, no primeiro teste de checkout de ponta a
ponta.

## O que acontece hoje

Clicar em "finalizar a compra" devolve **"Perfil não encontrado"**.

Nenhum lugar do código insere em `users`. Quem cria o perfil é um gatilho no
Postgres — `handle_new_user`, disparado por `auth.users`. Esse gatilho vive na
**Supabase**, e continua escrevendo na Supabase. A aplicação, desde o corte de
16/08, lê do **RDS**.

```
supabase.auth.signUp()  →  Supabase auth.users
                                  ↓ gatilho handle_new_user
                           Supabase public.users     ← a linha nasce aqui
                                  ✗  nada atravessa
                           RDS users                 ← o checkout procura aqui
```

Medido agora: **Supabase tem 20 usuários** (o mais recente de hoje), **o RDS tem
19** e não recebe uma linha nova desde 15/08. Exatamente o cadastro do teste
divergiu.

Não é caso de borda. É **todo cliente que se cadastrar a partir do corte**.

## O que NÃO fazer

**Não mexa no gatilho da Supabase e não tente fazer os dois bancos conversarem.**
O destino é a Supabase sair por completo. A criação do perfil tem que passar a
ser código nosso, escrevendo no RDS — é assim que precisa ficar quando o Auth
for para o Cognito.

## Correção 1 — módulo novo `src/lib/auth/garantir-perfil.ts`

```ts
export async function garantirPerfil(params: {
  id: string
  email: string
  fullName: string | null
}): Promise<void>
```

Regras que a implementação precisa respeitar:

**Idempotente.** Use `ON CONFLICT (id) DO NOTHING`. A função vai ser chamada em
mais de um caminho e pode correr em paralelo; chamar duas vezes não pode
quebrar nem duplicar.

**Não escreva a coluna `role`.** Ela tem `DEFAULT 'patient'` no banco. Omitir a
coluna é o que garante que ninguém nasça admin — e o `GRANT` vai ser ajustado
para que `app_web` sequer consiga escrever nela. **Não passe `'patient'`
explicitamente**; deixe o default agir.

**`client_code` vem da sequence, não de `COUNT(*)`.** Use
`nextval('public.client_code_seq')`:

```sql
'DD-' || lpad(nextval('public.client_code_seq')::text, 6, '0')
```

Conferi: a sequence **existe no RDS**, em `last_value = 22`, e o maior código
emitido é `DD-000022`. Está posicionada certo — não precisa reposicionar.

Isso não é detalhe: a versão original usava `COUNT(*)+1` e travava todo cadastro
seguinte com violação de chave única assim que alguém apagasse uma linha. Já foi
corrigido uma vez na Supabase (migração `20260808080000`). Não reintroduza.

**`created_at` e `updated_at` têm default `now()`** — pode omitir.

## Correção 2 — `src/app/api/checkout/create/route.ts`

Por volta da linha 748 existe:

```ts
const profileRows = await sql`SELECT full_name, email, client_code FROM users WHERE id = ...`
const profile = profileRows[0]
if (!profile) {
  return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
}
```

Chame `garantirPerfil(...)` **antes** dessa consulta, com os dados da sessão
(`user.id`, `user.email`, e o nome que vier de `user.user_metadata.full_name`).

**Mantenha o 404 como está** para o caso de, mesmo depois de garantir, a linha
não aparecer. Isso deixaria de ser "cliente novo" e passaria a ser defeito de
verdade — o erro tem que continuar existindo para ser visto.

## Correção 3 — `src/app/api/auth/login-event/route.ts`

Mesmo problema, mais silencioso. Essa rota insere em `user_login_history`, que
tem chave estrangeira para `users`. Sem perfil, o `INSERT` viola a chave, cai no
`catch` e a rota **devolve `{ ok: true }` mesmo tendo falhado**.

Consequência em cadeia: o login não é registrado, o `rfm_recalc_queued_at` não é
marcado, e o recálculo de RFM nunca vê esse usuário.

Chame `garantirPerfil(...)` no começo, antes do `INSERT` no histórico.

Enquanto estiver nesse arquivo: o `catch` engolir tudo e responder `ok: true`
esconde falha real. **Não mude o código de resposta** (não vale quebrar o login
por causa de telemetria), mas garanta que o `console.error` registre o suficiente
para eu achar no CloudWatch.

## O que NÃO fazer

- **Não rode SQL contra o banco** e **não mexa em `db/clinico/grants.sql`.** O
  ajuste de privilégio (tirar `INSERT` na coluna `role` de `app_web`) é meu, e
  eu aplico separado.
- **Não faça deploy**, não mexa em task definition nem em Secrets Manager.
- **Não escreva o perfil pelo lado do cliente.** `checkout/page.tsx` chama
  `signUp()` no navegador; a criação do perfil tem que ser servidor.
- **Não crie `/nova-senha`** nem mexa na trava de assinatura concorrente.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `garantirPerfil` existe em `src/lib/auth/garantir-perfil.ts` e é chamada em
   `checkout/create` e em `login-event`.
3. A palavra `role` **não aparece** no `INSERT` de `garantirPerfil`.
4. `grep -rn "COUNT(\*)" src/lib/auth/` não devolve nada — o código vem da
   sequence.
5. O 404 "Perfil não encontrado" continua existindo como rede de segurança.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor. Eu ainda preciso preencher à mão a linha do usuário que já ficou
órfão no teste de hoje.
