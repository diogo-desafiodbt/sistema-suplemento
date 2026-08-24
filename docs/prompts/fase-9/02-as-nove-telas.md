# Prompt — Fase 9, passo 2: as nove telas

> Referencie no Cursor com `@02-as-nove-telas.md`.
> Branch: `reestrutura-suplementos`.
> A casca e o vocabulário do passo 1 já estão no ar e aprovados.

Agora o conteúdo. As nove telas passam a usar o vocabulário em vez de cada uma
desenhar o seu.

## A regra que sustenta este passo inteiro

**Nenhuma consulta muda.** Nem uma coluna a mais, nem um filtro, nem um
`ORDER BY`.

Isto é o que mantém a entrega em presentação pura: se ficar torto, você vê na
hora. Consulta que muda pode falhar em silêncio, e aí nove telas juntas viram
nove suspeitos.

**Critério explícito:** `git diff` do passo não pode conter nenhuma linha
começando com `+` ou `-` que tenha `SELECT`, `FROM`, `INSERT`, `UPDATE`,
`DELETE`, `JOIN` ou `WHERE`.

Se alguma tela **precisar** de dado que ela não busca hoje, **pare e me avise**.
Não busque.

## Entregue tela a tela

Uma tela por vez, cada uma completa antes de começar a seguinte. Se você parar
no meio da sétima, quero seis prontas e usáveis — não nove pela metade.

Ordem sugerida, da mais simples à mais densa:

```
1. Pedidos      satélite   quase só o estado vazio
2. Alertas      satélite   tem conteúdo real, exercita Selo e Card
3. Cupons       satélite   tabela + formulário
4. Config       satélite   lista de campos
5. Usuários     núcleo
6. Auditoria    núcleo     tabela longa
7. Clientes     núcleo
8. Suporte      núcleo
9. Visão Geral  núcleo     o funil, e só ele — ver abaixo
```

## Os dois mundos

**Núcleo (React):** use `src/components/admin/ui/` — `Card`, `CardIndicador`,
`Tabela`, `Selo`, `Botao`, `Vazio` — e `CabecaDePagina` para trilha e título.
Se faltar um componente, **crie em `ui/` e reutilize**; não faça marcação solta
dentro da tela.

**Satélites (HTML de Lambda):** use as classes de `satelites/comum/estilo.mjs`
— `.card`, `.tabela`, `.selo`, `.btn`, `.vazio`. Se precisar de uma classe
nova, ela nasce **lá**, não no handler. Handler com cor própria é o começo da
divergência.

## O que cada tela precisa ter

**Trilha e título** em todas, pelo grupo do menu:
*Operação / Pedidos*, *Clínico / Clientes*, *Ajustes / Cupons*.

**Estado vazio explicado.** "Nenhum X" sozinho é ambíguo — pode ser *está tudo
certo* ou *ninguém olhou*. Diga o porquê, como já está em Pedidos:
*"O portão de pré-lançamento está fechado."*

**Estado usa a paleta semântica** — `#7dc668`, `#ff7076`, `#f5b666`. **Nunca o
vermelho da marca**, que fica em ação primária e no item ativo do menu.

**Tabela sempre dentro de `overflow-x:auto`**, senão a página inteira rola de
lado no primeiro pedido com nome comprido.

**Números alinhados** com `tabular-nums` em toda coluna de valor, data ou
contagem.

## Visão Geral: só o funil

Ela já mostra um funil de conversão com dado real, e ele **é bom**. Redesenhe
com o vocabulário e **não acrescente nada**.

> Um mockup anterior mostrava cards de venda do guia e financeiro ali. Aquilo
> mora em outro banco, que o admin não alcança — é decisão de arquitetura, não
> de tela, e fica para depois. **Não tente buscar esses números.**

## Os ícones da lateral

Cada item do menu ganha um ícone à esquerda, em SVG dentro do próprio
componente — **sem biblioteca nova e sem arquivo externo**. Traço de 2px,
17px, mesma opacidade do texto. Ícone é o que faz o menu ser lido de relance.

## O que NÃO fazer

- **Não mude consulta nenhuma.** É a regra do passo.
- **Não mexa em rota, credencial, sessão ou roteamento.**
- **Não acrescente funcionalidade** — botão novo, filtro novo, ordenação nova.
  Se parecer que falta, me avise; não faça.
- **Não deixe cor solta** em tela. Token ou classe, sempre.
- **Não mexa na tela antiga de pedidos** (`pedidos-nucleo`), que é rede.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. O `diff` **não tem nenhuma linha de SQL**.
3. As nove telas usam o vocabulário; nenhuma tem cor fora dos tokens.
4. `grep -rn "f4001e" src satelites --exclude-dir=node_modules` só aparece em
   ação primária, item ativo do menu e na definição dos tokens.
5. Toda tabela está dentro de contêiner com rolagem própria.
6. Todo estado vazio explica o motivo.
7. A lateral tem ícones.

Quando terminar, me chame. Eu subo e passo pelas nove com o mockup ao lado.
