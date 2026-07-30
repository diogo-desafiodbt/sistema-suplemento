export async function envieAgoraFetch(
  path: string,
  body: unknown
): Promise<unknown> {
  const token = process.env.ENVIE_AGORA_API_TOKEN
  const baseUrl =
    process.env.ENVIE_AGORA_BASE_URL ?? 'https://envieagora.com.br/api/v1'

  if (!token) {
    throw new Error('ENVIE_AGORA_API_TOKEN ausente')
  }

  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apitoken: token,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* keep raw text */
  }

  if (!res.ok) {
    const detail =
      typeof parsed === 'object' && parsed !== null
        ? JSON.stringify(parsed)
        : String(parsed)
    throw new Error(`Envie Agora ${path} → ${res.status}: ${detail}`)
  }

  return parsed
}
