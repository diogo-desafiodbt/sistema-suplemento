# Prompt para o Cursor — Corrigir o funil de etapas da tela inicial do Admin

Hoje o funil em `/admin` (primeiros 3 passos) está errado de raiz:
- "Quiz iniciado" conta `quiz_sessions`, tabela morta — nenhum código grava
  nela desde a unificação da triagem clínica. Sempre mostra 0.
- "Quiz concluído" conta `quiz_responses`, mas essa tabela só recebe linha
  **depois do pagamento confirmado** (dentro de `ensureProtocolAfterPayment`)
  — não mede quem terminou o questionário, mede quem já pagou.
- "Checkout iniciado" conta `terms_acceptances`, gravada só perto do fim do
  checkout (aceite dos termos) — mede "checkout concluído", não "iniciado".

Esta tarefa cria instrumentação de verdade pros 3 eventos, independente de
pagamento, e reescreve o funil pra usar essa fonte nova.

============================================================
PARTE 1 — Tabela de eventos do funil
============================================================

Migration nova:
```sql
CREATE TYPE funnel_event_type AS ENUM (
  'quiz_started',
  'quiz_completed',
  'checkout_started'
);

CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type funnel_event_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, event_type)
);

GRANT SELECT, INSERT ON public.funnel_events TO service_role;

-- quiz_sessions nunca mais é escrita por nenhum código (confirmado) — descarta.
DROP TABLE IF EXISTS public.quiz_sessions;
```

============================================================
PARTE 2 — Helper client-side compartilhado
============================================================

Criar `src/lib/funnel/track.ts`:

```ts
const SESSION_KEY = 'funnel_session_id'

function getFunnelSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export type FunnelEventType = 'quiz_started' | 'quiz_completed' | 'checkout_started'

/** Best-effort — nunca bloqueia nem quebra o fluxo do usuário se falhar. */
export function trackFunnelEvent(eventType: FunnelEventType): void {
  const sessionId = getFunnelSessionId()
  if (!sessionId) return
  fetch('/api/funnel/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, event_type: eventType }),
  }).catch(() => {})
}
```

============================================================
PARTE 3 — API route de registro
============================================================

Criar `src/app/api/funnel/track/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_TYPES = ['quiz_started', 'quiz_completed', 'checkout_started']

export async function POST(request: NextRequest) {
  try {
    const { session_id, event_type } = await request.json()
    if (
      typeof session_id !== 'string' || !session_id ||
      !VALID_TYPES.includes(event_type)
    ) {
      return NextResponse.json({ error: 'payload inválido' }, { status: 400 })
    }

    const admin = createAdminClient()
    await admin
      .from('funnel_events')
      .upsert(
        { session_id, event_type },
        { onConflict: 'session_id,event_type', ignoreDuplicates: true }
      )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('funnel/track error:', error)
    return NextResponse.json({ ok: true }) // best-effort — não expõe erro ao cliente
  }
}
```

`upsert` com `ignoreDuplicates: true` garante que reentrar na mesma sessão
(voltar pra trás, recarregar a página) nunca conta duas vezes — a constraint
`UNIQUE (session_id, event_type)` faz o trabalho.

============================================================
PARTE 4 — Disparar nos 3 pontos certos
============================================================

4.1 — `src/app/(public)/quiz/page.tsx`: no `useEffect` de montagem do
componente (o que já existe pra avaliar o carrinho — reaproveitar esse ou
adicionar um novo `useEffect(() => { trackFunnelEvent('quiz_started') },
[])`), disparar uma vez ao entrar na tela — vale tanto pra quem chega com
carrinho vazio quanto cheio, os dois passam por `/quiz`.

4.2 — Ainda em `quiz/page.tsx`, na função que finaliza a triagem (onde
`computeTriage(...)` é chamado): disparar `trackFunnelEvent('quiz_completed')`
logo depois do resultado do `computeTriage` ser calculado — **antes** de
checar se é bloqueado ou não. "Quiz concluído" significa que a pessoa
terminou de responder todas as perguntas, independente do resultado
(bloqueado por idade também conta como concluído — ela terminou o
questionário, só não pôde prosseguir).

4.3 — `src/app/(public)/checkout/page.tsx`: no primeiro `useEffect` de
montagem do componente, disparar `trackFunnelEvent('checkout_started')`
uma vez ao entrar na tela.

Importar `trackFunnelEvent` de `@/lib/funnel/track` nos dois arquivos.

============================================================
PARTE 5 — Reescrever a fonte de dados do funil no admin
============================================================

Em `src/app/(admin)/admin/page.tsx`, trocar as 3 primeiras consultas do
`Promise.all` (linhas ~154-158, hoje batendo em `quiz_sessions`,
`quiz_responses`, `terms_acceptances`) por consultas em `funnel_events`
filtrando por `event_type`:

```ts
countRows(admin, 'funnel_events', q => {
  let next = q.eq('event_type', 'quiz_started')
  if (since) next = next.gte('created_at', since)
  return next
}),
countRows(admin, 'funnel_events', q => {
  let next = q.eq('event_type', 'quiz_completed')
  if (since) next = next.gte('created_at', since)
  return next
}),
countRows(admin, 'funnel_events', q => {
  let next = q.eq('event_type', 'checkout_started')
  if (since) next = next.gte('created_at', since)
  return next
}),
```

O restante do `Promise.all` (pagamento, prescrição, farmácia, despacho,
entrega) e a montagem de `rawSteps`/`funnel` não mudam — só a origem dos
3 primeiros números.

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final.
- Como o funil é zerado (tabela nova), os números de "Quiz iniciado" /
  "Quiz concluído" / "Checkout iniciado" vão começar do zero a partir do
  deploy — isso é esperado, não tem como recuperar retroativamente o que já
  aconteceu antes (nunca foi registrado corretamente).
- Testar o fluxo completo (entrar no quiz, responder, chegar no checkout) e
  conferir no admin (`/admin?periodo=all`) que os 3 números aparecem.
