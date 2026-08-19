# Prompt 23 — todo deploy matava a camada assíncrona

> Referencie no Cursor com `@23-todo-deploy-matava-o-inngest.md`.
> Branch: `reestrutura-suplementos`.

Um arquivo de código e uma linha no script de deploy. **Causa raiz do incidente
de 19/08.**

## O que estava acontecendo

Depois de cada deploy, o app se registrava no Inngest com o **hostname interno
do contêiner** — `ip-172-31-12-79.ec2.internal:3000`. O Inngest guardava esse
endereço, tentava chamar de volta, e não alcançava nada.

**Resultado: todos os 13 jobs paravam. Sem erro, sem log, sem sinal.**

Medido hoje: o contêiner reiniciou às 14:45; o cron de 5 minutos não disparou
às 14:50; `curl -X PUT https://desafiodiabetes.com/api/inngest` devolveu
**`"modified": true`** — provando que o registro estava errado e acabara de ser
corrigido. O hostname muda a cada deploy (era `ip-172-31-87-17` antes).

Foi assim que e-mail, pedido para a farmácia, etiqueta, lembrete e sincronismos
ficaram parados **de 16/08 a 19/08**: houve deploy, ninguém re-sincronizou.

É a mesma família do defeito do botão "Sair", corrigido no prompt 19: o app
deduzindo a própria URL a partir da requisição e acertando o endereço errado
atrás de CloudFront e ALB.

## Correção 1 — `serveOrigin` em `src/app/api/inngest/route.ts`

O SDK tem opção para isso, e a documentação dele descreve exatamente o nosso
caso:

> *"By default, the library will try to infer this using request details such as
> the Host header... but sometimes this isn't possible (e.g. when dealing with
> **proxies/redirects**). Provide the custom origin here to ensure that the path
> is reported correctly when registering functions with Inngest."*

```ts
export const { GET, POST, PUT } = serve({
  client: inngest,
  serveOrigin: getAppBaseUrl(),
  functions: [ ... ],
})
```

Use **`getAppBaseUrl()`** de `@/lib/url-base` — o helper que o prompt 19 criou
justamente para isso. Não escreva a URL na mão e não leia `NEXT_PUBLIC_APP_URL`
direto: o helper já trata a barra final e tem o fallback.

Confira o nome exato da opção no tipo do SDK antes de escrever (é
`serveOrigin`, mas confirme a grafia em `node_modules/inngest`). Se o TypeScript
reclamar, **não force com `as any`** — me avise, porque aí a opção tem outro
nome nesta versão.

## Correção 2 — `scripts/deploy.sh` re-sincroniza no fim

Cinto e suspensório. Mesmo com `serveOrigin`, o registro só é atualizado quando
alguém provoca a sincronização. Acrescente ao fim do `deploy.sh`, **depois** do
`update-service`:

```bash
echo "→ re-sincronizando o Inngest"
# Sem isto, o Inngest continua com o registro anterior até alguém provocar.
# Foi o que deixou os 13 jobs parados de 16/08 a 19/08.
curl -sS -X PUT https://desafiodiabetes.com/api/inngest || \
  echo "   AVISO: a re-sincronização falhou — rode à mão antes de confiar nos jobs"
```

**O deploy não pode falhar se isso falhar** — o `||` cuida disso. Mas o aviso
tem que aparecer, porque jobs parados em silêncio é exatamente o que estamos
consertando.

Atenção ao momento: o `update-service` só *dispara* o deploy; o contêiner novo
leva um tempo para atender. Chamar o `PUT` imediatamente pode acertar o
contêiner antigo. Espere o serviço estabilizar antes — o `deploy.sh` já usa
`aws ecs update-service`; acrescente um `aws ecs wait services-stable` antes do
`curl`, ou um atraso explícito se preferir mais simples.

## O que NÃO fazer

- **Não faça deploy** — eu faço e confiro.
- **Não mexa nas 13 funções**, nem em `db/vigia/`, nem em task definition,
  Secrets Manager, EventBridge ou CloudWatch.
- **Não troque a URL por variável nova.** `NEXT_PUBLIC_APP_URL` já existe e o
  `getAppBaseUrl()` já a lê.
- **Não crie `/nova-senha`** nem mexa na trava de assinatura concorrente.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `serveOrigin` aparece em `src/app/api/inngest/route.ts`, vindo de
   `getAppBaseUrl()`.
3. `deploy.sh` termina com a re-sincronização, sem poder derrubar o deploy, e
   depois de esperar o serviço estabilizar.
4. Nenhuma URL escrita na mão em nenhum dos dois arquivos.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor. A prova é um deploy novo seguido de `curl -X PUT` devolvendo
**`"modified": false`** — hoje devolve `true`.
