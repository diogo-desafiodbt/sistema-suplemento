#!/usr/bin/env bash
# Leva o banco clínico da Supabase para o RDS: esquema + dados, numa tarefa só.
#
#   ./scripts/migrar-clinico.sh           # confere e mostra o que faria
#   ./scripts/migrar-clinico.sh --aplicar  # APAGA o clinico e recarrega
#
# Roda dentro de uma tarefa ECS (db-admin:3) porque o RDS está em subnet
# privada e a origem está na internet — só ali os dois lados se enxergam.
# A tarefa lê as duas credenciais do Secrets Manager; nenhuma passa por aqui.
#
# É destrutivo de propósito: derruba o schema `public` do clinico e recarrega
# do zero. Não existe carga incremental — no corte, o que vale é o retrato do
# momento em que a origem for congelada.
#
# Por que dump completo em vez de --data-only: no formato texto do pg_dump as
# chaves estrangeiras entram DEPOIS do COPY, então a ordem de carga resolve
# sozinha. Com --data-only seria preciso desligar gatilho, o que o RDS não
# permite.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGIAO="us-east-1"
CLUSTER="desafiodiabetes"
TAREFA="db-admin:3"
SUBNET="subnet-0d4ea5ca6340ec271"
SG="sg-016f50c2f996dc2d4"
GRUPO_LOG="/ecs/db-admin"

APLICAR=0
[ "${1:-}" = "--aplicar" ] && APLICAR=1

FILTRO="$RAIZ/db/clinico/filtro.awk"
LISTA="$RAIZ/db/clinico/tabelas-de-conteudo.txt"
GRANTS="$RAIZ/db/clinico/grants.sql"
for f in "$FILTRO" "$LISTA" "$GRANTS"; do
  [ -f "$f" ] || { echo "falta $f" >&2; exit 66; }
done

EXCL=""
while read -r t; do
  [ -n "$t" ] && EXCL="$EXCL --exclude-table=public.$t"
done < "$LISTA"

AWK_B64=$(base64 < "$FILTRO" | tr -d '\n')
GRANTS_B64=$(base64 < "$GRANTS" | tr -d '\n')

if [ "$APLICAR" -eq 1 ]; then
  PASSO_CARGA="psql -v ON_ERROR_STOP=1 -X -q -d clinico -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
psql -v ON_ERROR_STOP=1 -X -q --single-transaction -d clinico -f /tmp/full.sql
echo \$GRANTS_B64_PLACEHOLDER | base64 -d > /tmp/grants.sql
psql -v ON_ERROR_STOP=1 -X -q -d clinico -f /tmp/grants.sql
echo '--- conferência ---'
psql -X -q -A -t -d clinico -c \"select 'tabelas=' || count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'\"
psql -X -q -A -t -d clinico -c \"select 'politicas=' || count(*) from pg_policies where schemaname='public'\"
psql -X -q -A -t -d clinico -c \"select 'app_web pode mexer em users.role? ' || has_column_privilege('app_web','public.users','role','UPDATE')\""
else
  PASSO_CARGA="echo '(simulação — nada foi aplicado; use --aplicar)'"
fi

SCRIPT="set -e
echo $AWK_B64 | base64 -d > /tmp/f.awk
pg_dump \"\$ORIGEM_URL\" --no-owner --no-privileges --schema=public $EXCL 2>/tmp/e.txt | awk -f /tmp/f.awk > /tmp/full.sql
[ -s /tmp/e.txt ] && { echo 'pg_dump reclamou:'; head -3 /tmp/e.txt; }
echo \"dump: \$(wc -l < /tmp/full.sql) linhas, \$(grep -c '^COPY ' /tmp/full.sql) tabelas com dados\"
echo \"sobrou RLS? \$(grep -c 'ROW LEVEL SECURITY' /tmp/full.sql) | sobrou auth.? \$(grep -c 'auth\\.' /tmp/full.sql)\"
$PASSO_CARGA"

SCRIPT="${SCRIPT//\$GRANTS_B64_PLACEHOLDER/$GRANTS_B64}"

B64=$(printf '%s' "$SCRIPT" | base64 | tr -d '\n')
OV=$(printf '{"containerOverrides":[{"name":"psql","command":["sh","-c","echo %s | base64 -d | sh"]}]}' "$B64")

echo "→ tarefa $TAREFA ($([ "$APLICAR" -eq 1 ] && echo 'APLICANDO' || echo 'simulação'))…" >&2

ARN=$(aws ecs run-task --region "$REGIAO" --cluster "$CLUSTER" \
  --task-definition "$TAREFA" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --overrides "$OV" --query 'tasks[0].taskArn' --output text)

ID="${ARN##*/}"
aws ecs wait tasks-stopped --region "$REGIAO" --cluster "$CLUSTER" --tasks "$ARN"
CODIGO=$(aws ecs describe-tasks --region "$REGIAO" --cluster "$CLUSTER" --tasks "$ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)

for _ in 1 2 3 4 5 6 7 8; do
  SAIDA=$(aws logs get-log-events --region "$REGIAO" --log-group-name "$GRUPO_LOG" \
    --log-stream-name "psql/psql/$ID" --start-from-head --query 'events[].message' --output text 2>/dev/null || true)
  [ -n "$SAIDA" ] && break
  sleep 3
done

printf '%s\n' "${SAIDA:-}" | tr '\t' '\n'
echo "[código de saída: $CODIGO]"
[ "$CODIGO" = "0" ] || exit 1
