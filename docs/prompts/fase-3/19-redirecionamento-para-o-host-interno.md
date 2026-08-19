# Prompt 19 — todo redirecionamento aponta para o host interno do container

> Referencie no Cursor com `@19-redirecionamento-para-o-host-interno.md`.
> Branch: `reestrutura-suplementos`.

Dois arquivos de código e um módulo novo. Defeito achado em produção em 19/08.

## O sintoma, medido

Clicar em **Sair** leva o navegador para:

```
http://ip-172-31-17-180.ec2.internal:3000/suplementos/login
```

Esse é o **hostname interno da tarefa ECS**. O navegador do cliente não alcança
esse endereço — a pessoa fica presa numa página que não carrega, ainda logada.

## A causa

`src/app/api/auth/signout/route.ts` monta o destino a partir da requisição:

```ts
return NextResponse.redirect(
  new URL('/suplementos/login', request.nextUrl.origin),
  303,
)
```

Atrás de CloudFront → ALB → container, `request.nextUrl.origin` é o host que
**chega no container**, não o host público que o visitante digitou. Por isso sai
`ip-172-31-17-180.ec2.internal:3000` em vez de `https://desafiodiabetes.com`.

**Não tente consertar isso mexendo em CloudFront ou ALB.** O código não deve
depender de qual host o proxy repassa.

## Correção 1 — módulo novo `src/lib/url-base.ts`

Hoje existe uma função `getAppBaseUrl()` **copiada em três arquivos**:

- `src/lib/inngest/functions/avulso-renewal-reminder.ts`
- `src/lib/inngest/functions/support-pending-reminder.ts`
- `src/lib/shipping/notify.ts`

As três são idênticas:

```ts
function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://desafiodiabetes.com'
}
```

Extraia para `src/lib/url-base.ts` como `export function getAppBaseUrl()`, e faça
os três arquivos importarem de lá. **Remova a linha do `VERCEL_URL`** — saímos da
Vercel; essa variável não existe mais e ficar lendo ela confunde quem lê depois.

## Correção 2 — `src/app/api/auth/signout/route.ts`

Use **caminho relativo**, não URL absoluta. `Location` relativo é válido e o
navegador resolve contra a URL que ele mesmo pediu — a pública. Não depende de
variável de ambiente nem de o proxy repassar cabeçalho nenhum:

```ts
return new NextResponse(null, {
  status: 303,
  headers: { Location: '/suplementos/login' },
})
```

### Confira se a sessão está mesmo sendo encerrada

Enquanto estiver nesse arquivo: `createClient()` grava os cookies no
`cookieStore` do `next/headers`, mas a rota devolve **um objeto de resposta
novo**. Verifique se os `Set-Cookie` de limpeza chegam ao navegador nesse
retorno. Se não chegarem, escreva a limpeza direto na resposta que é devolvida.

Isso importa: se o cookie não for limpo, "Sair" não sai — a pessoa continua
autenticada mesmo depois de ver a tela de login. Eu não consegui medir esse
ponto de fora (o portão de pré-lançamento bloqueia meu acesso), então **confira
e me diga o que encontrou** em vez de assumir que está certo.

## Correção 3 — `src/middleware.ts`, cinco redirecionamentos

Mesmo defeito, cinco vezes. Todos usam `request.nextUrl.clone()` e caem no
mesmo host interno:

| Linha ~ | Situação | Destino |
|---|---|---|
| 84 | rota protegida sem sessão | `/suplementos/login` |
| 93 | papel errado no admin | `/suplementos/dashboard` |
| 103 | papel errado no profissional | `/suplementos/dashboard` |
| 110 | já logado abrindo `/login` | `/suplementos/dashboard` |
| 37 | portão de pré-lançamento | (é `rewrite`, ver abaixo) |

Para os quatro `NextResponse.redirect(...)`, use `getAppBaseUrl()` como base:

```ts
const url = new URL('/suplementos/login', getAppBaseUrl())
return NextResponse.redirect(url)
```

Preserve a query string quando ela existir hoje — não mude comportamento, só a
origem da URL.

**A linha 37 é `rewrite`, não `redirect`.** `rewrite` é interno e não vira
`Location` no navegador, então **não tem esse problema. Não mexa nela.** Mudar o
portão para `redirect` quebraria o desenho: o conteúdo tem que ser servido na
URL original.

## O que NÃO fazer

- **Não mexa em CloudFront, ALB nem em política de origem.** A correção é no
  código.
- **Não rode SQL contra o banco**, não faça deploy, não mexa em task definition
  nem em Secrets Manager.
- **Não mude o portão de `rewrite` para `redirect`.**
- **Não mexa na trava de assinatura concorrente** nem crie `/nova-senha` —
  continuam fora de escopo.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `grep -rn "nextUrl.origin" src/` não devolve nada.
3. `grep -rn "function getAppBaseUrl" src/` devolve **um** resultado, em
   `src/lib/url-base.ts`.
4. `grep -rn "VERCEL_URL" src/` não devolve nada.
5. O `rewrite` do portão continua intacto no `middleware.ts`.
6. Você me diz o que descobriu sobre a limpeza do cookie na Correção 2.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor.
