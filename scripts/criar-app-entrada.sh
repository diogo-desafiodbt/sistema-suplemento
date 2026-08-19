#!/usr/bin/env bash
# Cria a identidade da Zona 0-E. A senha nunca aparece na tela nem em arquivo.
set -euo pipefail
REGIAO="${REGIAO:-us-east-1}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ 1/4 gerando senha (não será exibida)"
SENHA=$(python3 -c "import secrets,string; a=string.ascii_letters+string.digits; print(''.join(secrets.choice(a) for _ in range(40)))")

echo "→ 2/4 guardando em rds/APP_ENTRADA_PASSWORD"
aws secretsmanager create-secret --region $REGIAO \
  --name rds/APP_ENTRADA_PASSWORD --secret-string "$SENHA" >/dev/null 2>&1 \
  || aws secretsmanager put-secret-value --region $REGIAO \
       --secret-id rds/APP_ENTRADA_PASSWORD --secret-string "$SENHA" >/dev/null

echo "→ 3/4 criando o papel e aplicando os privilégios"
{
  cat "$RAIZ/db/clinico/app-entrada-grants.sql"
  printf "\nALTER ROLE app_entrada WITH PASSWORD %s;\n" \
    "$(python3 -c "import sys; print(\"'\" + sys.argv[1].replace(\"'\",\"''\") + \"'\")" "$SENHA")"
} | "$RAIZ/scripts/rodar-sql.sh" clinico -

echo "→ 4/4 guardando a DATABASE_URL do serviço de entrada"
HOST=desafiodiabetes.c0fsqek8ykxr.us-east-1.rds.amazonaws.com
URL="postgresql://app_entrada:$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$SENHA")@${HOST}:5432/clinico"
aws secretsmanager create-secret --region $REGIAO \
  --name sistema/DATABASE_URL_ENTRADA --secret-string "$URL" >/dev/null 2>&1 \
  || aws secretsmanager put-secret-value --region $REGIAO \
       --secret-id sistema/DATABASE_URL_ENTRADA --secret-string "$URL" >/dev/null

echo ""
echo "pronto. Senha só no cofre. Nenhum roteamento mudou ainda."
