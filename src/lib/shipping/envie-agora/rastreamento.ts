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

/**
 * Consulta pelo número do objeto, para etiqueta que a Miligrama emitiu dentro
 * da nossa conta. Não temos o identificador da requisição nesses casos — a
 * requisição não nasceu aqui —, e o número do objeto é o que a farmácia nos
 * conta quando despacha.
 *
 * O nome do campo é `numero_objeto`, o mesmo que a Envie Agora usa no evento
 * de rastreio que ela empurra. Se ela esperar outro nome, o erro vai mostrar
 * a resposta inteira dela, que é o suficiente para corrigir numa linha.
 */
export async function getRastreamentoPorObjeto(
  numero_objeto: string,
): Promise<RastreamentoResponse> {
  return (await envieAgoraFetch('/rastreamento', {
    numero_objeto,
  })) as RastreamentoResponse
}
