# Prompt — Fase 8, passo 2: o motor troca

> Referencie no Cursor com `@02-o-motor-troca.md`.
> Branch: `reestrutura-suplementos`.
> Depende do passo 1, que já está no ar.

A autenticação sai do Supabase e vai para o Cognito. É o único passo desta fase
que **não dá para partir ao meio**: enquanto os quatro fluxos não falarem o
mesmo idioma, ninguém entra.

**A sua tela de login continua a sua.** O servidor conversa com o Cognito por
baixo — sem a tela pronta deles, sem redirecionamento estranho.

## O que já existe (não crie)

```
pool     us-east-1_litd43Brz
cliente  32m4mbqlbhkotvf9n9kggk10fs   (com segredo)
```

Lidos do ambiente: `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
`COGNITO_CLIENT_SECRET`. **Falhe alto se faltar qualquer um.**

A coluna **`users.cognito_sub`** já existe no banco, única, aceitando nulo.

## A decisão que sustenta o resto: o id não muda

O Cognito emite um identificador próprio (`sub`), diferente do que o Supabase
emitia. **`users.id` continua sendo a identidade do sistema** — é ela que está
em `orders`, `subscriptions`, `protocols` e mais uma dúzia de tabelas.

Então:

```
Cognito diz: "é o sub X"
   ↓
users.cognito_sub = X  →  users.id
   ↓
sessaoAtual() devolve users.id
```

`sessaoAtual()` continua devolvendo **o mesmo tipo de valor de sempre**. Nenhum
dos 31 lugares do passo 1 muda. Era exatamente para isso que a porta existia.

**Nunca devolva o `sub` como `userId`.** Se fizer, o sistema passa a procurar
pedidos de um usuário que não existe — e não dá erro, só devolve vazio.

## Parte 1 — a conversa com o Cognito

`src/lib/auth/cognito.ts`, usando `@aws-sdk/client-cognito-identity-provider`.

Funções, e só estas:

```ts
entrar(email, senha)        → { idToken, accessToken, refreshToken } | null
renovar(refreshToken, sub)  → { idToken, accessToken } | null
criarUsuario(email, senha)  → sub
esqueciSenha(email)         → void
confirmarNovaSenha(email, codigo, senha) → void
sair(accessToken)           → void
```

**O `SECRET_HASH` é obrigatório** em todas as chamadas que envolvem usuário,
porque o cliente tem segredo. É
`base64(hmacSHA256(username + clientId, clientSecret))`. Sem ele, o Cognito
responde com erro que não diz o que falta — vai custar meia hora se esquecer.

Em `renovar`, o `username` do hash é o **`sub`**, não o e-mail.

## Parte 2 — verificar o token sem perguntar a ninguém

`sessaoAtual()` passa a:

1. Ler o cookie do token de identidade.
2. **Verificar a assinatura** contra as chaves públicas do pool
   (`https://cognito-idp.us-east-1.amazonaws.com/<pool>/.well-known/jwks.json`).
   Busque **uma vez** e guarde em memória — não a cada requisição.
3. Conferir `exp`, `aud` (o cliente) e `iss` (o pool).
4. Trocar o `sub` pelo `users.id`, pela coluna `cognito_sub`.

**Verificar de verdade, não só decodificar.** Token é texto que o navegador
manda; sem checar a assinatura, qualquer pessoa escreve o próprio.

Use `aws-jwt-verify`, que é da AWS e faz exatamente isso.

Se o token estiver expirado, `sessaoAtual()` devolve `null` — quem renova é o
middleware.

## Parte 3 — os cookies e a renovação

Três cookies, todos **`httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`**:

```
dd_id       token de identidade    60 min
dd_access   token de acesso        60 min
dd_refresh  token de renovação     30 dias
```

**Nenhum token vai para o JavaScript da página.** `httpOnly` não é detalhe: sem
ele, qualquer script injetado leva a sessão.

O `middleware.ts` perde toda a dança do `@supabase/ssr` e passa a fazer uma
coisa só: se o token de identidade expirou **e** existe o de renovação, chama
`renovar` e regrava os cookies. Se a renovação falhar, apaga os três.

O carimbo `sessao_satelite` continua exatamente como está — os satélites não
mudam nem ficam sabendo.

## Parte 4 — os quatro fluxos

### Entrar

A tela continua igual. O que muda é para onde ela manda: rota nova
`POST /api/auth/entrar`, com e-mail e senha.

A rota chama `entrar()`, grava os três cookies e devolve `{ ok: true }`.
Credencial errada → **401 com a mesma mensagem de hoje**, "Email ou senha
incorretos". **Nunca diga se o e-mail existe** — isso vira lista de clientes
para quem testar endereços.

O resto do fluxo da tela (`login-event`, `profile`, o redirecionamento por
papel) fica como está.

### Sair

`/api/auth/signout` apaga os três cookies e chama `sair()`. Se essa chamada
falhar, **apague os cookies mesmo assim** — o navegador sair é mais importante
que o servidor confirmar.

### Cadastrar (checkout)

Hoje é `supabase.auth.signUp` no navegador. Passa a ser rota nova
`POST /api/auth/cadastrar`, no servidor, que:

1. cria o usuário no Cognito com senha **já definitiva** (`AdminCreateUser` com
   `MessageAction: 'SUPPRESS'` + `AdminSetUserPassword` com `Permanent: true`);
2. chama `garantirPerfil` com o `sub`;
3. entra imediatamente e grava os cookies.

**Sem e-mail de confirmação.** Confirmar caixa no meio do checkout perde venda,
e o comportamento de hoje já é esse.

Se o e-mail já existir, responda como hoje responde — não invente fluxo novo.

### Recuperar senha — e a página que nunca existiu

A tela `/suplementos/recuperar-senha` passa a chamar
`POST /api/auth/esqueci-senha`, que chama `esqueciSenha()`. **Responda sempre
igual**, exista o e-mail ou não.

O Cognito manda um **código** por e-mail, não um link. Então crie
**`/suplementos/nova-senha`**: campos de e-mail, código e senha nova, chamando
`POST /api/auth/nova-senha`.

> Essa página está referenciada desde sempre e **nunca foi criada**. Quem
> esquece a senha hoje recebe o e-mail, clica e cai em lugar nenhum. Este passo
> conserta isso de tabela.

Regra da senha: **mínimo 10 caracteres, com letra e número**. Diga isso na
tela, antes de a pessoa errar.

## Parte 5 — a limpeza

Apague `src/lib/supabase/` e o que sobrou de import. Tire as variáveis
`NEXT_PUBLIC_SUPABASE_*` e `SUPABASE_SERVICE_ROLE_KEY` do código (**não mexa no
Secrets Manager nem em task definition — meu**).

`@supabase/supabase-js` e `@supabase/ssr` saem do `package.json`.

## O que NÃO fazer

- **Não mexa nos satélites.** Eles verificam o carimbo do núcleo, não o
  Supabase. Atravessam esta fase sem uma linha.
- **Não crie usuário no Cognito por script.** As três contas são minhas, no
  passo 3.
- **Não use a tela pronta do Cognito** nem `Hosted UI`.
- **Não guarde token em `localStorage`** nem passe para o cliente.
- **Não mude `users.id`** de ninguém.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `grep -rn "supabase" src/` volta **vazio**.
3. `grep -rn "@supabase" package.json` volta vazio.
4. `sessaoAtual()` devolve `users.id`, nunca o `sub` — dá para ver pela consulta
   em `cognito_sub`.
5. A verificação do token confere **assinatura**, não só decodifica.
6. `/suplementos/nova-senha` existe.
7. Login com senha errada devolve 401 com a mensagem de hoje, e **não** revela
   se o e-mail existe.
8. Os satélites não foram tocados.

Quando terminar, me chame antes de mexer em outra coisa. Eu crio as três contas
no Cognito, ligo os segredos nos serviços, subo — e a gente testa entrar,
navegar e recuperar senha antes de considerar a Supabase fora.
