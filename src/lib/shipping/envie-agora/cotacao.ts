import { createAdminClient } from '@/lib/supabase/admin'
import { envieAgoraFetch } from './client'
import type {
  CotacaoRequest,
  CotacaoResponse,
  PackageDimensions,
  PrecoPrazoItem,
} from '@/types/shipping'

export async function getCotacao(params: {
  cepdestino: string
  valordeclarado: number
  dimensions: PackageDimensions
}): Promise<PrecoPrazoItem[]> {
  const admin = createAdminClient()
  const { data: configs } = await admin
    .from('system_config')
    .select('key, value')
    .eq('key', 'shipping_sender_cep')
    .maybeSingle()

  const ceporigem = (configs?.value ?? '80220030').replace(/\D/g, '')
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
