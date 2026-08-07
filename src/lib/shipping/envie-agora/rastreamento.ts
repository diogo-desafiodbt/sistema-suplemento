import type {
  RastreamentoRequest,
  RastreamentoResponse,
} from '@/types/shipping'
import { envieAgoraFetch } from './client'

export async function getRastreamento(
  id_requisicao: string,
): Promise<RastreamentoResponse> {
  const body: RastreamentoRequest = { id_requisicao }
  return (await envieAgoraFetch('/rastreamento', body)) as RastreamentoResponse
}
