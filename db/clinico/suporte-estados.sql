-- Entrega 1 do suporte com IA: estados da conversa e contagem de
-- respostas automáticas. Não executar daqui — o Diogo roda.
--
-- Valores antigos (novo, aguardando_dados, respondido) ficam no enum
-- para as linhas que já existem. Código novo grava os estados da tabela.

ALTER TYPE public.support_thread_status ADD VALUE IF NOT EXISTS 'nova';
ALTER TYPE public.support_thread_status ADD VALUE IF NOT EXISTS 'com_ia';
ALTER TYPE public.support_thread_status ADD VALUE IF NOT EXISTS 'com_suporte';
ALTER TYPE public.support_thread_status ADD VALUE IF NOT EXISTS 'encerrada';

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS respostas_automaticas_ia integer NOT NULL DEFAULT 0;

-- A triagem desta entrega precisa de onde gravar. Entrega 2 reusa a coluna.
ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS triagem_ia jsonb;

INSERT INTO public.system_config (key, value, description)
SELECT
  'support_imap_last_uid',
  '0',
  'Maior UID IMAP já processado pelo poll de suporte'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_config WHERE key = 'support_imap_last_uid'
);
