# Prompt — Fase 6, satélite 1: a tela de alertas

> Referencie no Cursor com `@01-alertas-primeiro-satelite.md`.
> Branch: `reestrutura-suplementos`.
> Reescrito em 22/08/2026. A versão anterior punha a tela no núcleo — o que
> contraria a regra de zonas. O conteúdo da tela continua igual; o que mudou é
> **onde ela mora e com que credencial lê**.

O primeiro satélite. Uma tela que lê **uma tabela** e não escreve nada — de
propósito: se o padrão estiver errado, erramos onde não machuca ninguém.

## O desenho

```
navegador → ALB → Lambda "satelite-alertas" → RDS (só a tabela alertas)
```

**Não é contêiner.** Contêiner ligado 24h para uma tela olhada uma vez por dia
é ociosidade paga. Lambda cobra por execução; nesta escala, é centavos.

**Não usa `app_web`.** Um papel novo, `satelite_alertas`, com `SELECT` em
`alertas` e **em mais nada**. Nem `users`, nem `payments`, nem prontuário. Se o
satélite for comprometido, o que vaza é a lista de alertas.

**Sem senha.** Entra por token IAM, como o núcleo. A Lambda não guarda
credencial de banco.

A infraestrutura — papel no banco, função, regra do ALB — **é minha**. Este
prompt cobre o código.

## Parte 1 — o núcleo passa a carimbar quem é admin

Aqui está o problema a resolver: a Lambda precisa saber quem entrou, e **não
alcança a internet** (está na VPC, sem NAT). Não pode perguntar ao Supabase nem
ao núcleo.

Então o núcleo, que já sabe, **carimba**.

Crie `src/lib/sessao-satelite.ts`:

```ts
export function assinarSessaoSatelite(userId: string, role: string): string
export function verificarSessaoSatelite(cookie: string): { sub: string; role: string } | null
```

- Formato: `base64url(payload).base64url(hmacSHA256(payload, segredo))`
- Payload: `{ sub, role, exp }`, com **exp de 30 minutos**
- Segredo: `process.env.SATELITE_SESSION_SECRET` — **falhe alto se faltar**,
  nunca caia para outra chave
- Use `crypto` do Node. Não instale biblioteca de JWT para isto.
- Compare a assinatura com `crypto.timingSafeEqual`

No layout do admin (`src/app/suplementos/(admin)/layout.tsx`), depois de
confirmar que o papel é `admin`, grave o cookie **`sessao_satelite`**:
`httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`, `maxAge` de 30 minutos.

Assim o carimbo se renova sozinho enquanto a pessoa usa o admin, e morre
sozinho quando ela para.

**A casca entrega sessão, nunca dado.** O cookie diz *quem é*; não diz nada
sobre alertas. É a regra da Fase 6b, e é o que impede a casca de virar chave
mestra.

## Parte 2 — o satélite

Pasta nova na raiz: **`satelites/alertas/`**. Fora de `src/` de propósito — é
outro deployable, não faz parte do Next.

```
satelites/alertas/
  handler.mjs      a função
  package.json     dependência única: postgres
  LEIA-ME.md       o desenho em 10 linhas, para quem abrir daqui a um ano
```

### `handler.mjs`

Recebe evento do ALB (`event.headers`, `event.path`) e devolve
`{ statusCode, headers, body }` com **HTML** — página inteira, sem framework.

**Ordem obrigatória:**

1. Lê o cookie `sessao_satelite` do cabeçalho `Cookie`.
2. Verifica com o mesmo HMAC da parte 1. Sem cookie, assinatura inválida ou
   expirado → **302 para `/suplementos/login`**. Papel diferente de `admin` →
   **404**, não 403.
3. Só então consulta o banco.

**Nunca consulte antes de verificar.** É a ordem que impede que uma falha de
autenticação vire vazamento.

### A conexão

`postgres` (mesma biblioteca do núcleo), com senha como **função assíncrona**
que gera token IAM — o mesmo padrão de `src/lib/db.ts`. Use
`@aws-sdk/rds-signer`, que já vem no runtime da Lambda.

```
host     desafiodiabetes.c0fsqek8ykxr.us-east-1.rds.amazonaws.com
porta    5432
banco    clinico
usuário  satelite_alertas
ssl      require
```

Reaproveite a conexão entre execuções (variável de módulo), mas **não** deixe
`idle_timeout` alto — Lambda congela entre chamadas.

## Parte 3 — a tela

Três blocos, nesta ordem.

### Bloco 1 — quando o vigia passou por aqui (o mais importante)

```sql
SELECT max(greatest(visto_em, ultima_vez_em)) AS ultima_passagem FROM alertas
```

Mostre a idade em destaque. **Acima de 90 minutos, pinte como problema**:
*"o vigia não passa por aqui há X horas"*.

Se o vigia morrer, a tela mostra dado velho e parece saudável. Uma tela de
alertas que não sabe se está atualizada é pior que nenhuma — ela transmite
calma falsa. **Quem vigia o vigia é esta linha.**

### Bloco 2 — abertos

`WHERE resolvido_em IS NULL`, agrupados por `tipo`, mais antigo primeiro. Para
cada um: o rótulo em português, o conteúdo relevante do `detalhe`, e há quanto
tempo está aberto.

Distinga **notificado** de **ainda não notificado** — o segundo apareceu agora
e ainda não te acordou.

| tipo | rótulo |
|---|---|
| `pagamento-sem-pedido` | Pagamento sem pedido |
| `assinada-sem-despacho` | Prescrição assinada sem despacho |
| `job-atrasado` | Rotina atrasada |
| `job-falhou` | Rotina falhou |
| `suporte-sem-resposta` | Cliente sem resposta |
| `assinatura-vencida` | Assinatura vencida |

### Bloco 3 — resolvidos nas últimas 48h

Discreto, no fim. Não é enfeite: é a prova de que o vigia fecha o que conserta.
Sem ele, alerta que some parece alerta que foi perdido.

### Estado vazio

"Nenhum alerta" sozinho é ambíguo — pode ser *tudo bem* ou *ninguém olhou*.
Diga que está tudo certo **e mostre a última passagem do vigia**.

### Visual

Paleta da marca, sem framework: fundo `#fafbfe`, texto `#212529`, azul
`#13244f`, vermelho de ação `#f4001e`. Estado usa a paleta semântica —
`#7dc668`, `#ff7076`, `#f5b666` —, **nunca o vermelho da marca**, que num
painel compete com o vermelho de erro.

CSS embutido na própria resposta. Sem arquivo externo, sem fonte remota.

## O que NÃO fazer

- **Não escreva em `alertas`.** Se aparecer `INSERT`, `UPDATE` ou `DELETE`,
  está errado. Quem escreve é o vigia.
- **Não crie botão de "resolver" ou "silenciar".** O vigia fecha sozinho quando
  a condição some; um botão manual criaria estado que ele não conhece, e as
  duas verdades passariam a divergir.
- **Não consulte nenhuma tabela além de `alertas`.** O papel nem vai deixar —
  mas se você escrever, descobrimos com erro em produção em vez de aqui.
- **Não ponha a tela dentro do `src/app`.** Ela não é do Next.
- **Não crie função, papel no banco, regra de ALB nem segredo.** Meu.
- **Não rode SQL, não faça deploy.**
- **Não mexa em `db/vigia/`** — aquele SQL não é da aplicação.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam no núcleo.
2. `satelites/alertas/handler.mjs` existe e **não importa nada de `src/`**.
3. `grep -rn "INSERT\|UPDATE\|DELETE" satelites/alertas/` volta vazio.
4. `grep -rn "FROM" satelites/alertas/handler.mjs` mostra **só** `alertas`.
5. Sem cookie válido, o handler devolve 302 **sem** ter aberto conexão com o
   banco — dá para ver pela ordem do código.
6. `SATELITE_SESSION_SECRET` ausente derruba na partida, não silenciosamente.

Quando terminar, me chame para verificar antes de mexer em outra coisa. Eu crio
o papel, a função e a regra do ALB, e testo com sessão real.
