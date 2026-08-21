#!/usr/bin/env bash
# Cria o serviço do portal do paciente — a Zona 1.
#
# NÃO liga tráfego. O serviço sobe e passa no health check, mas nenhuma regra
# do ALB manda cliente para ele ainda. Se faltar alguma variável que não foi
# prevista, isso aparece com o serviço parado, não com cliente na frente.
#
# O que este serviço NÃO tem, e é o ponto da fase inteira:
#
#   sem DATABASE_URL    não fala com o RDS. Pergunta ao núcleo pela API de
#                       contrato, e o núcleo só responde sobre quem está logado.
#   sem taskRoleArn     não tem identidade na AWS. Como `app_web` autentica por
#                       token IAM e não por senha, nem uma DATABASE_URL que
#                       vazasse para cá conectaria: não há quem peça o token.
#                       Duas fechaduras, não uma.
#   4 segredos, não 39  o mínimo para saber quem está logado. Sem service role,
#                       sem Pagar.me, sem farmácia, sem Anthropic, sem Inngest.
#
# Depois de conferir que subiu, ligar o tráfego é trocar as condições da regra
# criada no passo 4 para /suplementos/dashboard*.
set -euo pipefail
REGIAO="${REGIAO:-us-east-1}"
CLUSTER=desafiodiabetes
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TD="$RAIZ/db/aws/sistema-portal-taskdef.json"

echo "→ 1/5 grupo de log"
if ! aws logs describe-log-groups --region "$REGIAO" \
     --log-group-name-prefix /ecs/sistema-portal \
     --query 'logGroups[?logGroupName==`/ecs/sistema-portal`].logGroupName' \
     --output text | grep -q .; then
  aws logs create-log-group --region "$REGIAO" --log-group-name /ecs/sistema-portal
fi
aws logs put-retention-policy --region "$REGIAO" \
  --log-group-name /ecs/sistema-portal --retention-in-days 90

echo "→ 2/5 definição de tarefa (mesma imagem; o que muda é o que FALTA)"
aws ecs register-task-definition --region "$REGIAO" --cli-input-json "file://$TD" \
  --query 'taskDefinition.{familia:family,revisao:revision,cpu:cpu,memoria:memory}' \
  --output text

echo "→ 3/5 target group"
TG=$(aws elbv2 describe-target-groups --region "$REGIAO" --names tg-sistema-portal \
       --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)
if [ -z "$TG" ] || [ "$TG" = "None" ]; then
  TG=$(aws elbv2 create-target-group --region "$REGIAO" \
    --name tg-sistema-portal --protocol HTTP --port 3000 \
    --vpc-id vpc-0a50b69fe9ffe9b01 --target-type ip \
    --health-check-protocol HTTP --health-check-path / \
    --matcher HttpCode=200-399 --health-check-interval-seconds 30 \
    --healthy-threshold-count 2 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
fi
echo "   $TG"

echo "→ 4/5 regra do ALB em caminho INEXISTENTE"
# O ECS recusa target group sem balanceador associado, então a regra precisa
# existir antes do serviço. Ela aponta para um caminho que ninguém chama: o
# target group fica associado e NENHUM tráfego real desvia.
LST=$(aws elbv2 describe-listeners --region "$REGIAO" \
  --load-balancer-arn "$(aws elbv2 describe-load-balancers --region "$REGIAO" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)" \
  --query "Listeners[?Port==\`443\`].ListenerArn" --output text)
if ! aws elbv2 describe-rules --region "$REGIAO" --listener-arn "$LST" \
     --query 'Rules[?Priority==`7`].RuleArn' --output text | grep -q .; then
  aws elbv2 create-rule --region "$REGIAO" --listener-arn "$LST" --priority 7 \
    --conditions 'Field=path-pattern,Values=/__portal-ainda-nao-ligado' \
    --actions "Type=forward,TargetGroupArn=$TG" \
    --query 'Rules[0].RuleArn' --output text
fi

echo "→ 5/5 serviço"
aws ecs create-service --region "$REGIAO" --cluster "$CLUSTER" \
  --service-name sistema-portal \
  --task-definition sistema-portal \
  --desired-count 1 --launch-type FARGATE \
  --load-balancers "targetGroupArn=$TG,containerName=sistema-portal,containerPort=3000" \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-04ffccc9db247c9b2,subnet-0d4ea5ca6340ec271,subnet-035464ed2a0ec7380],securityGroups=[sg-016f50c2f996dc2d4],assignPublicIp=ENABLED}' \
  --query 'service.{nome:serviceName,estado:status,desejado:desiredCount}' --output text

echo ""
echo "pronto. Nenhum cliente foi desviado para cá — o tráfego continua no núcleo."
echo "Custo desta tarefa: ~US\$ 9/mês (0,25 vCPU / 0,5 GB), aprovado em 20/08/2026."
