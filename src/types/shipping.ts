/** Tipos baseados no OpenAPI oficial Envie Agora (ENVIE AGORA API.yaml). */

type CotacaoVolume = {
  altura: number
  largura: number
  comprimento: number
  peso: number
}

export type CotacaoRequest = {
  ceporigem: string
  cepdestino: string
  altura: number
  largura: number
  comprimento: number
  peso: number
  valordeclarado: number
  avisorecebimento: string
  maopropria: string
  volumes?: CotacaoVolume[]
}

type PontoPickup = {
  pudoId?: string
  cnpjCpf?: string
  ie?: string
  ativo?: string
  razao?: string
  responsavel?: string
  acessoDeficienteFisico?: number
  estacionamento?: number
  publico?: string
  enderecos?: Array<Record<string, unknown>>
  horarios?: Record<string, unknown>
  distancia?: number
}

export type PrecoPrazoItem = {
  codigoServico: string
  transportadora: string
  nomeServico: string
  valor: number
  prazoDias: number
  /** OpenAPI oficial usa typo "pontoPikcup"; aceitamos ambos. */
  pontoPickup?: PontoPickup
  pontoPikcup?: PontoPickup
}

export type CotacaoResponse = {
  data?: {
    precosprazos?: PrecoPrazoItem[]
  }
}

type EtiquetaObjeto = {
  altura: number
  largura: number
  comprimento: number
  peso: number
  valordeclarado: number
  maopropria: string
  avisorecebimento: string
  produto: string
  codigoservico: string
  volumes?: CotacaoVolume[]
}

type EtiquetaEndereco = {
  nome: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

type EtiquetaDestinatario = EtiquetaEndereco & {
  cpfcnpj: string
  celular?: string
}

export type AdicionarEtiquetaRequest = {
  objeto: EtiquetaObjeto
  remetente: EtiquetaEndereco
  destinatario: EtiquetaDestinatario
  notafiscal?: Record<string, unknown>
  chave_dce?: string
}

export type AdicionarEtiquetaResponse = {
  mensagem?: string
  id_requisicao: string
}

export type PdfEtiquetaRequest = {
  id_requisicao: string
  tipo_impressao?: string
}

export type PdfEtiquetaResponse = {
  url: string
}

export type RastreamentoRequest = {
  id_requisicao: string
}

export type RastreamentoEvento = {
  id: number
  id_requisicao: string
  descricao: string | null
  local: string | null
  cidade: string | null
  datahora: string
  finalizado: number
}

export type RastreamentoResponse = {
  eventos: RastreamentoEvento[]
}

export type WebhookEtiquetaPayload = {
  id_requisicao: string
  numero_etiqueta: string
  valor_cobrado?: number
  numero_plp?: string
  url_pdf?: string
}

export type WebhookRastreamentoPayload = RastreamentoResponse

export type PackageDimensions = {
  altura: number
  largura: number
  comprimento: number
  peso: number
}

export type ShippingSelection = {
  tipo: 'economica' | 'expressa' | 'padrao'
  valor: number
  prazoDias: number
  codigoServico: string
  transportadora?: string
  nomeServico?: string
}

export type ShippingOptionPublic = {
  /** econômica = menor preço; expressa = menor prazo; demais = todas as cotações. */
  tipo: 'economica' | 'expressa' | 'padrao'
  valor: number
  prazoDias: number
  codigoServico: string
  transportadora: string
  nomeServico: string
}

/** Identidade estável de uma cotação (codigoServico sozinho pode colidir). */
export function shippingQuoteKey(q: {
  codigoServico: string
  transportadora?: string | null
  nomeServico?: string | null
  valor: number
  prazoDias: number
}): string {
  return [
    q.codigoServico,
    q.transportadora ?? '',
    q.nomeServico ?? '',
    String(q.valor),
    String(q.prazoDias),
  ].join('|')
}
