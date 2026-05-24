export interface PharmacyOrderItem {
  CodigoProduto: number
  Quantidade: number
  CodigoBarras: string
}

export interface PharmacyOrder {
  Empresa: number
  Origem: string
  OrigemPedido: string
  CodigoStatus: number
  ClienteCodigo: string
  TransportadoraCodigo: string
  FormaPagamentoCodigo: string
  NumeroObjeto: string
  EntregaNome: string
  EntregaLogradouro: string
  EntregaNumero: string
  EntregaComplemento: string
  EntregaBairro: string
  EntregaCidade: string
  EntregaEstado: string
  EntregaCEP: string
  Observacoes: string
  Itens: PharmacyOrderItem[]
}
