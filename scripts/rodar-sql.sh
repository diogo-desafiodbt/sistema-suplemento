#!/usr/bin/env bash
# Roda SQL no RDS, que não é alcançável de fora da VPC.
#
# Sobe uma tarefa ECS avulsa (postgres:17-alpine) numa subnet PÚBLICA com IP
# público — precisa de saída para a internet só para puxar a imagem — usando o
# grupo de segurança das tarefas, que é o único que o RDS aceita.
#
#   ./scripts/rodar-sql.sh clinico arquivo.sql
#   ./scripts/rodar-sql.sh clinico -c "select 1"
#   echo "select 1" | ./scripts/rodar-sql.sh clinico -
#
# Sai com o código do psql: 0 é sucesso. ON_ERROR_STOP está ligado, então a
# primeira falha aborta o lote inteiro — não existe migração pela metade.

set -euo pipefail

REGIAO="us-east-1"
CLUSTER="desafiodiabetes"
TAREFA="db-admin"
SUBNET="subnet-0d4ea5ca6340ec271"   # us-east-1a, pública
SG="sg-016f50c2f996dc2d4"           # desafiodiabetes-tasks (o RDS só aceita este)
GRUPO_LOG="/ecs/db-admin"
BALDE="desafiodiabetes-builds"

if [ $# -lt 2 ]; then
  echo "uso: $0 <banco> <arquivo.sql | -c \"SQL\" | ->" >&2
  exit 64
fi

BANCO="$1"; shift

case "${1:-}" in
  -c) SQL="${2:?-c precisa de argumento}" ;;
  -)  SQL="$(cat)" ;;
  *)  [ -f "$1" ] || { echo "arquivo não encontrado: $1" >&2; exit 66; }
      SQL="$(cat "$1")" ;;
esac

B64="$(printf '%s' "$SQL" | base64 | tr -d '\n')"
CHAVE=""

# O override da tarefa aceita no máximo 8192 bytes contando tudo. Lote pequeno
# viaja em base64 dentro dele — não passa por aspas do shell, não aparece em
# `ps`, e cifrão e aspas simples chegam intactos. Lote grande vai pelo S3, com
# URL assinada de 15 minutos, e o objeto é apagado no fim.
if [ "${#B64}" -lt 7000 ]; then
  COMANDO="echo $B64 | base64 -d | psql -v ON_ERROR_STOP=1 -X -q -d $BANCO -f -"
else
  CHAVE="db/lote-$$-$(date +%s).sql"
  printf '%s' "$SQL" | aws s3 cp - "s3://$BALDE/$CHAVE" --region "$REGIAO" >/dev/null
  URL=$(aws s3 presign "s3://$BALDE/$CHAVE" --region "$REGIAO" --expires-in 900)
  COMANDO="wget -qO- '$URL' | psql -v ON_ERROR_STOP=1 -X -q -d $BANCO -f -"
  trap 'aws s3 rm "s3://$BALDE/$CHAVE" --region "$REGIAO" >/dev/null 2>&1 || true' EXIT
fi

OVERRIDES=$(cat <<JSON
{"containerOverrides":[{"name":"psql","command":["sh","-c","$COMANDO"],
  "environment":[{"name":"PGDATABASE","value":"$BANCO"}]}]}
JSON
)

REDE="awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=ENABLED}"

echo "→ rodando em '$BANCO' ($(printf '%s' "$SQL" | wc -l | tr -d ' ') linhas)…" >&2

ARN=$(aws ecs run-task \
  --region "$REGIAO" --cluster "$CLUSTER" \
  --task-definition "$TAREFA" --launch-type FARGATE \
  --network-configuration "$REDE" \
  --overrides "$OVERRIDES" \
  --query 'tasks[0].taskArn' --output text)

if [ -z "$ARN" ] || [ "$ARN" = "None" ]; then
  echo "falhou ao criar a tarefa" >&2
  exit 70
fi

ID="${ARN##*/}"
aws ecs wait tasks-stopped --region "$REGIAO" --cluster "$CLUSTER" --tasks "$ARN"

LEITURA=$(aws ecs describe-tasks --region "$REGIAO" --cluster "$CLUSTER" --tasks "$ARN" \
  --query 'tasks[0].{code:containers[0].exitCode,razao:stoppedReason,detalhe:containers[0].reason}' \
  --output json)

CODIGO=$(printf '%s' "$LEITURA" | python3 -c 'import json,sys; print(json.load(sys.stdin)["code"])')

# O log costuma demorar alguns segundos a mais que a tarefa para assentar.
for _ in 1 2 3 4 5 6; do
  SAIDA=$(aws logs get-log-events --region "$REGIAO" \
    --log-group-name "$GRUPO_LOG" --log-stream-name "psql/psql/$ID" \
    --start-from-head --query 'events[].message' --output text 2>/dev/null || true)
  [ -n "$SAIDA" ] && break
  sleep 3
done

[ -n "${SAIDA:-}" ] && printf '%s\n' "$SAIDA"

if [ "$CODIGO" != "0" ]; then
  echo "--- tarefa terminou com código $CODIGO ---" >&2
  printf '%s\n' "$LEITURA" >&2
  exit "${CODIGO:-1}"
fi
