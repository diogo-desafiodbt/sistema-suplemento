# Cognito — o pool que substitui o Supabase Auth

Criado em 23/08/2026, **vazio**. Nada em produção aponta para ele ainda.

```
pool     us-east-1_litd43Brz
cliente  32m4mbqlbhkotvf9n9kggk10fs
região   us-east-1
```

Identificadores e segredo no Secrets Manager: `sistema/COGNITO_USER_POOL_ID`,
`sistema/COGNITO_CLIENT_ID`, `sistema/COGNITO_CLIENT_SECRET`.

## As escolhas, e o porquê

**Login por e-mail**, não por nome de usuário — é o que o sistema já usa, e
username separado seria conceito novo para as pessoas.

**`ALLOW_USER_PASSWORD_AUTH` ligado.** É o que permite manter **a nossa tela de
login**: o servidor recebe e-mail e senha do formulário e conversa com o
Cognito. Sem isso, sobraria a tela pronta do Cognito, com redirecionamento e
outra cara.

**Cliente COM segredo.** O segredo fica no servidor e **nunca vai para o
navegador** — é o núcleo que fala com o Cognito, não o cliente. Cliente sem
segredo só faria sentido se o navegador chamasse direto.

**Token de acesso de 60 minutos, refresh de 30 dias.** O de acesso curto limita
o estrago de um token vazado; o refresh longo evita pedir senha toda semana.

**`PreventUserExistenceErrors` ligado.** Sem isso, a resposta de login diz se o
e-mail existe — e isso vira lista de clientes para quem testar endereços.

**Recuperação só por e-mail verificado.** SMS custa e exige telefone
confirmado, que a base não tem.

**Senha: mínimo 10, com letra minúscula e número.** Sem exigir maiúscula e
símbolo de propósito: regra complicada empurra a pessoa para o papelzinho na
mesa. Comprimento protege mais que variedade.

**Proteção contra exclusão LIGADA.** Apagar o pool apaga todo mundo, e não tem
volta. Para excluir, é preciso desligar isso primeiro — que é exatamente a
pausa que se quer nesse momento.

## Custo

**Zero.** O nível gratuito cobre 50.000 usuários ativos por mês. São 3.

## O que falta

O pool está vazio. As três contas — `diogo@`, `contato@`, `admin@` — são
criadas no passo 3, e cada pessoa define a senha na primeira entrada. Senha não
migra do Supabase: ela é guardada como hash, e ninguém consegue lê-la de volta.
