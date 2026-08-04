# Prompt para o Cursor — Corrigir erro no Cliente 360 + performance geral do banco

Duas frentes nesta leva: (1) bug real que quebra a página Admin > Clientes >
detalhe do cliente; (2) causa provável da lentidão relatada por vários
usuários — praticamente toda política de segurança (RLS) do banco reavalia
autenticação linha por linha em vez de uma vez por consulta.

============================================================
PARTE 1 — Bug: Cliente 360 quebra ao carregar quiz_responses/notification_logs
============================================================

Em `src/app/(admin)/admin/clientes/[id]/page.tsx` (linhas ~264 e ~266), duas
consultas usam `.order('created_at', ...)` em tabelas que não têm essa
coluna:
- `quiz_responses` tem `completed_at`, não `created_at`.
- `notification_logs` tem `sent_at`, não `created_at`.

Isso faz as duas consultas retornarem erro 400 sempre que a página é aberta
(confirmado nos logs do Supabase — acontece em toda visita a essa tela,
para qualquer cliente). Corrigir:

```ts
admin.from('quiz_responses').select('*').eq('user_id', id).order('completed_at', { ascending: false }),
// ...
admin.from('notification_logs').select('*').eq('user_id', id).order('sent_at', { ascending: false }).limit(20),
```

============================================================
PARTE 2 — Performance: políticas RLS reavaliando auth por linha
============================================================

Praticamente toda tabela do sistema (professionals, addresses,
quiz_responses, protocols, protocol_items, subscriptions, payments, orders,
order_items, users, health_records, content_access, notification_logs,
nps_responses, user_login_history, user_rfm_scores, background_jobs,
prescription_audit_logs) tem política RLS escrita com `auth.uid()` (ou
`auth.<function>()`) direto na condição — isso faz o Postgres reavaliar
quem é o usuário autenticado **para cada linha** da tabela em vez de uma
vez por consulta. Efeito: toda ação do sistema fica mais lenta conforme os
dados crescem — é a causa mais provável dos relatos de lentidão.

Migration nova: para cada política afetada, recriar substituindo
`auth.<function>()` por `(select auth.<function>())` — mesmo efeito de
segurança (quem pode acessar o quê não muda), só muda a forma de execução.

2.1 — Primeiro, gerar a lista exata de políticas afetadas e seu SQL atual:
```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

2.2 — Para cada política que contém `auth.uid()` ou `auth.jwt()` (ou
qualquer `auth.*()`) sem estar envolvida em `(select ...)`, gerar um
`DROP POLICY` + `CREATE POLICY` idêntico, só trocando essa parte. Exemplo
do padrão (a política real de cada tabela pode ter nome/condição
diferentes — usar o resultado da consulta acima como fonte da verdade, não
adivinhar):
```sql
-- Antes (exemplo):
-- CREATE POLICY quiz_own ON quiz_responses FOR SELECT USING (user_id = auth.uid());

-- Depois:
DROP POLICY IF EXISTS quiz_own ON quiz_responses;
CREATE POLICY quiz_own ON quiz_responses FOR SELECT
  USING (user_id = (select auth.uid()));
```
Repetir para todas as ~19 tabelas listadas pela consulta 2.1, preservando
exatamente o mesmo `cmd` (SELECT/INSERT/UPDATE/ALL) e a mesma lógica de
cada política — só envolvendo a chamada de `auth.*()` em `(select ...)`.

2.3 — Índices faltando em chaves estrangeiras (impacto menor que o RLS
agora, mas cresce junto com os dados — corrigir junto já que é barato):
```sql
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_subscription_id ON public.orders (subscription_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_order_dispatch_logs_order_id ON public.pharmacy_order_dispatch_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_protocol_creation_locks_protocol_id ON public.protocol_creation_locks (protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_items_product_id ON public.protocol_items (product_id);
CREATE INDEX IF NOT EXISTS idx_protocols_quiz_response_id ON public.protocols (quiz_response_id);
CREATE INDEX IF NOT EXISTS idx_protocols_signed_by ON public.protocols (signed_by);
CREATE INDEX IF NOT EXISTS idx_subscriptions_protocol_id ON public.subscriptions (protocol_id);
CREATE INDEX IF NOT EXISTS idx_support_threads_reviewed_by ON public.support_threads (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_support_threads_user_id ON public.support_threads (user_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_subscription_id ON public.terms_acceptances (subscription_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user_id ON public.terms_acceptances (user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_source_payment_id ON public.user_entitlements (source_payment_id);
```

============================================================
NOTAS
============================================================

- A Parte 1 é código de aplicação (Cursor aplica direto no repo).
- A Parte 2 é migration de banco — Cursor **gera o SQL exato** rodando a
  consulta 2.1 primeiro (o schema real pode ter nuances que este prompt não
  cobre por não ter acesso ao SQL completo de cada política agora), mas
  **não aplica no Supabase** — só escreve o arquivo de migration. O Diogo
  aplica depois de revisar.
- Depois de aplicado: rodar `select * from pg_policies where schemaname =
  'public'` de novo e confirmar que nenhuma política ficou com
  `auth.uid()`/`auth.jwt()` fora de um `(select ...)`.
- Não precisa alterar nenhum comportamento de acesso — é otimização pura de
  como a mesma regra é calculada.
