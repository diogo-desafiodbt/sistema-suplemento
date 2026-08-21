import { cookies } from 'next/headers'
import { getAppBaseUrl } from '@/lib/url-base'

export class NucleoIndisponivel extends Error {
  constructor(message = 'Núcleo indisponível') {
    super(message)
    this.name = 'NucleoIndisponivel'
  }
}

/**
 * Único ponto de contato do portal com o núcleo.
 * Repassa cookies da sessão; o núcleo valida e extrai o dono.
 */
export async function perguntarAoNucleo<T>(
  pergunta: string,
  corpo?: unknown,
): Promise<T | null> {
  const base = (process.env.NUCLEO_URL ?? getAppBaseUrl()).replace(/\/$/, '')
  const url = `${base}/api/contrato/paciente/${pergunta}`

  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(corpo ?? {}),
      cache: 'no-store',
    })
  } catch {
    throw new NucleoIndisponivel()
  }

  if (res.status === 401 || res.status === 404) return null
  if (!res.ok) throw new NucleoIndisponivel()

  return (await res.json()) as T
}
