# Omie: nota fiscal automática e taxa de plataforma no financeiro

Briefing. Diz o que precisa acontecer e o que as APIs permitem.
A proposta de execução é o que eu espero de volta.

## O objetivo

Que cada venda gere nota fiscal e movimente o financeiro do Omie sem
ninguém tocar. Hoje é manual, e são mais de 300 vendas por mês só num
produto.

## A restrição que torna isso não-trivial

A nota fiscal tem que sair pelo valor cheio da venda. É obrigação legal:
quem vende para o comprador somos nós, a plataforma é intermediária e
cobra o serviço dela à parte.

Mas no banco nunca cai o cheio. Cai descontado da taxa da plataforma.

Então tem uma diferença entre o que foi faturado e o que foi recebido,
em toda venda, e essa diferença precisa ir para algum lugar que não suma
do resultado. Eu quero conseguir responder, no fim do mês, quanto a
Hotmart e a Pagar.me me custaram. Se a taxa virar "desconto genérico",
eu perco esse número.

## O que as APIs permitem

**Omie** — a API fatura pedido de venda e emite NF-e, e permite dar baixa
em recebimento informando um desconto. Também expõe contas a pagar e
lançamento em conta corrente, se o caminho for por aí.

**Hotmart** — o endpoint `sales/history` devolve, em cada venda, um campo
`hotmart_fee` com o valor exato cobrado, o percentual aplicado, a parte
fixa e a base de cálculo. Devolve também a forma de pagamento e o número
de parcelas. Esse endpoint já é chamado hoje pelo `hotmart-sales-sync` —
o campo chega e está sendo descartado no mapeamento.

Existem ainda `sales/price/details`, que abre o preço com imposto e
desconto de cupom, e `sales/commissions`, que mostra quanto cada
participante levou numa venda com afiliado ou coprodutor.

**Pagar.me** — a taxa não vem no objeto do pedido. Vem na consulta de
recebíveis, que devolve por recebível a taxa cobrada, a taxa de
antecipação e a data em que aquele dinheiro liquida. Essa consulta
precisa de permissão na chave, que hoje não temos.

## O que as APIs não permitem

A Hotmart não informa quando o repasse foi liberado. Não existe
equivalente à consulta de recebíveis da Pagar.me. O mais próximo é o fim
da janela de reembolso de cada venda, que é quando a Hotmart libera — mas
isso é previsão, não confirmação.

Isso deixa as duas plataformas assimétricas: numa dá para saber sozinho
quando o dinheiro caiu, na outra não.

## Duas coisas que notei no sistema hoje

O parcelamento e a bandeira do cartão não são gravados no checkout da
Pagar.me. O valor existe no fluxo e é enviado para a Pagar.me, mas não
entra no registro do pagamento.

E o log de webhook da Pagar.me está gravando praticamente vazio — o
resumo do payload lê os campos num nível acima de onde eles vêm no
evento. Vale checar independente desse projeto.

## O que eu preciso que vocês me digam

1. Como vocês fariam esse encaixe. Especificamente: onde a diferença
   entre o faturado e o recebido deve morar no Omie para que o custo de
   plataforma continue visível no resultado.

2. Se dá para tratar as duas plataformas com o mesmo desenho, dado que
   uma informa a data de liquidação e a outra não. E, se não der, qual a
   saída para a Hotmart.

3. Como fica venda parcelada. Na Pagar.me, 6x libera em seis datas com
   seis taxas. Quero entender o que isso implica do lado do Omie antes de
   decidir qualquer coisa.

4. O que precisa existir configurado no Omie antes de escrever qualquer
   linha, e quem faz isso.

5. Uma estimativa de esforço, e o que dá para entregar em partes.

## Duas confirmações que eu preciso antes

O módulo de emissão de NF-e está contratado no nosso plano Omie? O
certificado A1 está carregado? Se não estiver, nada disso existe e a
conversa muda.

E temos venda com comissão de afiliado ou coprodutor? Se tiver, o líquido
não é só o total menos a taxa da plataforma.
