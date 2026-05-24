import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const admin = createAdminClient()

    await admin.from('user_login_history').insert({
      user_id: user.id,
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
      user_agent: request.headers.get('user-agent') ?? 'unknown',
      logged_at: new Date().toISOString(),
    })

    await admin
      .from('users')
      .update({ rfm_recalc_queued_at: new Date().toISOString() })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Login event error:', error)
    return NextResponse.json({ ok: true })
  }
}
