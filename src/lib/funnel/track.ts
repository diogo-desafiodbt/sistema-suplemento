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

export type FunnelEventType =
  | 'quiz_started'
  | 'quiz_completed'
  | 'quiz_eligible'
  | 'checkout_started'

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
