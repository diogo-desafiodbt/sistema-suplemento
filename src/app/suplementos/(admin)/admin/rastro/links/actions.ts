'use server'

import { revalidatePath } from 'next/cache'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSql } from '@/lib/db'

const APELIDO = /^[a-z0-9][a-z0-9.-]{0,59}$/

export async function criarLink(_anterior: string | null, form: FormData) {
  await exigirAdmin()

  const apelido = String(form.get('apelido') ?? '').trim().toLowerCase()
  const destino = String(form.get('destino') ?? '').trim()
  const descricao = String(form.get('descricao') ?? '').trim()

  if (!APELIDO.test(apelido)) {
    return 'O apelido aceita letra minúscula, número, ponto e hífen — até 60.'
  }
  // Só caminho interno. Apelido apontando para fora vira link aberto: qualquer
  // um com o endereço manda gente para onde quiser usando nosso domínio.
  if (!destino.startsWith('/')) {
    return 'O destino tem que começar com / — é um caminho dentro do site.'
  }

  const [existe] = await getSql()<{ apelido: string }[]>`
    SELECT apelido FROM rastro_links WHERE apelido = ${apelido}
  `
  if (existe) return `Já existe um link com o apelido "${apelido}".`

  await getSql()`
    INSERT INTO rastro_links (apelido, destino, descricao)
    VALUES (${apelido}, ${destino}, ${descricao || null})
  `
  revalidatePath('/suplementos/admin/rastro/links')
  return null
}

export async function apagarLink(apelido: string) {
  await exigirAdmin()
  // Apaga o rótulo, não o histórico: os eventos já gravados com esta origem
  // continuam contando no relatório. Sumir com eles reescreveria o passado.
  await getSql()`DELETE FROM rastro_links WHERE apelido = ${apelido}`
  revalidatePath('/suplementos/admin/rastro/links')
}
