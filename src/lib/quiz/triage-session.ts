import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ProductKey, TriageAnswers } from '@/lib/protocol/triage'
import { computeTriage } from '@/lib/protocol/triage'

export type TriageSessionPayload = {
  v: 1
  exp: number
  nonce: string
  age: number
  sex: TriageAnswers['sex']
  is_pregnant_or_breastfeeding: boolean
  renal_conditions: string[]
  hepatic_conditions: string[]
  diagnosis_type: TriageAnswers['diagnosis_type']
  allowed: ProductKey[]
}

function getSecret(): string {
  const secret =
    process.env.TRIAGE_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('TRIAGE_SESSION_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente')
  }
  return secret
}

function signBody(body: string): string {
  return createHmac('sha256', getSecret()).update(body).digest('base64url')
}

export function createTriageSessionToken(
  answers: TriageAnswers,
  allowed: ProductKey[],
): string {
  const payload: TriageSessionPayload = {
    v: 1,
    exp: Date.now() + 24 * 60 * 60 * 1000,
    nonce: randomUUID(),
    age: answers.age,
    sex: answers.sex,
    is_pregnant_or_breastfeeding: answers.is_pregnant_or_breastfeeding,
    renal_conditions: [...answers.renal_conditions].sort(),
    hepatic_conditions: [...answers.hepatic_conditions].sort(),
    diagnosis_type: answers.diagnosis_type,
    allowed: [...allowed].sort(),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${signBody(body)}`
}

export function verifyTriageSessionToken(
  token: string,
): TriageSessionPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expected = signBody(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as TriageSessionPayload
    if (payload.v !== 1) return null
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    if (!Array.isArray(payload.allowed) || payload.allowed.length === 0) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** Confirma que o quiz do checkout bate com o token assinado no servidor. */
export function quizMatchesTriageSession(
  quiz: {
    age?: number
    sex?: string
    is_pregnant_or_breastfeeding?: boolean
    renal_conditions?: string[]
    hepatic_conditions?: string[]
    diagnosis_type?: string
  },
  session: TriageSessionPayload,
): boolean {
  if (quiz.age !== session.age) return false
  if (quiz.sex !== session.sex) return false
  if (
    Boolean(quiz.is_pregnant_or_breastfeeding) !==
    session.is_pregnant_or_breastfeeding
  ) {
    return false
  }
  if (quiz.diagnosis_type !== session.diagnosis_type) return false

  const renal = [...(quiz.renal_conditions ?? [])].sort().join('|')
  const hepatic = [...(quiz.hepatic_conditions ?? [])].sort().join('|')
  if (renal !== [...session.renal_conditions].sort().join('|')) return false
  if (hepatic !== [...session.hepatic_conditions].sort().join('|')) return false
  return true
}

export function assertTriageNotBlocked(answers: TriageAnswers): ProductKey[] {
  const result = computeTriage(answers)
  if (result.blocked) {
    throw new Error(result.blockReason)
  }
  return result.allowed
}
