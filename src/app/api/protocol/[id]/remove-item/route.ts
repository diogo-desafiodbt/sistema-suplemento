import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { item_id, removed } = await request.json()
    const admin = createAdminClient()

    const { data: protocol } = await admin
      .from('protocols')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado' }, { status: 404 })
    }

    const { data: item } = await admin
      .from('protocol_items')
      .select('id, is_required, protocol_id')
      .eq('id', item_id)
      .eq('protocol_id', id)
      .single()

    if (!item) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })
    }

    if (item.is_required) {
      return NextResponse.json({ error: 'Este item não pode ser removido' }, { status: 400 })
    }

    await admin
      .from('protocol_items')
      .update({ removed_by_patient: removed })
      .eq('id', item_id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Remove item error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
