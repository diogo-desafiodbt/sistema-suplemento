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
  /**
   * Só a API que CONSULTAMOS devolve este campo. O webhook que a Envie Agora
   * empurra não traz — confirmado por eles em 26/08/2026. Por isso é opcional,
   * e a entrega é detectada também pela descrição.
   */
  finalizado?: number
  numeroetiqueta?: string
  notafiscal?: string
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

/**
 * A Envie Agora empurra a LISTA PURA de eventos, sem embrulho — confirmado por
 * eles em 26/08/2026. A API que consultamos devolve `{ eventos: [...] }`. São
 * formatos diferentes para o mesmo dado, então aceitamos os dois.
 */
export type WebhookRastreamentoPayload =
  | RastreamentoResponse
  | RastreamentoEvento[]

export type PackageDimensions = {
  altura: number
  largura: number
  comprimento: number
  peso: number
}

/** Como a opção é apresentada ao cliente — pelo benefício, não pela empresa. */
export type ShippingTier = 'rapido' | 'barato' | 'custo_beneficio'

/**
 * O envio já resolvido: qual serviço de qual transportadora foi contratado.
 * Vive no servidor e no banco, é o que a etiqueta e a farmácia precisam.
 * Nunca é enviado ao navegador do cliente.
 */
export type ShippingSelection = {
  tier: ShippingTier
  valor: number
  prazoDias: number
  codigoServico: string
  transportadora?: string
  nomeServico?: string
}

/**
 * O que o cliente recebe. Sem transportadora, sem nome nem código de serviço:
 * esses campos identificam a empresa, e a decisão de escondê-la não valeria
 * nada se eles continuassem trafegando para o navegador.
 *
 * O cliente devolve apenas o `tier`. O servidor recota e redescobre o serviço
 * correspondente — ver `escolherTiers` em `@/lib/shipping/tiers`.
 */
export type ShippingOptionPublic = {
  tier: ShippingTier
  valor: number
  /** Prazo cru do transporte. A margem de segurança é somada só na exibição. */
  prazoDias: number
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
