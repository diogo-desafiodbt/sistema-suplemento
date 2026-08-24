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
# Os TRÊS serviços rodam a mesma tag :latest. Atualizar só o núcleo deixa a
# entrada e o portal na imagem velha — e o portal é quem serve as telas do
# paciente, então correção de tela some sem ninguém entender por quê.
# Aconteceu em 21/08/2026. `SERVICOS` aceita sobrescrita para subir um só.
SERVICOS="${SERVICOS:-sistema-suplemento sistema-entrada sistema-portal}"
PROJETO="${PROJETO:-sistema-suplemento}"
REGIAO="${REGIAO:-us-east-1}"

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

echo "→ subindo no ECS ($SERVICOS)"
# Quando o serviço tem taskdef versionada, ela é a fonte da verdade: registra
# uma revisão a partir do arquivo e aponta o serviço para ela.
#
# Antes daqui, isto era `--force-new-deployment` puro, que troca a imagem e
# mantém a revisão antiga. Resultado em 24/08/2026: o SUPPORT_IMAP_HOST foi
# criado no Secrets Manager, mas registrar a revisão nova não bastava — sem
# alguém apontar o serviço à mão, o contêiner continuava sem a variável. O
# poll de suporte rodou por dias sem ler um e-mail. Registrar não é apontar.
for S in $SERVICOS; do
  ARQUIVO="db/aws/$S-taskdef.json"
  if [ -f "$ARQUIVO" ]; then
    REV=$(aws ecs register-task-definition --region "$REGIAO" \
      --cli-input-json "file://$ARQUIVO" \
      --query 'taskDefinition.revision' --output text)
    aws ecs update-service --region "$REGIAO" --cluster "$CLUSTER" --service "$S" \
      --task-definition "$S:$REV" --query 'service.serviceName' --output text > /dev/null
    echo "  $S → revisão $REV (de $ARQUIVO)"
  else
    aws ecs update-service --region "$REGIAO" --cluster "$CLUSTER" --service "$S" \
      --force-new-deployment --query 'service.serviceName' --output text > /dev/null
    echo "  $S → imagem nova, revisão inalterada (sem taskdef versionada)"
  fi
done
# Espera todos: se um subir e outro não, ficam versões diferentes atendendo
# caminhos diferentes do mesmo site.
aws ecs wait services-stable --region "$REGIAO" --cluster "$CLUSTER" --services $SERVICOS

echo "→ re-sincronizando o Inngest"
# Sem isto, o Inngest continua com o registro anterior até alguém provocar.
# Foi o que deixou os 13 jobs parados de 16/08 a 19/08.
# Mesma origem que getAppBaseUrl() — não inventar host.
# A fonte de verdade é o Secrets Manager: é de lá que a produção lê. O
# .env.local da máquina de desenvolvimento nem sempre tem a variável, e quando
# tem costuma ser localhost — que não serve para registrar no Inngest.
if [ -z "${NEXT_PUBLIC_APP_URL:-}" ]; then
  NEXT_PUBLIC_APP_URL=$(aws secretsmanager get-secret-value \
    --region "$REGIAO" --secret-id sistema/NEXT_PUBLIC_APP_URL \
    --query SecretString --output text 2>/dev/null || true)
fi
APP_BASE="${NEXT_PUBLIC_APP_URL:-}"
APP_BASE="${APP_BASE%/}"
if [ -z "$APP_BASE" ]; then
  echo "   AVISO: NEXT_PUBLIC_APP_URL ausente — rode o PUT em /api/inngest à mão antes de confiar nos jobs"
else
  curl -sS -X PUT "$APP_BASE/api/inngest" || \
    echo "   AVISO: a re-sincronização falhou — rode à mão antes de confiar nos jobs"
fi

echo "pronto"
