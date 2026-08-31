import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { nomeNeutro, registrar } from '@/lib/rastro/registrar'

const VALID_TYPES = [
  'quiz_started',
  'quiz_completed',
  'quiz_eligible',
  'checkout_started',
  // `visita` só existe no Rastro: é o primeiro passo, e é ele que carrega a
  // origem. Não entra em `funnel_events`, que conta etapas de quiz.
  'visita',
]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const { session_id, event_type } = await request.json()
    if (
      typeof session_id !== 'string' ||
      !UUID_RE.test(session_id) ||
      !VALID_TYPES.includes(event_type)
    ) {
      return NextResponse.json({ error: 'payload inválido' }, { status: 400 })
    }

    if (event_type !== 'visita') {
      await getSql()`
        INSERT INTO funnel_events (session_id, event_type)
        VALUES (${session_id}::uuid, ${event_type})
      `
    }

    // O mesmo passo entra no Rastro com nome neutro. As duas tabelas convivem
    // de propósito: `funnel_events` é a contagem que já existe e alimenta os
    // números de hoje; o Rastro é o que liga o passo a uma pessoa e a uma
    // origem. Quando o Rastro estiver respondendo tudo, a primeira sai.
    const neutro = nomeNeutro(event_type)
    if (neutro) await registrar(session_id, neutro)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('funnel/track error:', error)
    return NextResponse.json({ ok: true })
  }
}
