import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
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

    const admin = createAdminClient()

    const { data: protocol, error } = await admin
      .from('protocols')
      .select(`
        id,
        status,
        generated_at,
        protocol_items (
          id,
          is_required,
          removed_by_patient,
          activation_reason,
          quantity,
          products (
            id,
            name,
            price_monthly,
            price_quarterly,
            price_yearly,
            is_fixed
          )
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ protocol })
  } catch (error) {
    console.error('Protocol fetch error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
