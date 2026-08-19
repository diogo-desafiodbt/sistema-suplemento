#!/usr/bin/env bash
# Liga o vigia: SNS -> alarme -> agendamento. Roda uma vez.
# Ver db/vigia/LEIA-ME.md para o porquê de cada peça.
set -euo pipefail

REGIAO=us-east-1
CONTA=768102455037
EMAIL=diogo@desafiodiabetes.com
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ 0/6 definição de tarefa do vigia (entra como o usuário vigia, não como postgres)"
aws ecs register-task-definition --region $REGIAO \
  --cli-input-json "file://$RAIZ/db/aws/vigia-taskdef.json" \
  --query 'taskDefinition.{familia:family,revisao:revision,usuario:containerDefinitions[0].environment[?name==`PGUSER`].value|[0]}' \
  --output text

echo "→ 1/6 tópico SNS"
TOPICO=$(aws sns create-topic --region $REGIAO --name desafiodiabetes-alertas \
  --query 'TopicArn' --output text)
echo "   $TOPICO"

echo "→ 2/6 inscrevendo $EMAIL (vai chegar um e-mail de confirmação — CONFIRME)"
if aws sns list-subscriptions-by-topic --region $REGIAO --topic-arn "$TOPICO" \
     --query 'Subscriptions[?Endpoint==`'"$EMAIL"'`].SubscriptionArn' --output text | grep -q .; then
  echo "   (já inscrito)"
else
  aws sns subscribe --region $REGIAO --topic-arn "$TOPICO" \
    --protocol email --notification-endpoint "$EMAIL" >/dev/null
fi

# O grupo só nasceria na primeira execução da tarefa, mas o filtro precisa
# dele existindo. Criar aqui evita a ordem quebrada.
aws logs create-log-group --region $REGIAO --log-group-name /ecs/vigia 2>/dev/null \
  || echo "   (grupo de log já existia)"
aws logs put-retention-policy --region $REGIAO \
  --log-group-name /ecs/vigia --retention-in-days 90

echo "→ 3/6 filtro de métrica: conta linhas ALERTA no log do vigia"
aws logs put-metric-filter --region $REGIAO \
  --log-group-name /ecs/vigia \
  --filter-name vigia-alertas \
  --filter-pattern 'ALERTA' \
  --metric-transformations \
      metricName=VigiaAlertas,metricNamespace=DesafioDiabetes,metricValue=1,defaultValue=0

echo "→ 4/6 alarme: qualquer alerta novo dispara"
aws cloudwatch put-metric-alarm --region $REGIAO \
  --alarm-name vigia-alerta-novo \
  --alarm-description "O vigia encontrou um problema novo. Ver /ecs/vigia." \
  --namespace DesafioDiabetes --metric-name VigiaAlertas \
  --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$TOPICO"

echo "→ 5/6 papel e agendamento (de hora em hora)"
aws iam create-role --role-name eventBridgeRodarVigia \
  --assume-role-policy-document "file://$RAIZ/db/aws/eventBridgeRodarVigia-confianca.json" \
  >/dev/null 2>&1 || echo "   (papel já existia)"
aws iam put-role-policy --role-name eventBridgeRodarVigia \
  --policy-name RodarVigia \
  --policy-document "file://$RAIZ/db/aws/eventBridgeRodarVigia-politica.json"

sleep 10   # o papel leva alguns segundos para propagar

aws scheduler create-schedule --region $REGIAO \
  --name vigia-desafiodiabetes \
  --schedule-expression 'rate(1 hour)' \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "file://$RAIZ/db/aws/vigia-alvo.json" \
  >/dev/null 2>&1 || \
aws scheduler update-schedule --region $REGIAO \
  --name vigia-desafiodiabetes \
  --schedule-expression 'rate(1 hour)' \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "file://$RAIZ/db/aws/vigia-alvo.json" >/dev/null

echo ""
echo "pronto. CONFIRME o e-mail de inscrição do SNS — sem isso não chega alarme."
