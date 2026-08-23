# Prompt — Fase 6b: a casca do admin

> Referencie no Cursor com `@04-a-casca-do-admin.md`.
> Branch: `reestrutura-suplementos`.

Os três satélites saíram como **páginas inteiras**: clicar numa aba faz o menu
do admin sumir. Isso quebra a casca que o plano descreve, e é o que este passo
conserta.

> "O admin deixa de ser um sistema e vira uma **casca**: barra lateral,
> cabeçalho, sessão e navegação. Cada aba é servida por um serviço diferente.
> **A aparência é uniforme; o acesso não é.**"

## O desenho

```
navegador → núcleo        →  moldura: menu, cabeçalho, sessão
navegador → satélite      →  o conteúdo da aba, dentro de um quadro
```

**As duas setas saem do navegador.** A casca **não busca dado do satélite** — se
buscasse, ela viraria a chave mestra que este desenho inteiro existe para
eliminar. Ela entrega moldura e navegação, nada mais.

## Parte 1 — os caminhos

Os satélites passam a responder debaixo de `/suplementos/admin/painel/`. Eu
mudo as regras do ALB; **você só ajusta os caminhos dentro do código deles**.

| serviço | de | para |
|---|---|---|
| alertas | `/suplementos/admin/alertas` | `/suplementos/admin/painel/alertas` |
| ajustes | `/suplementos/admin/ajustes/...` | `/suplementos/admin/painel/ajustes/...` |
| pedidos | `/suplementos/admin/pedidos-lista` | `/suplementos/admin/painel/pedidos` |

Ajuste também os `Location` de redirecionamento interno dos satélites — o de
ajustes redireciona bastante depois de gravar. **Continuam absolutos e https.**

Os caminhos antigos deixam de existir: a aba passa a apontar para a moldura.

## Parte 2 — as quatro molduras, no núcleo

Quatro páginas novas em `src/app/suplementos/(admin)/admin/`:

```
alertas/page.tsx   →  quadro para /suplementos/admin/painel/alertas
cupons/page.tsx    →  quadro para /suplementos/admin/painel/ajustes/cupons
config/page.tsx    →  quadro para /suplementos/admin/painel/ajustes/config
pedidos/page.tsx   →  quadro para /suplementos/admin/painel/pedidos
```

Cada uma é uma página normal do admin: usa o layout que já existe, com o
`AdminNav` em cima, e no corpo um **`<iframe>`** apontando para o caminho do
satélite.

Crie **um componente só** — `src/components/admin/AbaDeServico.tsx` — que
recebe o caminho e o título. As quatro páginas são quatro chamadas dele.

### A altura do quadro

Os dois lados estão **no mesmo domínio**, então a página pode ler a altura do
conteúdo diretamente e ajustar. Sem `postMessage`, sem gambiarra.

```
altura = iframe.contentDocument.documentElement.scrollHeight
```

Reaja também a mudança de tamanho (`ResizeObserver` sobre o `body` de dentro) —
a tela de cupons cresce quando um cupom é criado.

Altura mínima razoável enquanto carrega, para a página não pular.

**Sem barra de rolagem dentro do quadro.** Quem rola é a página, como em
qualquer outra aba do admin.

### Se o satélite não responder

Se o conteúdo não carregar, mostre um aviso dentro da moldura: *"Não
conseguimos carregar esta aba agora."* — com um link para tentar de novo.

Quadro em branco é pior que erro: parece que a aba está vazia.

## Parte 3 — o menu volta ao normal

Com a casca, **as quatro abas voltam a ser rotas do núcleo**. Em
`src/components/admin/AdminNav.tsx`:

- `Alertas`, `Cupons`, `Config` e `Pedidos` apontam para
  `/suplementos/admin/<nome>` — os caminhos das molduras.
- **Some a marcação `externa`** e o ramo de âncora comum: não existe mais aba
  fora do Next. Volte a usar `Link` para todas.

Isso é uma simplificação de verdade — o mecanismo que eu criei ontem deixa de
ser necessário.

## Parte 4 — os satélites param de desenhar cabeçalho

Cada satélite hoje desenha um cabeçalho próprio ("Desafio Diabetes / Alertas").
Dentro da moldura isso vira cabeçalho duplicado.

Tire o cabeçalho e o fundo de página. Deixe **só o conteúdo**, com margem
pequena. O `<title>` pode ficar — não aparece dentro do quadro e ajuda quando a
página é aberta direto.

**Eles precisam continuar funcionando sozinhos**, abertos pelo endereço. É como
eu testo, e é a saída se a moldura quebrar.

**Não adicione `X-Frame-Options` nem CSP `frame-ancestors`** nas respostas dos
satélites — isso impediria a moldura de exibi-los.

## Parte 5 — a tela antiga de pedidos

`/suplementos/admin/pedidos` passa a ser a moldura. A tela antiga do núcleo
**não some ainda** — mova para `/suplementos/admin/pedidos-nucleo`, fora do
menu.

Ela é a rede: a renderização de uma linha com dado real nunca foi provada,
porque a base está zerada. Some quando a primeira compra de verdade aparecer
certa.

## O que NÃO fazer

- **A casca não busca dado do satélite.** Nada de `fetch` do servidor do núcleo
  para o satélite, nem de repassar resposta. O navegador fala com cada um.
- **Não mexa nas consultas nem nas regras de negócio** dos satélites. Este
  passo é caminho e moldura.
- **Não mexa em `sessaoAtual()`** nem em nada da Fase 8 — está em andamento.
- **Não crie regra de ALB.** Minha.
- **Não apague a tela antiga de pedidos.**
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. As quatro abas abrem **com o menu do admin visível** e a aba ativa marcada.
3. `grep -n "externa" src/components/admin/AdminNav.tsx` volta vazio.
4. `grep -rn "pedidos-lista\|admin/ajustes\|admin/alertas" satelites/` mostra só
   os caminhos novos com `painel`.
5. Nenhum `fetch` do núcleo para o satélite: `grep -rn "painel" src/app` só
   aparece como `src` de iframe.
6. Abrir `/suplementos/admin/painel/alertas` direto no navegador continua
   funcionando.
7. Criar um cupom pela aba **não faz a página inteira recarregar fora da
   moldura** — o resultado aparece dentro do quadro.

Quando terminar, me chame antes de mexer em outra coisa. Eu movo as regras do
ALB, subo os satélites e testo as quatro abas com sessão real.
