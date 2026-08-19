#!/usr/bin/env bash
# Confere se o deploy realmente entregou — não só se o contêiner subiu.
#
# Existe por causa de 19/08/2026: os 13 jobs do Inngest ficaram parados de 16 a
# 19/08 e TODAS as verificações óbvias passavam. Serviço estável, páginas
# respondendo, zero erro no log. O que estava morto era o que não acontecia.
#
# Uso: ./scripts/conferir-deploy.sh   (depois de deploy.sh)
set -uo pipefail

REGIAO="${REGIAO:-us-east-1}"
CLUSTER="${CLUSTER:-desafiodiabetes}"
SERVICO="${SERVICO:-sistema-suplemento}"
BASE="${BASE:-https://desafiodiabetes.com}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

FALHAS=0

# rodar-sql.sh devolve saída tabulada com cabeçalho e contagem de linhas.
# Extrair só o número exige varrer todos os campos, não casar a linha inteira.
contar() {
  "$RAIZ/scripts/rodar-sql.sh" clinico -c "$1" 2>/dev/null \
    | tr '\t' '\n' | tr -d ' ' | grep -E '^[0-9]+$' | tail -1
}

ok()    { echo "  ✓ $1"; }
falha() { echo "  ✗ $1"; echo "     → $2"; FALHAS=$((FALHAS+1)); }

echo "1/5 serviço estabilizou?"
if aws ecs wait services-stable --region "$REGIAO" --cluster "$CLUSTER" --services "$SERVICO" 2>/dev/null; then
  REV=$(aws ecs describe-services --region "$REGIAO" --cluster "$CLUSTER" --services "$SERVICO" \
        --query 'services[0].taskDefinition' --output text | sed 's|.*/||')
  ok "estável em $REV"
else
  falha "não estabilizou" "aws ecs describe-services --cluster $CLUSTER --services $SERVICO"
fi

echo "2/5 arrancou sem erro?"
FLUXO=$(aws logs describe-log-streams --region "$REGIAO" --log-group-name "/ecs/$SERVICO" \
  --order-by LastEventTime --descending --max-items 1 \
  --query 'logStreams[0].logStreamName' --output text 2>/dev/null | head -1)
ERROS=$(aws logs get-log-events --region "$REGIAO" --log-group-name "/ecs/$SERVICO" \
  --log-stream-name "$FLUXO" --start-from-head --limit 40 \
  --query 'events[].message' --output text 2>/dev/null | grep -ciE "error|precisa estar definida" || true)
[ "${ERROS:-0}" -eq 0 ] && ok "arranque limpo" \
  || falha "$ERROS linha(s) de erro no arranque" "ver /ecs/$SERVICO, fluxo $FLUXO"

echo "3/5 as páginas respondem?"
for P in /suplementos /api/products; do
  CODIGO=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$P")
  [ "$CODIGO" = "200" ] && ok "$P ($CODIGO)" || falha "$P devolveu $CODIGO" "curl -v $BASE$P"
done

echo "4/5 os jobs voltaram? (espera até 7 min pelo poll de 5 em 5)"
# ESTA é a verificação que teria pego o incidente de 19/08. As três de cima
# passavam com os 13 jobs mortos.
DESDE=$(date -u -v-2M '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -d '2 minutes ago' '+%Y-%m-%d %H:%M:%S')
ACHOU=0
for _ in 1 2 3 4 5 6 7; do
  N=$(contar "SELECT count(*) FROM background_jobs WHERE started_at > timestamptz '$DESDE';")
  if [ "${N:-0}" -gt 0 ]; then ACHOU=1; ok "$N execução(ões) registrada(s) desde o deploy"; break; fi
done
[ "$ACHOU" -eq 1 ] || falha "nenhum job registrou execução" \
  "curl -X PUT $BASE/api/inngest  — o registro no Inngest pode ter se perdido"

echo "5/5 o vigia achou algo novo?"
NOVOS=$(contar "SELECT count(*) FROM alertas WHERE resolvido_em IS NULL AND visto_em > now() - interval '15 minutes';")
[ "${NOVOS:-0}" -eq 0 ] && ok "nenhum alerta novo" \
  || falha "${NOVOS} alerta(s) novo(s) desde o deploy" "./scripts/rodar-sql.sh clinico db/vigia/02-rodar.sql"

echo ""
[ "$FALHAS" -eq 0 ] && echo "deploy conferido: tudo certo." \
  || { echo "$FALHAS verificação(ões) falharam."; exit 1; }
