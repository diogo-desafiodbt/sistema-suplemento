# Prompt para o Cursor — Suporte por e-mail com triagem automática e resposta revisada no Admin

Nova funcionalidade: ler os e-mails que chegam em `suporte@desafiodiabetes.com`
(hospedado na Superdomínios — acesso só por IMAP/SMTP, sem API tipo
Gmail), identificar o cliente, buscar fatos reais no banco (frete,
pagamento) e preparar uma sugestão de resposta — mas **nada é enviado
automaticamente pro cliente, exceto um aviso genérico padrão**. Toda
resposta com conteúdo de verdade passa por revisão humana num painel novo
(`/admin/suporte`) antes de sair.

============================================================
PARTE 1 — Dependências e variáveis de ambiente
============================================================

1.1 — Instalar: `imapflow` (ler IMAP), `mailparser` (parsear MIME),
`nodemailer` (mandar por SMTP mantendo thread), `@anthropic-ai/sdk`
(classificação e redação da sugestão). Adicionar `@types/nodemailer` se
não vier com tipos.

1.2 — Novas variáveis em `.env.example` (comentadas, mesmo padrão das
seções existentes):
```
# -----------------------------------------------------------------------------
# Suporte por e-mail — Superdomínios (IMAP leitura / SMTP envio)
# Mesma caixa: suporte@desafiodiabetes.com
# -----------------------------------------------------------------------------
# SUPPORT_IMAP_HOST=
# SUPPORT_IMAP_PORT=993
# SUPPORT_IMAP_USER=suporte@desafiodiabetes.com
# SUPPORT_IMAP_PASSWORD=
# SUPPORT_SMTP_HOST=
# SUPPORT_SMTP_PORT=465
# SUPPORT_SMTP_USER=suporte@desafiodiabetes.com
# SUPPORT_SMTP_PASSWORD=
# SUPPORT_NOTIFY_EMAIL=  # quem recebe o lembrete de pendências a cada 12h

# -----------------------------------------------------------------------------
# Anthropic — classificação e redação de sugestão de resposta de suporte
# -----------------------------------------------------------------------------
# ANTHROPIC_API_KEY=
```
(As credenciais reais o Diogo vai preencher depois — o código deve
funcionar assim que elas existirem no ambiente, sem mais nenhuma mudança.)

============================================================
PARTE 2 — Migration: threads e mensagens de suporte
============================================================

```sql
CREATE TYPE support_thread_status AS ENUM (
  'novo',
  'aguardando_dados',
  'aguardando_revisao',
  'respondido'
);

CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_key text NOT NULL UNIQUE, -- Message-ID da 1ª mensagem da conversa
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
```

============================================================
PARTE 3 — Ingestão IMAP (job recorrente)
============================================================

Criar `src/lib/inngest/functions/support-inbox-poll.ts`, cron a cada 5
minutos (`triggers: [{ cron: '*/5 * * * *' }]`):

3.1 — Conectar via `imapflow` com `SUPPORT_IMAP_*`, abrir `INBOX`, buscar
mensagens `UNSEEN`.

3.2 — Para cada mensagem: parsear com `mailparser` (`from`, `subject`,
`text`, `messageId`, `inReplyTo`, `references`).

3.3 — Determinar a thread:
- Se `inReplyTo`/`references` bater com um `message_id` já salvo em
  `support_messages` → é continuação: usar o `thread_id` daquela
  mensagem.
- Senão → é conversa nova: criar linha em `support_threads` com
  `thread_key = messageId` (o Message-ID dessa própria mensagem),
  `from_email`, `subject`.

3.4 — Inserir a mensagem em `support_messages` (`direction: 'inbound'`),
atualizar `support_threads.last_message_at`.

3.5 — Marcar a mensagem como lida no IMAP (`\Seen`) — nunca deletar.

3.6 — Emitir `inngest.send({ name: 'suporte/email-recebido', data: { thread_id } })`
pra toda mensagem inbound (nova ou resposta numa thread existente) — a
Parte 4 decide o que fazer com isso.

============================================================
PARTE 4 — Aviso automático genérico + análise
============================================================

Criar `src/lib/inngest/functions/support-analyze.ts`, escutando
`suporte/email-recebido`:

4.1 — **Aviso automático (só uma vez por thread)**: se
`support_threads.auto_ack_sent_at IS NULL`, mandar por SMTP (ver Parte 5)
uma resposta padrão, sempre a mesma, pra **toda** thread nova:
> "Olá! Recebemos sua mensagem e nossa equipe já vai analisar. Pra
> agilizar e garantir que encontramos seu cadastro certinho, pode
> confirmar seu CPF e o e-mail usado na compra, por favor?"

Marcar `auto_ack_sent_at = now()` logo depois de enviar, pra nunca
repetir esse aviso na mesma thread (mesmo que a pessoa mande mais
mensagens depois).

4.2 — **Identificação do cliente**: tentar casar `from_email` (e
qualquer e-mail/CPF mencionado no corpo de qualquer mensagem da thread)
contra `users.email` / `users.cpf`. Se achar, gravar `user_id` na
thread.

4.3 — **Classificação + busca de fatos** (só roda se já tiver
`user_id`): usar o Anthropic SDK pra classificar a pergunta em `'frete'`,
`'pagamento'` ou `'fora_de_escopo'`, a partir do texto de todas as
mensagens da thread. Com a categoria:
- `'frete'`: buscar no banco (mesmas fontes já usadas no e-mail de
  novidade de frete e na página `/dashboard/pedidos/[id]`): status do
  pedido mais recente, `tracking_code`, último evento de
  `shipping_json.eventos`, previsão de entrega.
- `'pagamento'`: status do último pagamento, `plan_type`,
  `next_billing_at` ou `expires_at`.
- `'fora_de_escopo'`: não busca nada, só marca a categoria.

Salvar o que foi buscado em `support_threads.db_facts` (jsonb) —
isso é o que aparece no painel como "o que buscamos no banco".

4.4 — **Sugestão de resposta**: se achou fatos relevantes (`'frete'` ou
`'pagamento'` com dado encontrado), pedir ao Claude pra redigir uma
resposta em português, tom acolhedor e objetivo, **usando só os fatos
passados no prompt** (nunca inventar número/status) — salvar em
`support_threads.suggested_reply`. Se não achou nada ou é
`'fora_de_escopo'`, deixar `suggested_reply` como `null` (o painel mostra
campo vazio pro humano escrever do zero).

4.5 — Em qualquer um dos casos da 4.3/4.4, atualizar
`support_threads.status = 'aguardando_revisao'` (exceto se ainda não
identificou o `user_id` — nesse caso `status = 'aguardando_dados'`, e a
análise roda de novo automaticamente na próxima mensagem que chegar
nessa thread, já que toda mensagem nova dispara o evento de novo).

============================================================
PARTE 5 — Envio por SMTP (mantendo a thread)
============================================================

Criar `src/lib/support/mailer.ts` com `nodemailer`, usando
`SUPPORT_SMTP_*`:

```ts
export async function sendSupportEmail(params: {
  threadId: string
  toEmail: string
  subject: string
  bodyText: string
  inReplyToMessageId?: string
  referencesMessageIds: string[]
}): Promise<void>
```

- Assunto: `Re: ${subject original}` se for resposta, ou o assunto puro
  se for o aviso automático de abertura.
- Cabeçalhos `In-Reply-To` e `References` montados a partir do
  `message_id` da última mensagem inbound da thread (e do histórico
  completo de `references`), pra cair na mesma conversa na caixa do
  cliente.
- Depois de enviar: inserir em `support_messages`
  (`direction: 'outbound'`, `message_id` gerado pelo nodemailer),
  atualizar `support_threads.last_message_at`.
- Usado tanto pelo aviso automático (Parte 4.1) quanto pelo envio final
  aprovado no painel (Parte 6).

============================================================
PARTE 6 — Painel `/admin/suporte`
============================================================

6.1 — Adicionar aba "Suporte" em `src/components/admin/AdminNav.tsx`
(`{ label: 'Suporte', href: '/admin/suporte' }`).

6.2 — Criar `src/app/(admin)/admin/suporte/page.tsx`: lista as threads
com `status IN ('aguardando_revisao', 'aguardando_dados')` primeiro (as
`'respondido'` ficam num histórico abaixo ou atrás de um toggle). Cada
item mostra:
- E-mail original e histórico de mensagens da thread (`support_messages`
  em ordem cronológica).
- **O que foi buscado no banco** (`db_facts`, formatado de forma legível
  — não jogar o JSON cru na tela).
- **Mensagem sugerida** num campo de texto editável, pré-preenchido com
  `suggested_reply` (vazio se não houver sugestão).
- Botão "Enviar" — chama uma API route nova
  (`src/app/api/admin/suporte/[id]/responder/route.ts`, com o mesmo
  padrão de autenticação admin já usado em
  `admin/pedidos/[id]/atualizar-rastreio/route.ts`) que pega o texto
  (editado ou não) e chama `sendSupportEmail`, marca
  `support_threads.status = 'respondido'` e `reviewed_by = <admin
  logado>`.

============================================================
PARTE 7 — Lembrete de pendências (12h)
============================================================

Criar `src/lib/inngest/functions/support-pending-reminder.ts`, cron a
cada 12h (`0 */12 * * *`): conta threads com `status IN
('aguardando_revisao', 'aguardando_dados')`, e se houver pelo menos 1,
manda 1 e-mail (via Resend, é interno — não precisa ser pela caixa de
suporte) pra `SUPPORT_NOTIFY_EMAIL` avisando "Você tem N pendência(s) em
Suporte" com link pra `/admin/suporte`. Registrar tudo (as 3 novas
funções) em `src/app/api/inngest/route.ts`.

============================================================
NOTAS
============================================================

- O aviso automático da Parte 4.1 é **sempre o mesmo texto**, dispara
  uma vez por thread nova, não depende de identificar o cliente antes —
  é a única coisa que sai sem revisão humana nessa funcionalidade.
- Nenhuma resposta com conteúdo (frete, pagamento, ou qualquer outra)
  sai sem alguém dar o check no painel.
- Ainda faltam as credenciais reais (IMAP/SMTP da Superdomínios e a
  chave da Anthropic) antes de testar de ponta a ponta — o código deve
  ficar pronto pra funcionar assim que elas forem preenchidas no
  ambiente.
- Testar especificamente: (1) thread nova → recebe só o aviso genérico;
  (2) pessoa responde com CPF → sistema identifica e gera sugestão; (3)
  pergunta fora de escopo → vai pro painel com campo vazio; (4) resposta
  do admin no painel cai como "Re:" na mesma conversa do cliente (não
  como e-mail novo).
