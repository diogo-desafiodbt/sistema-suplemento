Satélite de alertas: uma Lambda, uma tabela, zero escrita.

O navegador chega pelo ALB. A função lê o cookie `sessao_satelite` (HMAC
que o núcleo carimbou no admin), recusa quem não é admin, e só então pergunta
ao RDS.

Papel `satelite_alertas`, token IAM, banco `clinico`. Alcance: tabela
`alertas`. Nada mais.

Se o cookie faltar ou estiver velho, redireciona ao login — sem abrir o banco.
Se o papel não for admin, responde 404.

Quem fecha alerta é o vigia, quando a condição some. Esta tela só lê.
