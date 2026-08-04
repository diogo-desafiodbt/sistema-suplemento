import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_TYPES = [
  'quiz_started',
  'quiz_completed',
  'quiz_eligible',
  'checkout_started',
]

export async function POST(request: NextRequest) {
  try {
    const { session_id, event_type } = await request.json()
    if (
      typeof session_id !== 'string' ||
      !session_id ||
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
