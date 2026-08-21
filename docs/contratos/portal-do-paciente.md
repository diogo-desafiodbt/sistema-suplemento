# Contrato — Portal do Paciente (Zona 1)

Primeiro contrato do sistema. O portal do paciente é o melhor lugar para ensaiar
o formato: **não lê nada clínico**, então errar aqui machuca pouco — e a Fase 6
vai aplicar o mesmo padrão em coisas bem mais delicadas.

## A regra que este documento cumpre

> **Zona 1 — operacional**: referencia pessoas, não lê prontuário.
> **Consome API de contrato, nunca credencial de banco.**

O portal **não recebe credencial do banco**. Ele pergunta; o núcleo responde.

## Por que não bastava dar uma credencial estreita

Com credencial própria (ainda que sem acesso ao prontuário), quem invadisse o
portal poderia rodar `SELECT nome, cpf, endereço FROM users` e levar a base
inteira de clientes.

Com contrato, o mesmo invasor leva **uma conta** — a do cliente cuja sessão ele
tiver. A diferença não é de grau.

```
credencial estreita   vaza a base de clientes
contrato              vaza uma conta
```

## A regra que sustenta isso

**Toda pergunta começa com "meu".** Nenhuma aceita "de quem" como parâmetro — o
dono vem sempre da sessão validada, nunca do corpo ou da URL.

Se algum dia aparecer uma pergunta do tipo "pedidos do cliente X", ela não
pertence a este contrato.

## Identidade: o núcleo não confia no portal

O portal repassa o **token de sessão** do cliente. O núcleo valida esse token por
conta própria e extrai dali o dono.

A alternativa — o portal validar e dizer ao núcleo "o usuário é o fulano", com
um segredo compartilhado — foi recusada: quem invadisse o portal poderia afirmar
qualquer identidade, e voltaríamos ao vazamento da base.

Efeito colateral bom: quando o Auth for para o Cognito (Fase 8), muda só o
validador dentro do núcleo. O contrato não muda.

## As nove perguntas

Todas em `POST /api/contrato/paciente/<pergunta>`, com o token no cabeçalho.

| # | Pergunta | Entra | Sai |
|---|---|---|---|
| 1 | `meu-perfil` | — | nome, e-mail, telefone, CPF, nascimento |
| 2 | `atualizar-perfil` | nome, telefone, nascimento | ok |
| 3 | `meu-endereco` | — | CEP, rua, número, complemento, bairro, cidade, UF |
| 4 | `salvar-endereco` | os campos acima | ok |
| 5 | `minha-assinatura` | — | plano, status, validade, carência, id da Pagar.me |
| 6 | `cancelar-assinatura` | — | ok |
| 7 | `meus-pagamentos` | — | últimos 5: valor, status, data |
| 8 | `meus-pedidos` | — | lista: status, rastreio, itens |
| 9 | `meu-pedido` | id do pedido | detalhe + rastreamento |

**A pergunta 9 é a única que recebe um id** — e o núcleo confere que aquele
pedido é do dono da sessão antes de responder. Id de outro cliente devolve 404,
nunca 403: 403 confirmaria que o pedido existe.

## O que NÃO entra no contrato

`e-mail` não é editável na pergunta 2 — trocar e-mail é mudar identidade e passa
pelo Auth, não por aqui.

`cpf` sai na 1 mas não entra na 2. CPF não se corrige por formulário de perfil.

`status` e `plano` da assinatura saem na 5 mas não têm pergunta de escrita — só
`cancelar`. Mudança de plano é fluxo de compra.

## Quando o núcleo está fora do ar

O portal mostra o que a tela pede em **estado degradado, não em erro branco**:

- perguntas de leitura (1, 3, 5, 7, 8, 9) → a tela informa que os dados estão
  indisponíveis no momento e oferece recarregar
- perguntas de escrita (2, 4, 6) → o botão informa a falha e **não** finge que
  gravou

**Nunca cachear resposta que contenha CPF ou endereço** para exibir offline. É
melhor a tela dizer que não sabe do que mostrar dado velho de quem não está
mais logado.

## Um defeito que o contrato corrige de graça

Hoje, na tela de assinatura, a consulta de pagamentos filtra por
`subscription_id` — e só é segura porque a consulta **anterior** buscou a
assinatura filtrando por usuário. A proteção depende de duas consultas em
sequência estarem certas.

No contrato, a pergunta 7 confere o dono sozinha. Não há sequência para quebrar.
