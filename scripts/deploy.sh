#!/usr/bin/env bash
# Publica o sistema-suplemento: empacota o fonte, manda pro S3, o CodeBuild
# constrói a imagem ARM e o ECS sobe a versão nova.
#
# O build roda na nuvem de propósito: o Docker Desktop local derrubou o daemon
# duas vezes no meio do `next build` (a máquina tem 8 GB e vive em swap).
set -euo pipefail

cd "$(dirname "$0")/.."

BUCKET="${BUCKET:-desafiodiabetes-builds}"
CLUSTER="${CLUSTER:-desafiodiabetes}"
SERVICO="${SERVICO:-sistema-suplemento}"
PROJETO="${PROJETO:-sistema-suplemento}"

echo "→ empacotando o código-fonte"
# Apagar antes é obrigatório: o `zip` ACRESCENTA a um arquivo existente em vez
# de substituí-lo. Sem isto, arquivos apagados ou movidos desde o último envio
# continuam dentro do pacote, e o CodeBuild compila código que já não existe
# aqui — foi assim que o caminho anterior à mudança para /suplementos quebrou
# um build depois de o build local passar.
rm -f /tmp/sistema-source.zip
zip -qr /tmp/sistema-source.zip . \
  -x '*.git/*' 'node_modules/*' '.next/*' '*.zip' '.env*' '__pycache__/*'

echo "  $(du -h /tmp/sistema-source.zip | cut -f1)"

echo "→ enviando pro S3"
aws s3 cp /tmp/sistema-source.zip "s3://$BUCKET/sistema/source.zip" --only-show-errors

echo "→ construindo a imagem"
BUILD=$(aws codebuild start-build --project-name "$PROJETO" --query 'build.id' --output text)
while true; do
  STATUS=$(aws codebuild batch-get-builds --ids "$BUILD" \
    --query 'builds[0].buildStatus' --output text)
  printf "\r  %s   " "$STATUS"
  [ "$STATUS" != "IN_PROGRESS" ] && break
  sleep 15
done
echo ""

if [ "$STATUS" != "SUCCEEDED" ]; then
  echo "build falhou — o erro de compilação está no log:"
  FLUXO=$(aws codebuild batch-get-builds --ids "$BUILD" \
    --query 'builds[0].logs.streamName' --output text)
  aws logs get-log-events --log-group-name "/aws/codebuild/$PROJETO" \
    --log-stream-name "$FLUXO" --start-from-head --query 'events[].message' \
    --output text | grep -iE "type error|error:|failed to compile|^\./src" | head -10
  exit 1
fi

echo "→ subindo no ECS"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICO" \
  --force-new-deployment --query 'service.serviceName' --output text > /dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICO"

echo "pronto"
