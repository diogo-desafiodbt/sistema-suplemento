import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assertTriageNotBlocked,
  createTriageSessionToken,
} from '@/lib/quiz/triage-session'
import type { TriageAnswers } from '@/lib/protocol/triage'

const triageBodySchema = z.object({
  age: z.number().int().min(1).max(120),
  sex: z.enum(['homem', 'mulher']),
  is_pregnant_or_breastfeeding: z.boolean(),
  renal_conditions: z.array(z.string()),
  hepatic_conditions: z.array(z.string()),
  diagnosis_type: z.enum([
    'type1',
    'type2',
    'prediabetes',
    'lada_avancado',
    'undiagnosed',
  ]),
  medications: z.array(z.string()).default([]),
})

/**
 * Emite um token HMAC assinado após triagem no servidor.
 * O checkout exige esse token — sessionStorage sozinho não basta.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = triageBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados de triagem inválidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const answers: TriageAnswers = {
      age: parsed.data.age,
      sex: parsed.data.sex,
      is_pregnant_or_breastfeeding:
        parsed.data.sex === 'mulher'
          ? parsed.data.is_pregnant_or_breastfeeding
          : false,
      renal_conditions: parsed.data.renal_conditions as TriageAnswers['renal_conditions'],
      hepatic_conditions:
        parsed.data.hepatic_conditions as TriageAnswers['hepatic_conditions'],
      diagnosis_type: parsed.data.diagnosis_type,
      medications: parsed.data.medications,
    }

    let allowed
    try {
      allowed = assertTriageNotBlocked(answers)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Triagem bloqueada'
      return NextResponse.json({ error: message, blocked: true }, { status: 403 })
    }

    const token = createTriageSessionToken(answers, allowed)
    return NextResponse.json({
      ok: true,
      token,
      allowed,
      expires_in_seconds: 24 * 60 * 60,
    })
  } catch (error) {
    console.error('triage-session error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
