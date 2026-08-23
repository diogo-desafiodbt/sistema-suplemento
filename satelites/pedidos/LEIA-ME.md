Satélite de pedidos: uma Lambda, a lista — só leitura.

O navegador chega pelo ALB. A função lê o cookie `sessao_satelite` (HMAC
que o núcleo carimbou no admin), recusa quem não é admin, e só então pergunta
ao RDS.

Papel `satelite_pedidos`, token IAM, banco `clinico`. Alcance: `orders` e
só quatro colunas de `users` (nome, e-mail, código do cliente). CPF e
endereço nem entram no privilégio.

Os três botões (etiqueta, rastreio, PDF) continuam no núcleo — é lá que moram
CPF e endereço. Esta tela só mostra a lista e aponta para lá.

Rota própria: `/suplementos/admin/pedidos-lista`. A aba velha convive até a
troca no ALB.
