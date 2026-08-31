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
  // Caminho interno ou checkout da Hotmart, e nada mais. Apelido apontando
  // para host arbitrário vira redirecionador aberto com o nosso domínio na
  // frente. A mesma regra está no CHECK da tabela.
  const interno = destino.startsWith('/')
  const hotmart = destino.startsWith('https://pay.hotmart.com/')
  if (!interno && !hotmart) {
    return 'O destino tem que ser um caminho do site (começando com /) ou um checkout pay.hotmart.com.'
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

/**
 * Cria o link de um episódio a partir da Biblioteca de Transcrições.
 *
 * O destino é sempre a página de vendas, não o checkout: o tráfego do vídeo
 * chega para ler, e a página é quem repassa a origem para a Hotmart no clique
 * do botão. Mandar direto para o checkout pularia a venda.
 */
export async function criarLinkDeEpisodio(apelido: string, titulo: string) {
  await exigirAdmin()
  if (!APELIDO.test(apelido)) return

  await getSql()`
    INSERT INTO rastro_links (apelido, destino, descricao)
    VALUES (${apelido}, '/oprimeiropasso/', ${titulo})
    ON CONFLICT (apelido) DO NOTHING
  `
  revalidatePath('/suplementos/admin/rastro/links')
}
