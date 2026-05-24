import { PharmacyOrder, PharmacyOrderItem } from '@/types/pharmacy'

const MESES_PT = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
]

export function buildTransportadoraCodigo(
  zipCode: string,
  fullName: string
): string {
  const cep3 = zipCode.replace(/\D/g, '').substring(0, 3)
  const nome3 = fullName.slice(-3).toLowerCase()
  return `${cep3}${nome3}DD`
}

export function buildFormaPagamentoCodigo(planType: string): string {
  const mes = MESES_PT[new Date().getMonth()]
  return `${planType}${mes}`
}

export function buildPharmacyJson(params: {
  clienteCodigo: string
  fullName: string
  address: {
    zip_code: string
    street: string
    number: string
    complement?: string
    neighborhood: string
    city: string
    state: string
  }
  planType: string
  items: PharmacyOrderItem[]
  prescriptionPdfUrl: string
  pharmacyCarrierCode: string
  pharmacyPaymentCode: string
  pharmacyCompanyId: number
}): PharmacyOrder {
  return {
    Empresa: params.pharmacyCompanyId,
    Origem: 'S',
    OrigemPedido: 'DESAFIO_DIABETES',
    CodigoStatus: 11,
    ClienteCodigo: params.clienteCodigo,
    TransportadoraCodigo: buildTransportadoraCodigo(
      params.address.zip_code,
      params.fullName
    ),
    FormaPagamentoCodigo: buildFormaPagamentoCodigo(params.planType),
    NumeroObjeto: '',
    EntregaNome: params.fullName,
    EntregaLogradouro: params.address.street,
    EntregaNumero: params.address.number,
    EntregaComplemento: params.address.complement ?? '',
    EntregaBairro: params.address.neighborhood,
    EntregaCidade: params.address.city,
    EntregaEstado: params.address.state,
    EntregaCEP: params.address.zip_code.replace(/\D/g, ''),
    Observacoes: params.prescriptionPdfUrl,
    Itens: params.items,
  }
}
