# Rastro do Cliente — justificativa de Zona 1

> A Regra 1 do documento de arquitetura diz que todo serviço novo nasce em
> Zona 2, sem nenhum dado pessoal, e que subir para Zona 1 exige justificativa
> escrita de qual campo é necessário e por quê. Este é o documento que a regra
> pede. Escrito em 31/08/2026, antes de qualquer tabela existir.

## O que o Rastro é

Ele responde três perguntas que hoje não têm resposta: de onde veio quem
compra, onde as pessoas param, e quem está parado agora e vale um contato.

O funil que existe hoje conta eventos em quatro tabelas sem junção, e a
identidade quebra no meio — antes do pagamento a pessoa é um identificador de
navegador, depois é `users.id`, e não existe nada ligando os dois.

## Por que ele não cabe em Zona 2

Zona 2 é "nenhum dado pessoal". Ligar um clique a uma pessoa **é** dado
pessoal, por definição: comportamento associado a indivíduo identificado.
Não existe versão do Rastro que responda "de onde veio a Marina" sem saber
quem é a Marina.

Então ele nasce em Zona 1, e este documento diz exatamente o que ele guarda.

## O que ele guarda, campo a campo

| Campo | Por que é necessário |
|---|---|
| `anonimo_id` | O identificador do navegador. É o que liga os eventos anteriores ao login à pessoa que aparece depois. Sem ele não há atribuição. |
| `pessoa_id` | Chave estrangeira para `users.id`. É o identificador opaco que a Regra 4 manda atravessar a fronteira. |
| `evento` | O nome do passo, em vocabulário **neutro**. Ver a seção seguinte. |
| `origem` | O apelido do link que trouxe a pessoa. É a resposta de "de onde veio". |
| `ocorrido_em` | Quando. Sem isso não há janela de conversão nem prazo de contato. |

## O que ele NÃO guarda, e é a parte que importa

**Nada de nome, e-mail, CPF, telefone ou endereço.** A Regra 4 é explícita: o
identificador que atravessa é o opaco. Quem precisa falar com a pessoa pede ao
núcleo, que é quem conhece o contato.

**Nada clínico, nem por apelido.** Esta é a linha mais fácil de cruzar sem
perceber. O funil de hoje tem uma etapa chamada `quiz_eligible` — "foi
considerado apto". Gravar isso num serviço fora do núcleo registra que aquela
pessoa passou por uma triagem de diabetes, o que revela condição de saúde
presumida. A Regra 5 proíbe, e com razão.

No Rastro, essa etapa se chama `triagem_concluida`. O nome não carrega o
resultado. A leitura clínica — quem foi apto, com qual condição — continua
existindo só dentro do núcleo, onde sempre esteve.

O mesmo cuidado vale para qualquer etapa futura: **o nome da etapa não pode
revelar o conteúdo da decisão.**

## Onde cada peça mora

| Peça | Zona | Por quê |
|---|---|---|
| Redirecionador de links | 2 | Grava clique anônimo, apelido e horário. Não conhece pessoa. |
| Catálogo de links | 2 | Destino e apelido. Não é dado pessoal. |
| Log de eventos identificados | 1, dentro do núcleo | Liga comportamento a pessoa. |
| Tabela de ligação anônimo↔pessoa | 1, dentro do núcleo | Escrita no login, por quem já conhece `users`. |
| Fila de contato | núcleo | Mostra telefone. Satélite não pode conhecer contato. |
| Tela do fluxo | núcleo | Mostra pessoa e etapas de um produto de saúde. |

A consequência prática: **a tela do fluxo e a fila não são satélite.** São
telas do núcleo, como a ficha do cliente. Só o redirecionador fica fora.

## O que isso não resolve

O Rastro registra que alguém clicou num vídeo sobre diabetes e depois comprou.
Mesmo com nome neutro de etapa e identificador opaco, o conjunto permite
inferência sobre saúde — quem tem acesso ao log e à tabela de ligação consegue
concluir coisas sobre a pessoa.

Isso é aceito conscientemente, e é por isso que o log fica **dentro do núcleo**,
atrás das mesmas camadas do prontuário, e não num serviço em volta. A proteção
não é o dado ser inofensivo; é ele estar no lugar mais protegido que existe
aqui.

Duas consequências que valem escrever:

1. **Exportar esse dado para fora exige decisão específica**, incluindo para
   plataforma de anúncio. Já discutido em 30/08: lista de pessoas ligadas a
   conteúdo de diabetes é dado sensível, com regra própria de consentimento.
2. **A exclusão do titular tem que alcançar o Rastro.** Apagar no núcleo
   precisa apagar aqui, e o desenho de exclusão é do núcleo — o Rastro é
   consumidor, não fonte de verdade da identidade.

## Aprovação

Este documento entra na revisão v6 da regra de arquitetura, junto com as
decisões de 30/08. **Pendente de leitura e aprovação do Diogo.**
