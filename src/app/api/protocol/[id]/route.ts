import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

type ProtocolRow = {
  id: string
  status: string
  generated_at: Date | string
  protocol_items: unknown
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const sql = getSql()
    const rows = await sql<ProtocolRow[]>`
      SELECT p.id, p.status, p.generated_at,
        COALESCE(items.list, '[]'::jsonb) AS protocol_items
      FROM protocols p
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', pi.id, 'is_required', pi.is_required,
          'removed_by_patient', pi.removed_by_patient,
          'activation_reason', pi.activation_reason, 'quantity', pi.quantity,
          'products', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', pr.id, 'name', pr.name, 'price_monthly', pr.price_monthly,
            'price_quarterly', pr.price_quarterly, 'price_yearly', pr.price_yearly,
            'is_fixed', pr.is_fixed) END
        ) ORDER BY pi.id) AS list
        FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
        WHERE pi.protocol_id = p.id) items ON true
      WHERE p.id = ${id}::uuid AND p.user_id = ${user.id}::uuid
      LIMIT 1
    `

    const protocol = rows[0]
    if (!protocol) {
      return NextResponse.json(
        { error: 'Protocolo não encontrado' },
        { status: 404 },
      )
    }

    return NextResponse.json({ protocol })
  } catch (error) {
    console.error('Protocol fetch error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
