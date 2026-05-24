import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { quizSchema } from '@/lib/quiz/schema'
import { generateProtocol } from '@/lib/protocol/generator'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { protocol_items: sessionProtocolItems, ...quizBody } = body
    const parsed = quizSchema.safeParse(quizBody)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data
    const admin = createAdminClient()

    const { data: quizResponse, error: quizError } = await admin
      .from('quiz_responses')
      .insert({
        user_id: user.id,
        diagnosis_type: data.diagnosis_type,
        years_diagnosed: data.years_diagnosed,
        hba1c_range: data.hba1c_range,
        fasting_glucose: data.fasting_glucose,
        medications: data.medications,
        family_history: data.family_history,
        symptoms: data.symptoms,
        conditions_mild: data.conditions_mild,
        conditions_serious: data.conditions_serious,
        weight_status: data.weight_status,
        exercise_freq: data.exercise_freq,
        diet_quality: data.diet_quality,
        allergies: data.allergies,
        prior_treatment: data.prior_treatment,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (quizError) {
      console.error('Quiz insert error:', quizError)
      return NextResponse.json({ error: 'Erro ao salvar questionário' }, { status: 500 })
    }

    const protocolItems = Array.isArray(sessionProtocolItems) && sessionProtocolItems.length > 0
      ? sessionProtocolItems
      : generateProtocol(data, data.plan_type)

    const { data: protocol, error: protocolError } = await admin
      .from('protocols')
      .insert({
        user_id: user.id,
        quiz_response_id: quizResponse.id,
        status: 'pending_signature',
        generated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (protocolError) {
      console.error('Protocol insert error:', protocolError)
      return NextResponse.json({ error: 'Erro ao criar protocolo' }, { status: 500 })
    }

    const { data: products } = await admin
      .from('products')
      .select('id, name')
      .eq('is_active', true)

    if (products && protocolItems.length > 0) {
      const itemsToInsert = protocolItems.map(item => {
        const product = products.find(p =>
          p.name.toLowerCase() === item.product_name.toLowerCase()
        ) ?? products.find(p =>
          p.name.toLowerCase().includes(item.product_name.toLowerCase().split(' ')[0])
        )
        return {
          protocol_id: protocol.id,
          product_id: product?.id ?? null,
          is_required: item.is_required,
          removed_by_patient: item.removed ?? false,
          activation_reason: item.activation_reason,
          quantity: item.quantity,
        }
      }).filter(item => item.product_id !== null)

      if (itemsToInsert.length > 0) {
        await admin.from('protocol_items').insert(itemsToInsert)
      }
    }

    return NextResponse.json({
      ok: true,
      protocol_id: protocol.id,
      items_count: protocolItems.length,
    })
  } catch (error) {
    console.error('Quiz submit error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
