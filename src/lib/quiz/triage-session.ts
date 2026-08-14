import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ProductKey, TriageAnswers } from '@/lib/protocol/triage'
import { computeTriage } from '@/lib/protocol/triage'

/**
 * Token de triagem: só expiração, nonce, produtos permitidos e uma
 * impressão digital. O quadro clínico não vai no cliente — o corpo é
 * base64, não criptografia, e qualquer um que visse o token leria idade,
 * gravidez, rim, fígado e diagnóstico.
 */
export type TriageSessionPayload = {
  v: 2
  exp: number
  nonce: string
  allowed: ProductKey[]
  fp: string
}

type ClinicalFingerprintInput = {
  age?: number
  sex?: string
  is_pregnant_or_breastfeeding?: boolean
  renal_conditions?: string[]
  hepatic_conditions?: string[]
  diagnosis_type?: string
}

function getSecret(): string {
  const secret = process.env.TRIAGE_SESSION_SECRET
  if (!secret) {
    throw new Error('TRIAGE_SESSION_SECRET ausente')
  }
  return secret
}

function signBody(body: string): string {
  return createHmac('sha256', getSecret()).update(body).digest('base64url')
}

/**
 * Mesma string nos dois lados (emissão e checkout). Arrays ordenados,
 * boolean coerido, US (0x1F) como separador — não aparece nos enums.
 * Divergência aqui rejeita checkout legítimo.
 */
function normalizeClinicalAnswers(input: ClinicalFingerprintInput): string {
  const age = Number.isFinite(input.age) ? String(input.age) : ''
  const sex = String(input.sex ?? '')
  const preg = input.is_pregnant_or_breastfeeding ? '1' : '0'
  const renal = [...(input.renal_conditions ?? [])].map(String).sort().join(',')
  const hepatic = [...(input.hepatic_conditions ?? [])]
    .map(String)
    .sort()
    .join(',')
  const dx = String(input.diagnosis_type ?? '')
  return [age, sex, preg, renal, hepatic, dx].join('\u001f')
}

function clinicalFingerprint(input: ClinicalFingerprintInput): string {
  return createHmac('sha256', getSecret())
    .update(normalizeClinicalAnswers(input))
    .digest('base64url')
}

function fingerprintsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function createTriageSessionToken(
  answers: TriageAnswers,
  allowed: ProductKey[],
): string {
  const payload: TriageSessionPayload = {
    v: 2,
    exp: Date.now() + 24 * 60 * 60 * 1000,
    nonce: randomUUID(),
    allowed: [...allowed].sort(),
    fp: clinicalFingerprint(answers),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  )
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
    if (payload.v !== 2) return null
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    if (!Array.isArray(payload.allowed) || payload.allowed.length === 0) {
      return null
    }
    if (typeof payload.fp !== 'string' || payload.fp.length === 0) return null
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
  return fingerprintsMatch(clinicalFingerprint(quiz), session.fp)
}

export function assertTriageNotBlocked(answers: TriageAnswers): ProductKey[] {
  const result = computeTriage(answers)
  if (result.blocked) {
    throw new Error(result.blockReason)
  }
  return result.allowed
}
