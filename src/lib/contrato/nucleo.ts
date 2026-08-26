import { cookies } from 'next/headers'
import { getAppBaseUrl } from '@/lib/url-base'

export class NucleoIndisponivel extends Error {
  constructor(message = 'Núcleo indisponível') {
    super(message)
    this.name = 'NucleoIndisponivel'
  }
}

/**
 * O núcleo não achou o que foi pedido, mas a sessão é válida.
 *
 * Distinguir isso de 401 importa: sem a distinção, um link para pedido que não
 * existe mais joga a pessoa na tela de login, e ela entende que perdeu a
 * sessão. Quem trata `null` como sessão inválida precisa saber a diferença.
 */
export const NAO_ENCONTRADO = Symbol('nucleo/nao-encontrado')

/**
 * Único ponto de contato do portal com o núcleo.
 * Repassa cookies da sessão; o núcleo valida e extrai o dono.
 */
export async function perguntarAoNucleo<T>(
  pergunta: string,
  corpo?: unknown,
): Promise<T | null | typeof NAO_ENCONTRADO> {
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

  if (res.status === 401) return null
  if (res.status === 404) return NAO_ENCONTRADO
  if (!res.ok) throw new NucleoIndisponivel()

  return (await res.json()) as T
}
