import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const subscriptionId = request.nextUrl.searchParams.get('subscription_id')
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'subscription_id obrigatório' },
        { status: 400 }
      )
    }

    const { data: payment, error } = await supabase
      .from('payments')
      .select('status')
      .eq('subscription_id', subscriptionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('checkout/status error:', error)
      return NextResponse.json({ error: 'Erro ao consultar status' }, { status: 500 })
    }

    const raw = payment?.status ?? 'pending'
    const status =
      raw === 'paid' || raw === 'failed' || raw === 'pending' ? raw : 'pending'

    return NextResponse.json({ status })
  } catch (error) {
    console.error('checkout/status error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
