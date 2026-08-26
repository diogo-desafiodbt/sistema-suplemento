import { cookies } from 'next/headers'
import { COOKIE_ID } from '@/lib/auth/cookies'
import { getAppBaseUrl } from '@/lib/url-base'

/**
 * Pede ao núcleo para preencher `users.cognito_sub` a partir do id token.
 * Usado pelas rotas de auth na entrada (`app_entrada`), que não podem
 * escrever essa coluna.
 *
 * Não lança: falha só vai para o log — quem já tem vínculo não pode perder
 * o login por causa disso.
 */
export async function pedirVinculoNoNucleo(
  idToken: string,
  fullName?: string | null,
): Promise<void> {
  const base = (process.env.NUCLEO_URL ?? getAppBaseUrl()).replace(/\/$/, '')
  const url = `${base}/api/contrato/auth/vincular`

  // Repassa os cookies da requisição, como `perguntarAoNucleo` faz, e troca o
  // `dd_id` pelo token recém-emitido — ele ainda não está na requisição, foi
  // gravado agora na resposta.
  //
  // Mandar só o `dd_id` não funciona: o portão de pré-lançamento reescreve
  // tudo que não traz `acesso_equipe` para `/em-breve`, que só aceita GET.
  // O POST voltava 405, a falha ia para o log e o vínculo nunca acontecia —
  // o conserto pareceria aplicado sem nunca ter rodado.
  const cookieStore = await cookies()
  const pares = cookieStore
    .getAll()
    .filter((c) => c.name !== COOKIE_ID)
    .map((c) => `${c.name}=${c.value}`)
  pares.push(`${COOKIE_ID}=${idToken}`)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: pares.join('; '),
      },
      body: JSON.stringify(fullName ? { full_name: fullName } : {}),
      cache: 'no-store',
    })
    if (!res.ok) {
      const texto = await res.text().catch(() => '')
      console.error(
        'pedirVinculoNoNucleo falhou:',
        res.status,
        texto.slice(0, 300),
      )
    }
  } catch (error) {
    console.error('pedirVinculoNoNucleo erro de rede:', error)
  }
}
