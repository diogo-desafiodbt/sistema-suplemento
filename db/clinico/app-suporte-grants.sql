-- Papel do suporte com IA.
--
-- As ferramentas de `src/lib/support/tools.ts` rodavam com `app_web`, que
-- alcança o prontuário inteiro. Nenhuma delas lê protocolo, quiz ou registro
-- de saúde — mas isso era garantia de código, não de permissão: uma ferramenta
-- nova mal escrita, ou um SELECT ampliado por conveniência, passaria sem nada
-- barrar. E o que essas ferramentas devolvem sai da AWS para a API da
-- Anthropic, o que torna a diferença entre "não acessa" e "não pode acessar"
-- a única que importa.
--
-- Seis tabelas, só leitura. As vendas da Hotmart e o catálogo de aulas vêm do
-- banco `conteudo`, que já é outro banco com outro papel (`app_conteudo`) —
-- por isso não aparecem aqui.

-- (já criado; o script é idempotente a partir daqui)
-- CREATE ROLE app_suporte LOGIN;
GRANT rds_iam TO app_suporte;
GRANT USAGE ON SCHEMA public TO app_suporte;

GRANT SELECT ON public.users TO app_suporte;
GRANT SELECT ON public.orders TO app_suporte;
GRANT SELECT ON public.payments TO app_suporte;
GRANT SELECT ON public.subscriptions TO app_suporte;
GRANT SELECT ON public.user_entitlements TO app_suporte;
GRANT SELECT ON public.products TO app_suporte;

-- O que fica de fora, de propósito e por escrito: protocols, protocol_items,
-- quiz_responses, health_records, prescription_audit_logs. Se uma ferramenta
-- nova tentar, o banco recusa.

-- Mesmo esquecimento do papel de marketing: `USAGE` no schema não dá `CONNECT`
-- no banco.
GRANT CONNECT ON DATABASE clinico TO app_suporte;
