# Captação de lead — infraestrutura

Provisionada em 27/08/2026. Atende `POST /api/lead`, o único endereço do
sistema aberto à internet sem sessão.

## O caminho

```
navegador → CloudFront (/api/*, já existia) → ALB → tg-captacao-lead → Lambda
                                                         → RDS clinico, marketing.captar_lead
```

## Peças

- **Lambda `captacao-lead`** — nodejs22.x, handler `captacao-lead/handler.handler`,
  15s, 256 MB, na VPC `vpc-0a50b69fe9ffe9b01` com as três subnets e o SG
  `sg-016f50c2f996dc2d4` (o único que o RDS aceita).
- **Papel `lambdaCaptacaoLead`** — `AWSLambdaVPCAccessExecutionRole` mais uma
  política inline com `rds-db:connect` restrito ao usuário `captacao_lead`.
  Nenhum segredo em variável de ambiente: entra por token IAM.
- **Target group `tg-captacao-lead`** — tipo lambda, sem health check.
- **Regras do ALB, prioridade 12, nos DOIS listeners** — caminhos
  `/api/lead` e `/api/lead/*`. A CloudFront fala com a porta 80; regra que
  existisse só no 443 não valeria para ninguém.

## Sem regra nova de CloudFront

O comportamento `/api/*` já existe, já aceita POST e já aponta para o ALB. A
distribuição tem quatro comportamentos e o teto é cinco — este trabalho não
consumiu o que sobra.

## Sem captcha

Decidido em 27/08/2026. A armadilha (campo `sobrenome`) pega robô comum, e a
validação da lista antes de qualquer disparo é o que impede endereço inventado
de virar bounce. Um web ACL de WAF chegou a ser criado e foi apagado no mesmo
dia: a ação Challenge devolve 202 com interstitial HTML, que um `fetch` não
executa, e o SDK que resolveria isso só é liberado para web ACLs com grupo de
regras gerenciado.

Se aparecer sujeira nos cadastros, o caminho é Turnstile ou Altcha na página.

## Testado em produção

Cadastro válido grava um lead e um consentimento. O mesmo e-mail em caixa
diferente não duplica, não sobrescreve nome nem origem, e gera um segundo
consentimento. Armadilha preenchida responde 200 sem gravar. Origem fora da
lista responde 400. Sem consentimento, 400. GET, 405.
