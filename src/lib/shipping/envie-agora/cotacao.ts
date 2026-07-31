import { getSenderAddress } from '@/lib/shipping/sender-region'
import { envieAgoraFetch } from './client'
import type {
  CotacaoRequest,
  CotacaoResponse,
  PackageDimensions,
  PrecoPrazoItem,
} from '@/types/shipping'

export async function getCotacao(params: {
  cepdestino: string
  destinoUf: string
  valordeclarado: number
  dimensions: PackageDimensions
}): Promise<PrecoPrazoItem[]> {
  const sender = await getSenderAddress(params.destinoUf)
  const ceporigem = sender.cep
  const cepdestino = params.cepdestino.replace(/\D/g, '')

  const body: CotacaoRequest = {
    ceporigem,
    cepdestino,
    altura: params.dimensions.altura,
    largura: params.dimensions.largura,
    comprimento: params.dimensions.comprimento,
    peso: params.dimensions.peso,
    valordeclarado: params.valordeclarado,
    avisorecebimento: 'N',
    maopropria: 'N',
  }

  const raw = (await envieAgoraFetch('/precosprazos', body)) as CotacaoResponse
  return raw?.data?.precosprazos ?? []
}
