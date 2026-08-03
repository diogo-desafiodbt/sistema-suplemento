-- Threads e mensagens de suporte por e-mail (IMAP → revisão humana → SMTP).

CREATE TYPE support_thread_status AS ENUM (
  'novo',
  'aguardando_dados',
  'aguardando_revisao',
  'respondido'
);

CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_key text NOT NULL UNIQUE,
  from_email text NOT NULL,
  subject text,
  user_id uuid REFERENCES public.users(id),
  status support_thread_status NOT NULL DEFAULT 'novo',
  db_facts jsonb,
  suggested_reply text,
  auto_ack_sent_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_id text NOT NULL UNIQUE,
  in_reply_to text,
  from_email text,
  to_email text,
  body_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.support_messages (thread_id);

GRANT SELECT, INSERT, UPDATE ON public.support_threads TO service_role;
GRANT SELECT, INSERT ON public.support_messages TO service_role;
