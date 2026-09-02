// Agenda de recebíveis do Pagar.me.
//
// A venda aprovada não é dinheiro na conta: pix cai num prazo, crédito à vista
// noutro, e parcelado vira uma parcela por mês, cada uma com taxa própria. O
// sistema sabia que a venda foi aprovada e não sabia nada disso.
//
// A consulta é por cobrança. Não existe filtro por pedido na API deles, e é
// por isso que a gente guarda o `pagarme_charge_id` em cada pagamento.

const BASE = 'https://api.pagar.me/core/v5'

export type Recebivel = {
  id: number
  charge_id: string
  installment: number | null
  amount: number
  fee: number
  anticipation_fee: number
  type: string | null
  payment_method: string | null
  status: string
  payment_date: string | null
}

function autorizacao(): string {
  const chave = process.env.PAGARME_API_KEY
  if (!chave) throw new Error('PAGARME_API_KEY ausente')
  return `Basic ${Buffer.from(`${chave}:`).toString('base64')}`
}

/**
 * Todos os recebíveis de uma cobrança.
 *
 * Paginação por cursor: a paginação por página está sendo descontinuada por
 * eles. Uma cobrança à vista devolve uma linha e um parcelamento em seis
 * devolve seis, então o laço quase nunca dá mais de uma volta — mas ele existe
 * para o dia em que der.
 */
export async function recebiveisDaCobranca(
  chargeId: string,
): Promise<Recebivel[]> {
  const encontrados: Recebivel[] = []
  let cursor: string | null = null

  for (let volta = 0; volta < 20; volta++) {
    const url = new URL(`${BASE}/payables`)
    url.searchParams.set('charge_id', chargeId)
    url.searchParams.set('size', '100')
    if (cursor) url.searchParams.set('forward_cursor', cursor)

    const res = await fetch(url, {
      headers: { Authorization: autorizacao() },
    })
    const texto = await res.text()

    if (!res.ok) {
      throw new Error(`Pagar.me payables → ${res.status}: ${texto}`)
    }

    const corpo = JSON.parse(texto) as {
      data?: Recebivel[]
      paging?: { next_cursor?: string | null }
    }
    encontrados.push(...(corpo.data ?? []))

    cursor = corpo.paging?.next_cursor ?? null
    if (!cursor) break
  }

  return encontrados
}
