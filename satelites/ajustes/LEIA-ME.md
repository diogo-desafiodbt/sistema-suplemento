Satélite de ajustes: uma Lambda, duas abas (cupons e configuração).

O navegador chega pelo ALB. A função lê o cookie `sessao_satelite` (HMAC
que o núcleo carimbou no admin), recusa quem não é admin, e só então fala
com o RDS.

Papel `satelite_ajustes`, token IAM, banco `clinico`. Alcance:
`discount_coupons` (ler, criar, alterar) e `system_config` (ler e alterar
valor de chave existente). Nada mais.

Sem cookie válido, redireciona ao login — sem abrir o banco. Papel errado:
404. Cupom que não vale mais se desativa; configuração nova não nasce por
aqui.
