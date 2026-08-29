# Portal do paciente devolve 500 para quem está logado

## O erro

`Error: DATABASE_URL precisa estar definida.`, no log group `/ecs/sistema-portal`.

O caminho é este:

1. `src/middleware.ts:48` — `userId = await userIdDoToken(idToken)`
2. `src/lib/auth/sessao.ts:50` — `const sql = getSql()`, para traduzir
   `cognito_sub` em `users.id`
3. `src/lib/db/index.ts` — lança, porque `DATABASE_URL` não existe no portal

A task definition `sistema-portal:25` tem Cognito, `NUCLEO_URL` e o portão de
pré-lançamento, e **nenhum segredo de banco**. Isso é o desenho da Fase 5: o
portal não fala com o banco, ele pergunta ao núcleo por
`src/lib/contrato/nucleo.ts`. O middleware é o único pedaço que ficou de fora
desse desenho.

O ALB manda `/suplementos/dashboard*` para o portal, então todo acesso ao
dashboard passa por esse middleware e estoura.

## Por que ninguém tinha visto

Só quebra para quem tem token válido. Sem cookie, o portão de pré-lançamento
reescreve para `/em-breve` e a requisição nunca chega no trecho do banco. Com
token inválido, `verificarIdToken` lança, `userIdDoToken` devolve `null` antes de
chamar `getSql`, e o middleware redireciona para o login. Confirmado nos dois
casos: `307` para `/suplementos/login`, sem erro no log.

O Pedro entrou com a senha da equipe e uma sessão válida. É a única combinação
que chega no banco.

## O conserto

O middleware, quando roda no portal, tem que parar no JWT verificado e não
traduzir para `users.id`.

Ele não precisa desse id ali. O ALB só encaminha `/suplementos/dashboard*` para o
portal, então os ramos `isAdmin` e `isProfessional` do middleware — os únicos que
usam `getUserProfile` e o papel — nunca rodam nesse serviço. E cada página do
dashboard já chama `perguntarAoNucleo`, que bate em
`/api/contrato/paciente/*`, onde `requirePacienteSession` revalida a sessão e
resolve o dono no banco do lado do núcleo, devolvendo 401 quando não acha.

Não dê `DATABASE_URL` ao portal. Isso conserta o sintoma e desfaz a Fase 5.

### Como implementar

Em `src/lib/auth/sessao.ts`, separe a verificação do token da tradução para
`users.id`. Exporte algo como `subDoIdTokenVerificado(idToken)`, que só chama
`verificarIdToken` e devolve o `sub` — sem tocar em `getSql`. `userIdDoToken` e
`sessaoAtual` continuam como estão, para o núcleo.

Em `src/middleware.ts`, decida o modo por uma variável explícita, não pela
ausência de `DATABASE_URL` — falha silenciosa por variável faltando foi o que
produziu este bug. Sugestão: `MODO_PORTAL=1` no `environment` da task definition
do portal.

- Com `MODO_PORTAL`: autentique pelo `sub` verificado. Existe sessão → segue;
  não existe → redireciona para `/suplementos/login`. Pule os ramos de admin e
  profissional inteiros.
- Sem `MODO_PORTAL`: comportamento atual, sem mudança nenhuma.

O caminho de renovação de token (`renovar` + `gravarTokensRenovados`, linhas
50-63) também termina em `userIdDoToken`. Ele precisa do mesmo tratamento, senão
o 500 volta na hora em que o id token expira.

### Uma ponta a amarrar

Quem existir no Cognito sem linha em `users` passa a atravessar o middleware do
portal e recebe 401 do núcleo em toda página. Faça as páginas do dashboard
tratarem `perguntarAoNucleo` devolvendo `null` para `meu-perfil` como sessão
inválida, redirecionando para o login em vez de renderizar vazio.

## Depois

`MODO_PORTAL=1` entra numa revisão nova da task definition `sistema-portal`, e o
serviço precisa de `update-service --force-new-deployment`. O portal roda a mesma
imagem `sistema-suplemento:latest` do núcleo, então o build é um só, mas os dois
serviços têm que subir.

Teste: com a senha da equipe e uma sessão válida, `/suplementos/dashboard` tem que
responder 200 e o log group `/ecs/sistema-portal` tem que ficar limpo.
