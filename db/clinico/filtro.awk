# Tira do dump o que não atravessa para o RDS:
#   - RLS inteiro (políticas + ENABLE), decisão de 15/08
#   - prevent_role_escalation (usa auth.role) e seu gatilho
#   - match_transcription_chunks (usa extensions.vector, é de conteúdo)
#   - rls_auto_enable (ligaria RLS sozinho em tabela nova)
#   - CREATE SCHEMA public / COMMENT ON SCHEMA public (já existem)
#
# Statement de uma linha só termina nela mesma — não entrar em modo de pular,
# senão come a linha seguinte.

function inicia(m) {
  if (m == "func") { pulando = 1; modo = "func"; return }
  if ($0 ~ /;[ \t]*$/) return          # acabou na própria linha
  pulando = 1; modo = "stmt"
}

BEGIN { pulando = 0; modo = "" }

pulando && modo == "stmt" { if ($0 ~ /;[ \t]*$/)      { pulando = 0 } next }
pulando && modo == "func" { if ($0 ~ /^\$\$;[ \t]*$/) { pulando = 0 } next }

/^CREATE SCHEMA public;/                           { next }
/ENABLE ROW LEVEL SECURITY/                        { next }
/^COMMENT ON SCHEMA public/                        { inicia("stmt"); next }
/^CREATE POLICY/                                   { inicia("stmt"); next }
/^CREATE TRIGGER trg_prevent_role_escalation/      { inicia("stmt"); next }
/^CREATE FUNCTION public\.prevent_role_escalation/    { inicia("func"); next }
/^CREATE FUNCTION public\.match_transcription_chunks/ { inicia("func"); next }
/^CREATE FUNCTION public\.rls_auto_enable/            { inicia("func"); next }

{ print }
