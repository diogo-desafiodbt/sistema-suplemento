# Conta do Cognito sem vínculo em `users` deixa a pessoa presa no login

## O sintoma

Quem tem conta no Cognito mas cuja linha em `users` está com `cognito_sub` nulo
não entra. Digita a senha certa, o Cognito devolve os tokens, e o sistema manda
de volta para o login — sem erro, como se a senha estivesse errada.

Aconteceu em 26/08/2026 com `suporte@desafiodiabetes.com`, criada direto no
console da AWS. Corrigi essa linha à mão no banco. O que está descrito abaixo é
para não acontecer de novo.

## Por que o vínculo nunca se conserta sozinho

`garantirPerfilCognito` em `src/lib/auth/garantir-perfil.ts` é a única função que
preenche `cognito_sub`, adotando pelo e-mail a linha que ainda não tem código de
login. Ela roda **só** em `/api/auth/cadastrar`.

O login usa `/api/auth/login-event`, que começa com `sessaoAtual()` — e
`sessaoAtual()` procura o usuário justamente por `cognito_sub`. Não achando,
devolve 401 e a rota nunca chega a vincular nada.

O círculo se fecha: quem não tem vínculo não consegue ganhar vínculo, porque a
rota que preencheria desiste antes.

## A armadilha que decide onde o conserto pode morar

`/api/auth*` é servida pelo **sistema-entrada**, que conecta como `app_entrada`.
E `app_entrada` não tem permissão de escrever a coluna `cognito_sub` — só
`app_web` tem. É um grant por coluna, deliberado: quem decide identidade é o
núcleo.

Confirmado no banco em 26/08:

```
app_entrada UPDATE: birth_date, client_code, cpf, created_at, email,
                    full_name, id, phone, rfm_recalc_queued_at, updated_at
app_web     UPDATE: birth_date, client_code, cognito_sub, created_at,
                    full_name, id, phone, rfm_recalc_queued_at, updated_at
```

Então **não adianta chamar `garantirPerfilCognito` de dentro de
`/api/auth/entrar` ou de `/api/auth/login-event`**. Vai falhar com
`permission denied for table users`, do mesmo jeito que o aviso de rastreio
falhou. Cuidado ao testar: `has_table_privilege` devolve falso para grant por
coluna e engana; quem conta a verdade é `information_schema.column_privileges`.

## O que fazer

Mover o vínculo para o núcleo, atrás de uma rota de contrato — mesmo padrão que
o portal já usa. `/api/contrato*` não tem regra no ALB e cai no serviço padrão,
que é o núcleo, como `app_web`.

### 1. Nova rota `src/app/api/contrato/auth/vincular/route.ts`

POST, sem corpo. Ela lê o cookie `dd_id`, chama `verificarIdToken` e tira do
payload verificado o `sub`, o `email` e o `email_verified`. Nada vem do request:
o token é a única fonte.

- Token ausente ou inválido → 401.
- `email_verified` diferente de `true` → 401. Sem isso, quem criasse uma conta
  Cognito com o e-mail de um cliente existente adotaria a linha desse cliente.
- Caso contrário, chama `garantirPerfilCognito({ cognitoSub, email, fullName:
  null })` e devolve `{ ok: true }`.

`garantirPerfilCognito` já tem a regra certa e não precisa mudar: só adota linha
com `cognito_sub IS NULL`, e se a linha já tiver outro código de login, são duas
contas disputando o mesmo e-mail — caso de gente, não de código.

### 2. Chamar depois do login

Em `src/app/api/auth/entrar/route.ts`, depois de `gravarTokens`, faça uma chamada
ao núcleo repassando o cookie recém-gravado, no mesmo formato de
`src/lib/contrato/nucleo.ts` (base em `NUCLEO_URL`, `cache: 'no-store'`).

Precisa ser **síncrono**, antes de responder ao navegador: se o vínculo chegar
depois, a pessoa alcança o dashboard sem vínculo e leva o loop de login uma vez.

Falha do vínculo não pode derrubar o login de quem já tem vínculo — que é a
maioria. Registre no log e deixe o login seguir.

### 3. Mesma chamada no cadastro

Em `src/app/api/auth/cadastrar/route.ts`, troque a chamada direta a
`garantirPerfilCognito` pela mesma rota de contrato. Hoje ela roda como
`app_entrada` e falharia com `permission denied` na coluna `cognito_sub`.

Esse defeito está escondido atrás de outro: o cadastro nem chega lá, porque o
task role `ecsTaskRoleSistema` não tem permissão IAM para
`cognito-idp:AdminCreateUser`. Testado em produção em 26/08 — devolve 500 com
`AccessDeniedException`.

**A ordem importa.** Hoje o cadastro falha limpo, sem deixar rastro. Se a
permissão IAM for concedida antes deste conserto, ele passa a criar a conta no
Cognito e falhar no vínculo logo depois — e a pessoa fica com conta criada, sem
acesso, e sem conseguir cadastrar de novo porque o e-mail já existe. Exatamente o
estado em que o `suporte@` estava. Este conserto entra primeiro, ou junto.

Eu concedo a permissão IAM (`AdminCreateUser`, `AdminGetUser`,
`AdminSetUserPassword`, no ARN do pool) quando este trabalho estiver pronto para
subir. Não mexa em IAM.

## Como saber que funcionou

Crie uma conta no console do Cognito com um e-mail que já exista em `users` com
`cognito_sub` nulo, e faça login pelo site. A linha tem que ganhar o
`cognito_sub` e a pessoa tem que chegar ao painel — sem passar pelo cadastro.
