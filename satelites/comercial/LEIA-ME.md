Satélite comercial: uma Lambda, a aba Leads, só leitura.

O navegador chega pelo ALB. A função lê o cookie `sessao_satelite` (HMAC que o
núcleo carimbou no admin), recusa quem não é admin, e só então pergunta ao RDS.

Papel `satelite_comercial`, token IAM, banco `clinico`. Alcance: o schema
`marketing` e nada mais — sem USAGE em `public`, então prontuário, pedido e
pagamento não existem para ele. Só leitura: quem escreve lead é a Lambda de
captação; quem carimba conversão é o núcleo.

O painel trabalha com contagem, não com pessoa. A lista nominal é paginada em
25 e tem busca, em vez de despejar a base inteira numa resposta — se a função
for comprometida, o alcance máximo é a página aberta, não o arquivo.

A tela não sabe quem comprou: ela lê `convertido_em`, que o núcleo carimba pela
função `marketing.marcar_conversao`. Perguntar isso ao banco exigiria ler
`public.users`, que este papel não alcança de propósito.

Rota: `/suplementos/admin/painel/comercial`. A moldura do núcleo embute esta
tela em `/suplementos/admin/comercial`.
