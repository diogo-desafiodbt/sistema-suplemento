// Identidade anônima do visitante.
//
// Era `sessionStorage`, que morre quando a aba fecha. Quem via um vídeo, fazia
// o quiz, fechava o navegador e voltava no dia seguinte para comprar voltava
// como outra pessoa — e o vídeo nunca receberia crédito pela venda.
//
// Agora é cookie de um ano no domínio pai. O domínio pai importa: o
// redirecionador de links vai morar em `l.desafiodiabetes.com`, e um cookie
// gravado só no subdomínio não seria lido aqui. Sem isso, quem clica no link
// chega ao site como desconhecido e a costura de identidade não acontece.

const NOME = 'dd_visitante'
const UM_ANO = 60 * 60 * 24 * 365

/** `.desafiodiabetes.com` em produção; nada em localhost, que não aceita ponto. */
function dominio(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host === 'localhost' || /^[\d.]+$/.test(host)) return ''
  const partes = host.split('.')
  const base = partes.slice(-2).join('.')
  return `; domain=.${base}`
}

function lerCookie(nome: string): string | null {
  if (typeof document === 'undefined') return null
  for (const parte of document.cookie.split(';')) {
    const t = parte.trim()
    if (t.startsWith(`${nome}=`)) return decodeURIComponent(t.slice(nome.length + 1))
  }
  return null
}

/**
 * O identificador do navegador, criado na primeira visita.
 *
 * Continua migrando quem já tinha um id em `sessionStorage`: sem isso, quem
 * está com o site aberto no momento do deploy vira uma pessoa nova e a sessão
 * dele se parte em duas.
 */
export function idDoVisitante(): string {
  if (typeof window === 'undefined') return ''

  const doCookie = lerCookie(NOME)
  if (doCookie) return doCookie

  const antigo = sessionStorage.getItem('funnel_session_id')
  const id = antigo ?? crypto.randomUUID()

  // `Secure` fora de localhost, que não tem https.
  const seguro = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${NOME}=${encodeURIComponent(id)}; path=/; max-age=${UM_ANO}` +
    `${dominio()}; SameSite=Lax${seguro}`

  return id
}

export type FunnelEventType =
  | 'visita'
  | 'quiz_started'
  | 'quiz_completed'
  | 'quiz_eligible'
  | 'checkout_started'

/** Best-effort — nunca bloqueia nem quebra o fluxo do usuário se falhar. */
export function trackFunnelEvent(eventType: FunnelEventType): void {
  const sessionId = idDoVisitante()
  if (!sessionId) return
  fetch('/api/funnel/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, event_type: eventType }),
  }).catch(() => {})
}
