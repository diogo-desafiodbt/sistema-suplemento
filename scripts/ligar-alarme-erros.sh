#!/usr/bin/env bash
# Alarme de erro no log da aplicação.
#
# O CloudWatch já registrava tudo — inclusive as 643 falhas do IMAP, o 42P10 que
# travava toda compra e o 500 da tela do admin. Nenhum se perdeu; ninguém olhou.
# O caderno registra, mas não chama. Isto é o que chama.
#
# Reaproveita o tópico SNS do vigia: um só canal, um só e-mail a confirmar.
set -euo pipefail

REGIAO="${REGIAO:-us-east-1}"
TOPICO="arn:aws:sns:us-east-1:768102455037:desafiodiabetes-alertas"

echo "→ 1/3 filtro: conta linhas de erro no log da aplicação"
# 'Checkout error' e 'Inngest function error' entram por '?Error'.
# O padrão do CloudWatch é OU entre os termos com '?'.
aws logs put-metric-filter --region "$REGIAO" \
  --log-group-name /ecs/sistema-suplemento \
  --filter-name erros-da-aplicacao \
  --filter-pattern '?Error ?ERROR ?"permission denied" ?"does not exist"' \
  --metric-transformations \
      metricName=ErrosApp,metricNamespace=DesafioDiabetes,metricValue=1,defaultValue=0

echo "→ 2/3 alarme: 5 erros em 15 minutos"
# Limiar, não 1: erro isolado acontece (aba velha, cliente que desistiu no meio).
# 5 em 15 min é padrão, não acidente. Abaixo disso o CloudWatch guarda e o vigia
# pega se virar problema de negócio.
aws cloudwatch put-metric-alarm --region "$REGIAO" \
  --alarm-name erros-na-aplicacao \
  --alarm-description "Erros acumulando no sistema-suplemento. Ver /ecs/sistema-suplemento no CloudWatch." \
  --namespace DesafioDiabetes --metric-name ErrosApp \
  --statistic Sum --period 900 --evaluation-periods 1 \
  --threshold 5 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$TOPICO" \
  --ok-actions "$TOPICO"

echo "→ 3/3 conferindo"
aws cloudwatch describe-alarms --region "$REGIAO" \
  --alarm-names erros-na-aplicacao vigia-alerta-novo \
  --query 'MetricAlarms[].{alarme:AlarmName,estado:StateValue,limiar:Threshold,janela:Period}' \
  --output table

echo ""
echo "pronto. Os dois alarmes mandam para o mesmo e-mail já confirmado."
