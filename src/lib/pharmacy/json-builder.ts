import type { PharmacyOrder, PharmacyOrderItem } from '@/types/pharmacy'

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function clientCodeToInt(clientCode: string | null | undefined): number {
  const digits = digitsOnly(clientCode)
  const n = parseInt(digits || '0', 10)
  return Number.isFinite(n) ? n : 0
}

export function buildPharmacyJson(params: {
  orderId: string
  clientCode: string
  cpf: string | null
  fullName: string
  email: string
  phone: string | null
  address: {
    zip_code: string
    street: string
    number: string
    complement?: string | null
    neighborhood: string
    city: string
    state: string
  }
  items: PharmacyOrderItem[]
  productsSubtotal: number
  freteValor: number
  prazoDias: number
  prescriptionPdfUrl: string
  pharmacyCarrierCode: number
  pharmacyPaymentCode: number
  pharmacyCompanyId: number
  pesoLiquido: number
  clienteExistente: boolean
}): PharmacyOrder {
  const now = new Date()
  const dataVenda = now.toISOString().slice(0, 10)
  const horaVenda = now.toTimeString().slice(0, 8)
  const valorFrete = money(params.freteValor)
  const valorTotal = money(params.productsSubtotal + params.freteValor)

  return {
    ClienteCodigo: clientCodeToInt(params.clientCode),
    ClienteTipoPessoa: 'F',
    ClienteDocumento: digitsOnly(params.cpf),
    ClienteIdentidade: '',
    TransportadoraCodigo: params.pharmacyCarrierCode,
    ValorTotal: valorTotal,
    ValorFrete: valorFrete,
    ValorEncargos: '0.00',
    ValorDesconto: '0.00',
    ValorComissao: '0.00',
    DataVenda: dataVenda,
    DataPagamento: dataVenda,
    Entrega: false,
    EntregaNome: params.fullName,
    EntregaEmail: params.email,
    EntregaTelefone: params.phone ?? '',
    EntregaLogradouro: params.address.street,
    EntregaLogradouroNumero: params.address.number,
    EntregaLogradouroComplemento: params.address.complement ?? '',
    EntregaBairro: params.address.neighborhood,
    EntregaMunicipioNome: params.address.city,
    EntregaUnidadeFederativa: params.address.state,
    EntregaCEP: digitsOnly(params.address.zip_code),
    CupomDescontoCodigo: '',
    Origem: 'S',
    CupomDescontoValor: '0.00',
    NumeroObjeto: '',
    Observacoes: params.prescriptionPdfUrl,
    ObservacoesLoja: 'Importado via API Desafio Diabetes',
    CodigoStatus: 11,
    OrigemPedido: 'DESAFIO_DIABETES',
    OrigemExterno: 'Desafio Diabetes',
    CodigoPedidoExterno: params.orderId,
    CodigoPedido: '',
    Empresa: params.pharmacyCompanyId,
    OrcamentoImpresso: false,
    ValorTotalBruto: valorTotal,
    Orcamento: false,
    TipoVenda: 'V',
    ClienteNome: params.fullName,
    HoraVenda: horaVenda,
    Cancelada: false,
    Reservada: false,
    VendaPagamentos: [
      {
        Valor: valorTotal,
        DataVencimento: dataVenda,
        FormaPagamentoCodigo: params.pharmacyPaymentCode,
      },
    ],
    Itens: params.items,
    PesoLiquido: String(params.pesoLiquido),
    Status: [],
    ClienteTipoDesconto: '',
    ClienteDesconto: '0.00',
    FormaParcelamentoCodigo: 1,
    Parcelas: [],
    Obs1: '',
    Obs2: '',
    Obs3: '',
    PrevisaoEntregaEmDias: params.prazoDias,
    FreteSimulado: valorFrete,
    TipoDeCalculoDeFrete: '',
    ClienteExistente: params.clienteExistente,
  }
}

export function buildPharmacyItem(params: {
  sku: string
  pharmacyCode: number
  name: string
  unitPrice: number
  quantity?: number
}): PharmacyOrderItem {
  const qty = params.quantity && params.quantity > 0 ? params.quantity : 1
  const unit = money(params.unitPrice)
  const line = money(params.unitPrice * qty)
  return {
    Codigo: 0,
    ProdutoReferencia: params.sku,
    ProdutoCodigo: params.pharmacyCode,
    ItemNome: params.name,
    PrecoUnitarioVenda: unit,
    PrecoUnitarioCusto: '0.00',
    Quantidade: qty.toFixed(2),
    ItemDescontoPercentual: '0.00',
    ItemDescontoValor: '0.00',
    ItemDescontoValorTotal: '0.00',
    ItemValorBruto: line,
    ItemValorLiquido: line,
    Servico: false,
    Movimentacao: [],
  }
}
