import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_TYPES = [
  'quiz_started',
  'quiz_completed',
  'quiz_eligible',
  'checkout_started',
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

    // Insert simples, não upsert: o PostgREST exige privilégio de UPDATE para
    // qualquer upsert — inclusive com ignoreDuplicates, que não atualiza nada.
    // Conceder UPDATE ao anon só para satisfazer isso deixaria um visitante
    // reescrever evento de funil alheio. A idempotência vem da restrição
    // UNIQUE (session_id, event_type): evento repetido devolve 23505, que é
    // exatamente o "já registrado" que o upsert silenciava.
    const supabase = await createClient()
    const { error } = await supabase
      .from('funnel_events')
      .insert({ session_id, event_type })

    if (error && error.code !== '23505') {
      console.error('funnel/track insert:', error.code, error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('funnel/track error:', error)
    return NextResponse.json({ ok: true }) // best-effort — não expõe erro ao cliente
  }
}
