-- Registro de leitura das ferramentas de suporte. Não executar daqui.

CREATE TABLE IF NOT EXISTS public.support_access_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  user_id    uuid,
  ator       text NOT NULL,
  ferramenta text NOT NULL,
  campos     text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_access_log_thread_created_idx
  ON public.support_access_log (thread_id, created_at DESC);

-- Quem escreve aqui é o núcleo, com `app_web` — é ele que roda as ferramentas
-- e o painel. `service_role` era papel da Supabase e não existe no RDS; a
-- concessão original falhava em silêncio depois de a tabela já existir.
--
-- Sem DELETE nem UPDATE de propósito: registro de acesso que pode ser alterado
-- não serve para responder o que foi acessado depois de um incidente.
--
-- O REVOKE antes do GRANT é obrigatório: existia concessão ampla de UPDATE
-- vinda de outro lugar, e conceder estreito por cima não tira o que já estava
-- lá. Mesma armadilha do `users.cpf` em agosto.
REVOKE ALL ON public.support_access_log FROM app_web;
GRANT SELECT, INSERT ON public.support_access_log TO app_web;
