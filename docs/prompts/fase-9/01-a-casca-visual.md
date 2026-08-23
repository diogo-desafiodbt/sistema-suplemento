# Prompt — Fase 9, passo 1: a casca visual do admin

> Referencie no Cursor com `@01-a-casca-visual.md`.
> Branch: `reestrutura-suplementos`.
> Referência aprovada pelo Diogo em 23/08/2026:
> https://claude.ai/code/artifact/d3467713-9562-4634-8d51-5dfda536f1fb
> **Abra o link antes de começar.** O que estiver escrito aqui e divergir dele,
> ele ganha.

O admin ganha o padrão visual que o plano define há semanas e que nunca foi
aplicado. Este passo entrega **a casca e o vocabulário** — não as telas. As
telas vêm depois, uma a uma.

## Os tokens, que vêm do plano e não são negociáveis

```
--marinho        #13244f   barra lateral
--vermelho       #f4001e   AÇÃO PRIMÁRIA e item ativo, nada mais
--fundo          #fafbfe   fundo do conteúdo
--papel          #ffffff   cards
--borda          #e2e8ee
--tinta          #212529   texto
--tinta-fraca    #6c757d   secundário
--ok             #7dc668   semântico
--perigo         #ff7076   semântico
--atencao        #f5b666   semântico
--raio           4px
```

**A regra que mais importa:** o vermelho da marca fica em botão de ação
primária e no item ativo do menu. **Estado usa a paleta semântica.** Num painel,
o vermelho da marca compete com o vermelho de erro — e quando os dois brigam,
a pessoa para de acreditar em qualquer vermelho.

Repare no mockup: "Reembolsada" usa `#ff7076`, não `#f4001e`. É de propósito.

## Tipografia

**Roboto no admin**, carregada por `next/font/google`. O site institucional
continua com Poppins — painel não é site, e a diferença é intencional.

## Parte 1 — a casca

`src/app/suplementos/(admin)/layout.tsx` passa a ter:

**Barra lateral escura fixa**, 232px, com o menu agrupado:

```
OPERAÇÃO   Visão Geral · Pedidos · Suporte · Alertas
CLÍNICO    Clientes · Auditoria
AJUSTES    Cupons · Config · Usuários
```

O agrupamento **não é enfeite**: espelha a arquitetura. As três de Ajustes são
satélites; as duas de Clínico são as que leem prontuário. Mantenha essa ordem.

Item ativo: fundo levemente claro e **barra vermelha de 3px à esquerda**.
Rótulo de seção em maiúsculas pequenas, `#ffffff59`.

Em Alertas, um contador com a quantidade de alertas abertos — **mas isso não
pode custar uma consulta em toda navegação do admin**. Se complicar, deixe sem
contador e me diga; a gente resolve com cache depois.

**Cabeçalho branco**, 64px, fixo no topo: busca ampla à esquerda (pode ser
decorativa por ora, sem funcionar), sino com ponto vermelho quando houver
alerta, e o nome de quem está logado com iniciais num círculo.

Abaixo, em cada página: **trilha** em maiúsculas pequenas e **título grande**.
Crie um componente `CabecaDePagina` que receba trilha, título e um espaço à
direita para o filtro de período.

Em telas estreitas (< 860px) a lateral some. Não invente menu sanduíche agora —
o admin é usado no computador.

## Parte 2 — o vocabulário

`src/components/admin/ui/`, componentes pequenos e sem lógica de negócio:

- **`Card`** — papel, borda 1px, raio 4px, sombra quase nula. Com rótulo e um
  link discreto "Ver" no canto.
- **`CardIndicador`** — rótulo, número grande em `tabular-nums`, variação com
  seta colorida, linhas de detalhe e espaço para um mini-gráfico.
- **`Tabela`** — cabeçalho em maiúsculas pequenas, linhas com borda inferior,
  **sempre dentro de um contêiner com `overflow-x:auto`**.
- **`Selo`** — as três cores semânticas, para estado.
- **`Botao`** — primário (vermelho) e secundário (contorno).
- **`Vazio`** — título, explicação e ação opcional.

O `Vazio` merece atenção: **"Nenhum X" sozinho é ambíguo** — pode ser *está tudo
certo* ou *ninguém olhou*. Ele sempre exige uma explicação, como no mockup:
*"O portão de pré-lançamento está fechado. Os pedidos aparecem aqui assim que a
loja abrir."*

## Parte 3 — a mesma cara nos satélites

Quatro das nove abas são satélites: HTML servido por Lambda, sem React nem
Tailwind. **Sem uma folha compartilhada, o visual diverge na terceira tela.**

Crie **`satelites/comum/estilo.mjs`** exportando os mesmos tokens e as mesmas
classes (`.card`, `.tabela`, `.selo`, `.btn`, `.vazio`) como string de CSS, e
faça os três satélites usarem no lugar do CSS próprio.

**Não mude o conteúdo nem as consultas dos satélites** — só de onde vem o
estilo. As telas em si vêm no passo seguinte.

## O que NÃO fazer

- **Não mexa nas consultas** de nenhuma tela. Este passo é casca e componente.
- **Não redesenhe as telas ainda.** Elas continuam como estão, dentro da casca
  nova. Vão ficar feias no meio do bonito, e tudo bem — é uma coisa por vez.
- **Não use o vermelho da marca em estado.**
- **Não crie menu sanduíche** nem versão para celular.
- **Não toque na autenticação** nem em `sessaoAtual()`.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. As nove abas abrem com a lateral agrupada e a ativa marcada em vermelho.
3. `grep -rn "f4001e" src/components/admin src/app/suplementos/\(admin\)` só
   aparece em ação primária e item ativo.
4. Os três satélites importam de `satelites/comum/estilo.mjs` e nenhum tem
   bloco de CSS próprio duplicando token.
5. Nenhuma consulta mudou.
6. Roboto carregada por `next/font`, sem link para CDN.

Quando terminar, me chame. Eu subo e comparo com o mockup lado a lado, e a
gente decide a ordem das telas.
