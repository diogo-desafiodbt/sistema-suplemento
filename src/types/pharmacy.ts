/** Schema completo do JSON exigido pela farmácia (Miligrama). */

export type PharmacyOrderItem = {
  Codigo: number
  ProdutoReferencia: string
  ProdutoCodigo: number
  ItemNome: string
  PrecoUnitarioVenda: string
  PrecoUnitarioCusto: string
  Quantidade: string
  ItemDescontoPercentual: string
  ItemDescontoValor: string
  ItemDescontoValorTotal: string
  ItemValorBruto: string
  ItemValorLiquido: string
  Servico: boolean
  Movimentacao: unknown[]
}

type PharmacyVendaPagamento = {
  Valor: string
  DataVencimento: string
  FormaPagamentoCodigo: number
}

export type PharmacyOrder = {
  ClienteCodigo: number
  ClienteTipoPessoa: string
  ClienteDocumento: string
  ClienteIdentidade: string
  TransportadoraCodigo: number
  ValorTotal: string
  ValorFrete: string
  ValorEncargos: string
  ValorDesconto: string
  ValorComissao: string
  DataVenda: string
  DataPagamento: string
  Entrega: boolean
  EntregaNome: string
  EntregaEmail: string
  EntregaTelefone: string
  EntregaLogradouro: string
  EntregaLogradouroNumero: string
  EntregaLogradouroComplemento: string
  EntregaBairro: string
  EntregaMunicipioNome: string
  EntregaUnidadeFederativa: string
  EntregaCEP: string
  CupomDescontoCodigo: string
  Origem: string
  CupomDescontoValor: string
  NumeroObjeto: string
  Observacoes: string
  ObservacoesLoja: string
  CodigoStatus: number
  OrigemPedido: string
  OrigemExterno: string
  CodigoPedidoExterno: string
  CodigoPedido: string
  Empresa: number
  OrcamentoImpresso: boolean
  ValorTotalBruto: string
  Orcamento: boolean
  TipoVenda: string
  ClienteNome: string
  HoraVenda: string
  Cancelada: boolean
  Reservada: boolean
  VendaPagamentos: PharmacyVendaPagamento[]
  Itens: PharmacyOrderItem[]
  PesoLiquido: string
  Status: unknown[]
  ClienteTipoDesconto: string
  ClienteDesconto: string
  FormaParcelamentoCodigo: number
  Parcelas: unknown[]
  Obs1: string
  Obs2: string
  Obs3: string
  PrevisaoEntregaEmDias: number
  FreteSimulado: string
  TipoDeCalculoDeFrete: string
  ClienteExistente: boolean
}
