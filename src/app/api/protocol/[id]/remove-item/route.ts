import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
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

    const { item_id, removed } = await request.json()
    const sql = getSql()

    const protocolRows = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM protocols
      WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
      LIMIT 1
    `
    const protocol = protocolRows[0] ?? null

    if (!protocol) {
      return NextResponse.json(
        { error: 'Protocolo não encontrado' },
        { status: 404 },
      )
    }

    const linkedSub = await sql<{ id: string }[]>`
      SELECT id FROM subscriptions
      WHERE protocol_id = ${id}::uuid AND user_id = ${user.id}::uuid
      LIMIT 1
    `

    if (linkedSub[0]?.id) {
      const paid = await sql<{ id: string }[]>`
        SELECT id FROM payments
        WHERE subscription_id = ${linkedSub[0].id}::uuid
          AND status = 'paid'
        LIMIT 1
      `

      if (paid[0]) {
        return NextResponse.json(
          { error: 'Protocolo já pago — itens não podem ser alterados' },
          { status: 400 },
        )
      }
    }

    if (protocol.status !== 'pending_signature') {
      return NextResponse.json(
        { error: 'Protocolo não permite alteração de itens neste status' },
        { status: 400 },
      )
    }

    const itemRows = await sql<
      { id: string; is_required: boolean; protocol_id: string }[]
    >`
      SELECT id, is_required, protocol_id FROM protocol_items
      WHERE id = ${item_id}::uuid AND protocol_id = ${id}::uuid
      LIMIT 1
    `
    const item = itemRows[0] ?? null

    if (!item) {
      return NextResponse.json(
        { error: 'Item não encontrado' },
        { status: 404 },
      )
    }

    if (item.is_required) {
      return NextResponse.json(
        { error: 'Este item não pode ser removido' },
        { status: 400 },
      )
    }

    await sql`
      UPDATE protocol_items
      SET removed_by_patient = ${removed}
      WHERE id = ${item_id}::uuid
        AND protocol_id = ${id}::uuid
        AND protocol_id IN (
          SELECT id FROM protocols
          WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
        )
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Remove item error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
