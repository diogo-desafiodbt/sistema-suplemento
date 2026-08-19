#!/usr/bin/env bash
# Cria a identidade do vigia: senha gerada aqui, guardada no cofre, aplicada no
# banco. A senha NUNCA aparece na tela nem em arquivo versionado.
set -euo pipefail

REGIAO=us-east-1
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ 1/3 gerando senha (não será exibida)"
SENHA=$(python3 -c "import secrets,string; a=string.ascii_letters+string.digits; print(''.join(secrets.choice(a) for _ in range(40)))")

echo "→ 2/3 guardando em rds/VIGIA_PASSWORD"
aws secretsmanager create-secret --region $REGIAO \
  --name rds/VIGIA_PASSWORD --secret-string "$SENHA" >/dev/null 2>&1 \
  || aws secretsmanager put-secret-value --region $REGIAO \
       --secret-id rds/VIGIA_PASSWORD --secret-string "$SENHA" >/dev/null
echo "   guardada"

echo "→ 3/3 criando o papel e aplicando a senha no banco"
# O papel e os privilégios vêm do arquivo versionado; só a senha entra aqui.
{
  cat "$RAIZ/db/clinico/vigia-grants.sql"
  printf "\nALTER ROLE vigia WITH PASSWORD %s;\n" \
    "$(python3 -c "import sys; print(\"'\" + sys.argv[1].replace(\"'\",\"''\") + \"'\")" "$SENHA")"
  printf "\\\\echo '=== privilegios do vigia ==='\n"
  printf "SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type)\n"
  printf "FROM information_schema.role_table_grants WHERE grantee='vigia'\n"
  printf "GROUP BY table_name ORDER BY table_name;\n"
} | "$RAIZ/scripts/rodar-sql.sh" clinico -

echo ""
echo "pronto. A senha está só no Secrets Manager (rds/VIGIA_PASSWORD)."
