import { createHmac, timingSafeEqual } from 'node:crypto'

const MAX_AGE_SEC = 30 * 60

function segredo(): string {
  const value = process.env.SATELITE_SESSION_SECRET
  if (!value) {
    throw new Error('SATELITE_SESSION_SECRET ausente')
  }
  return value
}

function hmac(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload, 'utf8').digest()
}

export function assinarSessaoSatelite(userId: string, role: string): string {
  const secret = segredo()
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const payload = JSON.stringify({ sub: userId, role, exp })
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${hmac(payload, secret).toString('base64url')}`
}

export function verificarSessaoSatelite(
  cookie: string,
): { sub: string; role: string } | null {
  const secret = segredo()
  const dot = cookie.indexOf('.')
  if (dot <= 0 || dot === cookie.length - 1) return null

  const payloadB64 = cookie.slice(0, dot)
  const sigB64 = cookie.slice(dot + 1)

  let payloadRaw: Buffer
  let sig: Buffer
  try {
    payloadRaw = Buffer.from(payloadB64, 'base64url')
    sig = Buffer.from(sigB64, 'base64url')
  } catch {
    return null
  }

  const expected = hmac(payloadRaw.toString('utf8'), secret)
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(sig, expected)) return null

  let data: { sub?: unknown; role?: unknown; exp?: unknown }
  try {
    data = JSON.parse(payloadRaw.toString('utf8')) as {
      sub?: unknown
      role?: unknown
      exp?: unknown
    }
  } catch {
    return null
  }

  if (
    typeof data.sub !== 'string' ||
    typeof data.role !== 'string' ||
    typeof data.exp !== 'number'
  ) {
    return null
  }
  if (data.exp < Math.floor(Date.now() / 1000)) return null

  return { sub: data.sub, role: data.role }
}

export const SESSAO_SATELITE_COOKIE = 'sessao_satelite'
export const SESSAO_SATELITE_MAX_AGE = MAX_AGE_SEC
