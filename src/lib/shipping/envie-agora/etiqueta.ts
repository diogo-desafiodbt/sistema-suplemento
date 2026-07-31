import { getSenderAddress } from '@/lib/shipping/sender-region'
import { envieAgoraFetch } from './client'
import type {
  AdicionarEtiquetaRequest,
  AdicionarEtiquetaResponse,
  PackageDimensions,
  PdfEtiquetaRequest,
  PdfEtiquetaResponse,
} from '@/types/shipping'

type OrderForLabel = {
  id: string
  total_amount: number | null
  shipping_quote_json: unknown
  users: {
    full_name: string
    cpf: string | null
    phone: string | null
    addresses: Array<{
      zip_code: string
      street: string
      number: string
      complement?: string | null
      neighborhood: string
      city: string
      state: string
      is_default: boolean
    }>
  }
}

function formatCelular(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return undefined
  const ddd = digits.slice(-11, -9) || digits.slice(0, 2)
  const rest = digits.slice(-9)
  if (rest.length === 9) {
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
  }
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
}

export async function criarEtiqueta(params: {
  order: OrderForLabel
  dimensions: PackageDimensions
  codigoServico: string
  valorDeclarado: number
}): Promise<AdicionarEtiquetaResponse> {
  const user = params.order.users
  const address =
    user.addresses?.find(a => a.is_default) ?? user.addresses?.[0]

  if (!address) {
    throw new Error(`Pedido ${params.order.id} sem endereço`)
  }

  // Origem por região: Norte/Nordeste sai de Fortaleza, restante de Curitiba.
  const sender = await getSenderAddress(address.state)

  const body: AdicionarEtiquetaRequest = {
    objeto: {
      altura: params.dimensions.altura,
      largura: params.dimensions.largura,
      comprimento: params.dimensions.comprimento,
      peso: params.dimensions.peso,
      valordeclarado: params.valorDeclarado,
      maopropria: 'N',
      avisorecebimento: 'N',
      produto: 'Suplementos Desafio Diabetes',
      codigoservico: params.codigoServico,
    },
    remetente: {
      nome: sender.nome,
      cep: sender.cep,
      logradouro: sender.logradouro,
      numero: sender.numero,
      complemento: sender.complemento,
      bairro: sender.bairro,
      cidade: sender.cidade,
      uf: sender.uf,
    },
    destinatario: {
      nome: user.full_name,
      cpfcnpj: (user.cpf ?? '').replace(/\D/g, ''),
      celular: formatCelular(user.phone),
      cep: address.zip_code.replace(/\D/g, ''),
      logradouro: address.street,
      numero: address.number,
      complemento: address.complement ?? '',
      bairro: address.neighborhood,
      cidade: address.city,
      uf: address.state,
    },
  }

  return (await envieAgoraFetch(
    '/adicionaretiqueta',
    body
  )) as AdicionarEtiquetaResponse
}

export async function getPdfEtiqueta(
  id_requisicao: string,
  tipo_impressao?: string
): Promise<PdfEtiquetaResponse> {
  const body: PdfEtiquetaRequest = { id_requisicao }
  if (tipo_impressao) body.tipo_impressao = tipo_impressao
  return (await envieAgoraFetch('/pdfetiqueta', body)) as PdfEtiquetaResponse
}
