// Cadastro do comprador no Omie.
//
// Primeira escrita que o sistema faz lá — até aqui a integração era só
// leitura, um job diário puxando movimentos liquidados. O cliente vem antes de
// tudo porque no Omie o pedido e a nota fiscal pendem de um cliente existente.
//
// Nada aqui depende de definição fiscal. NCM, CFOP e tributação entram na
// etapa do pedido; o cadastro do cliente é nome, documento, contato e
// endereço, que o sistema já tem.

import { omiePost } from './client'

const CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

export type ClienteParaOmie = {
  userId: string
  nome: string
  email: string
  cpf: string
  telefone: string | null
  endereco: {
    cep: string
    logradouro: string
    numero: string
    complemento: string | null
    bairro: string
    cidade: string
    uf: string
  } | null
}

function digitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

/**
 * O telefone no Omie vai partido em DDD e número. Quem manda tudo junto vê o
 * cadastro entrar com o DDD dentro do número e nenhum erro na resposta.
 */
function telefonePartido(telefone: string | null): { ddd: string; numero: string } {
  const d = digitos(telefone)
  if (d.length < 10) return { ddd: '', numero: '' }
  return { ddd: d.slice(0, 2), numero: d.slice(2) }
}

/**
 * Cria ou atualiza o cliente, identificado pelo NOSSO id.
 *
 * `codigo_cliente_integracao` é um código escolhido por quem chama, e usar o
 * id do usuário torna a operação idempotente: chamar duas vezes atualiza, não
 * duplica. Sem isso seria preciso consultar por CPF antes de cada inclusão, e
 * duas compras simultâneas do mesmo cliente criariam dois cadastros.
 */
export async function upsertClienteNoOmie(
  cliente: ClienteParaOmie,
): Promise<number> {
  const cpf = digitos(cliente.cpf)
  if (cpf.length !== 11) {
    throw new Error(`Cliente ${cliente.userId} sem CPF válido para o Omie`)
  }

  const { ddd, numero } = telefonePartido(cliente.telefone)
  const end = cliente.endereco

  const resposta = await omiePost(CLIENTES_URL, 'UpsertCliente', {
    codigo_cliente_integracao: cliente.userId,
    razao_social: cliente.nome,
    nome_fantasia: cliente.nome,
    cnpj_cpf: cpf,
    email: cliente.email,
    pessoa_fisica: 'S',
    contribuinte: 'N',
    telefone1_ddd: ddd,
    telefone1_numero: numero,
    ...(end
      ? {
          cep: digitos(end.cep),
          endereco: end.logradouro,
          endereco_numero: end.numero,
          complemento: end.complemento ?? '',
          bairro: end.bairro,
          cidade: end.cidade,
          estado: end.uf,
          codigo_pais: '1058',
        }
      : {}),
    tags: [{ tag: 'Desafio Diabetes' }],
  })

  const codigo = Number(resposta.codigo_cliente_omie)
  if (!Number.isFinite(codigo) || codigo <= 0) {
    throw new Error(
      `Omie UpsertCliente não devolveu codigo_cliente_omie. Resposta: ${JSON.stringify(resposta)}`,
    )
  }
  return codigo
}
