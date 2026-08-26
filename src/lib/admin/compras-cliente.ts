import { getSqlConteudo } from '@/lib/conteudo/db'
import { getProductDisplayName } from '@/lib/product-display-names'

export type OrigemCompra = 'guia' | 'suplemento'

export type CompraUnificada = {
  origem: OrigemCompra
  origemLabel: string
  produto: string
  data: Date | null
  valor: number | null
  moeda: string | null
  statusBruto: string
  statusLabel: string
  detalhe: string | null
}

export type HotmartSaleRow = {
  product_name: string | null
  order_date: string | Date | null
  status: string | null
  price_value: string | number | null
  price_currency: string | null
  payment_method: string | null
  transaction_code: string | null
}

export type PedidoSistemaRow = {
  id: string
  status: string
  created_at: string | Date
  total_amount: number | null
  order_items?: Array<{ products: { name: string } | null }>
}

const HOTMART_STATUS_LABEL: Record<string, string> = {
  COMPLETE: 'Pago',
  APPROVED: 'Pago',
}

const PEDIDO_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando',
  sent_to_pharmacy: 'Na farmácia',
  dispatched: 'A caminho',
  delivered: 'Entregue',
  failed: 'Falhou',
}

function labelStatusHotmart(status: string | null | undefined): string {
  const bruto = (status ?? '').trim()
  if (!bruto) return '—'
  return HOTMART_STATUS_LABEL[bruto.toUpperCase()] ?? bruto
}

function labelStatusPedido(status: string): string {
  return PEDIDO_STATUS_LABEL[status] ?? status
}

function nomesDosItens(
  items: Array<{ products: { name: string } | null }> | undefined,
): string {
  const nomes = (items ?? [])
    .map((item) =>
      item.products?.name
        ? getProductDisplayName(item.products.name)
        : null,
    )
    .filter((nome): nome is string => !!nome)
  return nomes.length > 0 ? nomes.join(', ') : 'Pedido de suplementos'
}

/** Mesma chave que `garantirClientesDaHotmart`: `lower(buyer_email)`. */
export async function buscarComprasHotmartPorEmail(
  email: string,
): Promise<HotmartSaleRow[]> {
  const sql = getSqlConteudo()
  return sql<HotmartSaleRow[]>`
    SELECT product_name, order_date, status, price_value, price_currency,
           payment_method, transaction_code
    FROM hotmart_sales
    WHERE lower(buyer_email) = ${email.trim().toLowerCase()}
    ORDER BY order_date DESC NULLS LAST
  `
}

export function montarComprasUnificadas(
  hotmart: HotmartSaleRow[],
  pedidos: PedidoSistemaRow[],
): CompraUnificada[] {
  const lista: CompraUnificada[] = []

  for (const venda of hotmart) {
    const valor =
      venda.price_value == null ? null : Number(venda.price_value)
    const detalhes = [
      venda.payment_method,
      venda.transaction_code
        ? `transação ${venda.transaction_code}`
        : null,
    ].filter(Boolean)

    lista.push({
      origem: 'guia',
      origemLabel: 'Guia (Hotmart)',
      produto: venda.product_name ?? 'Guia',
      data: venda.order_date ? new Date(venda.order_date) : null,
      valor: Number.isNaN(valor) ? null : valor,
      moeda: venda.price_currency ?? 'BRL',
      statusBruto: venda.status ?? '',
      statusLabel: labelStatusHotmart(venda.status),
      detalhe: detalhes.length > 0 ? detalhes.join(' · ') : null,
    })
  }

  for (const pedido of pedidos) {
    lista.push({
      origem: 'suplemento',
      origemLabel: 'Suplemento (sistema)',
      produto: nomesDosItens(pedido.order_items),
      data: new Date(pedido.created_at),
      valor: pedido.total_amount,
      moeda: 'BRL',
      statusBruto: pedido.status,
      statusLabel: labelStatusPedido(pedido.status),
      detalhe: pedido.id,
    })
  }

  return lista.sort((a, b) => {
    const ta = a.data?.getTime() ?? 0
    const tb = b.data?.getTime() ?? 0
    return tb - ta
  })
}

export function formatarValorCompra(
  valor: number | null,
  moeda: string | null,
): string {
  if (valor == null || Number.isNaN(valor)) return '—'
  if ((moeda ?? 'BRL').toUpperCase() === 'BRL') {
    return `R$ ${valor.toFixed(2).replace('.', ',')}`
  }
  return `${moeda} ${valor.toFixed(2)}`
}
