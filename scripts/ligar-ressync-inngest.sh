#!/usr/bin/env bash
# REMENDO ASSUMIDO, não solução.
#
# O registro do Inngest quebra sozinho — três vezes entre 19 e 20/08, sem deploy,
# sem tarefa nova, sem mudança de rota. Causa desconhecida. Já descartados: troca
# de tarefa (ECS em steady state entre as quedas), roteamento do ALB (regra de
# prioridade 1 fixa /api/inngest* no núcleo) e colisão de app id.
#
# O PUT em /api/inngest é idempotente e resolve em segundos. Rodar de tempos em
# tempos não conserta a causa: limita o estrago a 15 minutos em vez de três dias.
#
# Enquanto isso, o alarme do vigia (pergunta 6) continua avisando — o remendo
# não substitui saber que aconteceu.
set -euo pipefail
REGIAO="${REGIAO:-us-east-1}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

# Reaproveita a task definition e o papel do vigia: mesmo caminho independente
# do Inngest. A tarefa não precisa de banco aqui, só de saída para a internet.
aws scheduler create-schedule --region "$REGIAO" \
  --name ressync-inngest \
  --schedule-expression 'rate(15 minutes)' \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "file://$RAIZ/db/aws/ressync-inngest-alvo.json" \
  >/dev/null 2>&1 \
|| aws scheduler update-schedule --region "$REGIAO" \
  --name ressync-inngest \
  --schedule-expression 'rate(15 minutes)' \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target "file://$RAIZ/db/aws/ressync-inngest-alvo.json" >/dev/null

aws scheduler get-schedule --region "$REGIAO" --name ressync-inngest \
  --query '{nome:Name,expressao:ScheduleExpression,estado:State}' --output text

echo ""
echo "ressincronização a cada 15 min. REMENDO: a causa continua desconhecida."
