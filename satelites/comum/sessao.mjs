import { createHmac, timingSafeEqual } from 'node:crypto'

const SEGREDO = process.env.SATELITE_SESSION_SECRET
if (!SEGREDO) {
  throw new Error('SATELITE_SESSION_SECRET ausente')
}

export const COOKIE_NAME = 'sessao_satelite'
export const LOGIN_URL = 'https://desafiodiabetes.com/suplementos/login'

function hmac(payload, secret) {
  return createHmac('sha256', secret).update(payload, 'utf8').digest()
}

export function verificarSessao(cookie) {
  if (!cookie) return null
  const dot = cookie.indexOf('.')
  if (dot <= 0 || dot === cookie.length - 1) return null

  let payloadRaw
  let sig
  try {
    payloadRaw = Buffer.from(cookie.slice(0, dot), 'base64url')
    sig = Buffer.from(cookie.slice(dot + 1), 'base64url')
  } catch {
    return null
  }

  const expected = hmac(payloadRaw.toString('utf8'), SEGREDO)
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(sig, expected)) return null

  let data
  try {
    data = JSON.parse(payloadRaw.toString('utf8'))
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

export function cookieDoEvento(event) {
  const headers = event?.headers ?? {}
  const raw =
    headers.cookie ??
    headers.Cookie ??
    headers.COOKIE ??
    ''
  const parts = String(raw).split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(COOKIE_NAME.length + 1))
    }
  }
  return ''
}
