import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

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

    const sql = getSql()
    await sql`
      INSERT INTO funnel_events (session_id, event_type)
      VALUES (${session_id}::uuid, ${event_type})
      ON CONFLICT DO NOTHING
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('funnel/track error:', error)
    return NextResponse.json({ ok: true })
  }
}
