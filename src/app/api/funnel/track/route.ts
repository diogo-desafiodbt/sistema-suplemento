import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
