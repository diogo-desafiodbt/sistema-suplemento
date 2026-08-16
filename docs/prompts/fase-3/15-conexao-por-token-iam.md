# Prompt 15 — Fase 3: conectar no RDS por token IAM

> Referencie no Cursor com `@15-conexao-por-token-iam.md`.
> Branch: `reestrutura-suplementos`.

Um arquivo: `src/lib/db/index.ts`. É a última mudança de código antes do corte.

## Por que a senha não pode ser fixa

Os papéis do RDS (`app_web`, `job_interno`) têm `rds_iam`. Isso significa que
**não existe senha**: a aplicação pede à AWS um token de autenticação, válido
por **15 minutos**, e usa esse token no lugar da senha.

Já testei a cadeia inteira dentro de uma tarefa ECS, com o papel novo
`ecsTaskRoleSistema`:

```
identidade da tarefa: arn:aws:sts::768102455037:assumed-role/ecsTaskRoleSistema/...
app_web      -> app_web OK
job_interno  -> job_interno OK
```

E os privilégios, conectado como `app_web` de verdade:

| | |
|---|---|
| ler protocolos e quiz_responses | ok |
| inserir no log de auditoria | ok |
| mudar nome de usuário | ok |
| **promover alguém a admin** | permission denied |
| **reescrever ou apagar a auditoria** | permission denied |
| **apagar usuário** | permission denied |
| **abrir o banco `conteudo`** | permission denied |

Ou seja: o banco e a permissão já estão prontos. Falta só o código saber pedir
o token.

## O que fazer

Em `createSql()`, a opção `password` do `postgres.js` aceita **função**, inclusive
assíncrona — está no tipo: `password?: string | (() => string | Promise<string>)`.
É por aí.

Use `@aws-sdk/rds-signer` (adicione a dependência). O gerador de token é o
`Signer`, com `hostname`, `port`, `username` e `region`.

### Precisa funcionar dos dois jeitos

Não troque um pelo outro — o desenvolvimento continua apontando para a Supabase,
que usa senha comum, e é assim que a gente compara resultado enquanto o corte
não acontece.

**A regra:** se a `DATABASE_URL` já traz senha, use a senha. Se não traz, gere o
token IAM. Isso deixa a mesma imagem servir para os dois ambientes sem variável
extra e sem `if (production)`, que é o tipo de condicional que mente.

### Cache do token

O `postgres.js` chama a função de senha **a cada conexão nova**. O pool abre até
10, e reabre quando alguma cai — assinar SigV4 toda vez é desperdício.

Guarde o token em memória com validade de **13 minutos** (não 15: margem para o
relógio e para a conexão em curso). Se expirou, gere outro. Uma variável no
módulo basta; não precisa de biblioteca de cache.

**Não guarde o token em log, nem em mensagem de erro.** Ele é credencial válida
por 15 minutos e tem 1.564 caracteres — se cair em log, vaza inteiro.

### O usuário vem da URL

`app_web` e `job_interno` são usuários diferentes, e o token é assinado **por
usuário**. Tire o nome de usuário da própria `DATABASE_URL` em vez de fixar no
código: assim a mesma função serve para os dois, e trocar de papel é trocar a
variável.

## O que preservar

- `ssl: 'require'` continua. IAM sem TLS não conecta.
- O pool continua sendo um só, reaproveitado entre requisições
  (`globalForDb`) — isso não muda.
- `withTransaction` e `asNumber` ficam como estão.
- Se `DATABASE_URL` faltar, o erro continua claro.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

E me diga:

1. Se o build passou com o `@aws-sdk/rds-signer` — ele é pesado e o CodeBuild
   monta a imagem ARM, então quero saber se o tamanho mudou muito.
2. Como ficou a decisão "tem senha na URL ou não" — quero ler o trecho.
3. Se sobrou algum caminho em que o token possa aparecer em log.

## Como será verificado

Não dá para verificar isto contra a Supabase — lá a conexão é por senha. A
verificação é no RDS, e eu faço subindo a aplicação com o papel novo:

1. A aplicação conecta como `app_web` e responde.
2. Uma tela de paciente carrega dado do paciente certo.
3. Uma tentativa de promover papel continua sendo recusada pelo banco.
4. O token não aparece em nenhum log da tarefa.
5. Depois de 15 minutos parada, a aplicação ainda conecta — é o teste que prova
   que o cache renova em vez de cristalizar o primeiro token.
