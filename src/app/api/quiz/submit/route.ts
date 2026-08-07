import { type NextRequest, NextResponse } from 'next/server'
import { quizSchema } from '@/lib/quiz/schema'
import { createClient } from '@/lib/supabase/server'

/**
 * Legacy endpoint. Protocols are created only after payment confirmation
 * (see ensureProtocolAfterPayment). Kept for schema validation / old clients.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { protocol_items: _items, ...quizBody } = body
    const parsed = quizSchema.safeParse(quizBody)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      deferred: true,
      message: 'Protocolo será criado após confirmação do pagamento',
    })
  } catch (error) {
    console.error('Quiz submit error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
