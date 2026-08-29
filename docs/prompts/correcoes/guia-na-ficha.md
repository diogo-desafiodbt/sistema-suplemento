# A compra do guia entra na ficha do cliente

## O que falta hoje

A ficha em `src/app/suplementos/(admin)/admin/clientes/[id]/page.tsx` mostra
pedidos, assinaturas, pagamentos, protocolos, endereços, quiz, RFM e histórico de
login — tudo do banco `clinico`, tudo por `user_id`.

A compra do guia não aparece. Ela vive em `hotmart_sales`, no banco `conteudo`,
e hoje só o suporte a alcança, por `src/lib/support/acesso-guia.ts`.

São 1.083 vendas de 1.066 compradores, e o produto é um só: "O Primeiro Passo -
O Guia da Reversão do Diabetes". Para a maioria dos 1.072 clientes da base, essa
é a **única** compra que existe — a ficha deles hoje está vazia.

## O que fazer

Reunir as duas origens numa lista só de compras, na mesma ficha, em ordem
cronológica, com a origem marcada em cada linha.

### A chave é o e-mail, e não dá para fazer JOIN

`clinico` e `conteudo` são bancos separados. São duas consultas, juntadas em
memória.

A comparação é `lower(hotmart_sales.buyer_email) = lower(users.email)` — a mesma
chave que `garantirClientesDaHotmart` usa para casar cliente com venda. Já criei
o índice `hotmart_sales_buyer_email_idx` sobre `lower(buyer_email)`; a consulta
precisa comparar em minúsculas para usá-lo.

`buyer_document` (CPF) existe e tem índice, mas só passou a ser exigido na
Hotmart em 25/08/2026 — a maioria das linhas antigas não tem. Não sirva como
chave; no máximo, como reforço depois, se aparecer necessidade.

### Ler o outro banco

`getSqlConteudo()` em `src/lib/conteudo/db.ts`. A ficha roda no núcleo, que tem
`CONTEUDO_DATABASE_URL`, e o papel `job_conteudo` já tem SELECT em
`hotmart_sales`. Nada a conceder.

Campos úteis: `product_name`, `order_date`, `status`, `price_value`,
`price_currency`, `payment_method`, `transaction_code`.

### A ficha não pode cair junto com o banco secundário

Envolva a consulta ao `conteudo` em `try/catch` próprio. Se ela falhar, a ficha
renderiza tudo o mais e mostra na seção de compras que o histórico da Hotmart não
pôde ser carregado.

A ficha do cliente é ferramenta de atendimento: alguém está com o cliente na
linha. Ela funcionando pela metade é muito melhor que uma tela de erro porque um
banco secundário está fora.

### Como apresentar

Uma seção "Compras", linha do tempo única por data, decrescente. Cada linha diz a
origem — guia (Hotmart) ou suplemento (sistema) —, o produto, a data, o valor e a
situação.

Os vocabulários de situação são diferentes e não devem ser fundidos num rótulo
só: a Hotmart usa `COMPLETE` e `APPROVED` (ambos significam pago, e são os únicos
dois valores que existem hoje na base), e o sistema usa o dele. Traduza cada um
para português na exibição e preserve o valor bruto no título do elemento, para
quem estiver depurando.

Mantenha as seções que já existem — pedidos, assinaturas, pagamentos. Esta é uma
visão de cima, não a substituta delas.

## Como saber que funcionou

Abra a ficha de um cliente que veio da Hotmart e ainda não comprou suplemento: a
compra do guia tem que aparecer, com data e valor. Antes desta mudança a ficha
dele não mostra compra nenhuma.

Abra a ficha de um cliente sem compra na Hotmart: nada muda, e nenhum erro
aparece.
