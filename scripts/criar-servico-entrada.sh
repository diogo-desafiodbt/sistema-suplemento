#!/usr/bin/env bash
# Cria o serviço da Zona 0-E. NÃO liga tráfego: o serviço sobe, passa no health
# check e conecta no banco com a credencial restrita, mas nenhuma regra do ALB
# aponta para ele ainda.
#
# Assim, se faltar algum privilégio que não foi previsto, isso aparece com o
# serviço parado — não com cliente na frente.
set -euo pipefail
REGIAO="${REGIAO:-us-east-1}"
CLUSTER=desafiodiabetes
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TD="$RAIZ/db/aws/sistema-entrada-taskdef.json"

echo "→ 1/4 grupo de log"
aws logs create-log-group --region $REGIAO --log-group-name /ecs/sistema-entrada 2>/dev/null \
  || echo "   (já existia)"
aws logs put-retention-policy --region $REGIAO --log-group-name /ecs/sistema-entrada --retention-in-days 90

echo "→ 2/4 definição de tarefa (mesma imagem; só a DATABASE_URL muda)"
aws ecs register-task-definition --region $REGIAO --cli-input-json "file://$TD" \
  --query 'taskDefinition.{familia:family,revisao:revision,cpu:cpu,memoria:memory}' --output text

echo "→ 3/4 target group (mesma configuração do núcleo)"
TG=$(aws elbv2 create-target-group --region $REGIAO \
  --name tg-sistema-entrada --protocol HTTP --port 3000 \
  --vpc-id vpc-0a50b69fe9ffe9b01 --target-type ip \
  --health-check-protocol HTTP --health-check-path / \
  --matcher HttpCode=200-399 --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null \
  || aws elbv2 describe-target-groups --region $REGIAO --names tg-sistema-entrada \
       --query 'TargetGroups[0].TargetGroupArn' --output text)
echo "   $TG"

echo "→ 4/5 regra do ALB em caminho INEXISTENTE"
# O ECS recusa target group sem balanceador associado, então a regra precisa
# existir antes do serviço. Ela aponta para um caminho que ninguém chama:
# o target group fica associado e NENHUM tráfego real desvia.
# Ligar de verdade depois é só trocar as condições desta regra.
LST=$(aws elbv2 describe-listeners --region $REGIAO \
  --load-balancer-arn $(aws elbv2 describe-load-balancers --region $REGIAO \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text) \
  --query "Listeners[?Port==\`443\`].ListenerArn" --output text)
aws elbv2 create-rule --region $REGIAO --listener-arn "$LST" --priority 5 \
  --conditions 'Field=path-pattern,Values=/__entrada-ainda-nao-ligada' \
  --actions "Type=forward,TargetGroupArn=$TG" \
  --query 'Rules[0].RuleArn' --output text \
  || echo "   (regra já existia)"

echo "→ 5/5 serviço"
aws ecs create-service --region $REGIAO --cluster $CLUSTER \
  --service-name sistema-entrada \
  --task-definition sistema-entrada \
  --desired-count 1 --launch-type FARGATE \
  --load-balancers "targetGroupArn=$TG,containerName=sistema-entrada,containerPort=3000" \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-04ffccc9db247c9b2,subnet-0d4ea5ca6340ec271,subnet-035464ed2a0ec7380],securityGroups=[sg-016f50c2f996dc2d4],assignPublicIp=ENABLED}' \
  --query 'service.{nome:serviceName,estado:status,desejado:desiredCount}' --output text

echo ""
echo "pronto. Nenhuma regra do ALB aponta para ele — o tráfego continua todo no núcleo."
echo "Custo desta tarefa: ~US\$ 7/mês (0,25 vCPU / 0,5 GB)."
