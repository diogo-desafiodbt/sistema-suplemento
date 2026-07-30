import { envieAgoraFetch } from './client'
import type { RastreamentoRequest, RastreamentoResponse } from '@/types/shipping'

export async function getRastreamento(
  id_requisicao: string
): Promise<RastreamentoResponse> {
  const body: RastreamentoRequest = { id_requisicao }
  return (await envieAgoraFetch('/rastreamento', body)) as RastreamentoResponse
}
