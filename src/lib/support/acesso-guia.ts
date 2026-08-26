import { getSqlConteudo } from '@/lib/conteudo/db'

/**
 * Primeira orientação para quem não conseguiu acessar o guia.
 *
 * Decisão do Diogo em 25/08/2026: a IA dá a orientação inicial (procurar na
 * caixa, no spam, buscar por "Hotmart") e só manda para o Pedro se a pessoa
 * voltar dizendo que não funcionou.
 *
 * Texto fixo em código, como a resposta técnica. A IA não redige uma frase —
 * ela só decide QUAL dos textos usar, com base no que a consulta devolveu.
 * Assim não existe caminho para uma frase inventada chegar ao cliente.
 */

/**
 * Intenção de acesso, lida no texto CRU do cliente por expressão regular.
 * Não é a IA que decide isso: categoria `guia` cobre desde "quanto custou"
 * até "não consigo abrir", e só o segundo grupo recebe esta orientação.
 *
 * Falso positivo manda a orientação para quem não pediu, o que é chato.
 * Falso negativo manda para o Pedro, que é o comportamento de antes. Por isso
 * a lista é conservadora.
 */
const RE_ACESSO =
  /(n[ãa]o (recebi|chegou|veio|consigo|consegui)|perdi o acesso|sem acesso|como .{0,12}acess|n[ãa]o abre|n[ãa]o baixa|cad[êe] .{0,14}(guia|material|acesso|link)|onde .{0,14}(baix|acess|est[áa]|encontr))/i

export function pedeAcessoAoGuia(texto: string | null | undefined): boolean {
  return !!texto && RE_ACESSO.test(texto)
}

type Compra = {
  product_name: string | null
  order_date: string | Date | null
  status: string | null
  buyer_name: string | null
}

/** Situações da Hotmart em que a compra está paga e o envio já aconteceu. */
const PAGAS = new Set(['APPROVED', 'COMPLETE'])

export type RespostaAcesso =
  | { tipo: 'orientar'; texto: string }
  | { tipo: 'pagamento_pendente'; texto: string }
  | { tipo: 'escalar'; motivo: string }

/**
 * Nomes que a Hotmart entrega no lugar do nome de verdade. Um em 1.083 hoje,
 * e sem esta lista a pessoa receberia "Olá, SEM!". Uma em mil ainda é uma
 * pessoa lendo.
 */
const NAO_E_NOME = new Set([
  'SEM NOME', 'NAO INFORMADO', 'NÃO INFORMADO', 'N/A', 'NA',
  'TESTE', 'COMPRADOR', 'CLIENTE',
])

/**
 * Primeiro nome, em caixa de gente. Muita compra vem com o nome todo em
 * maiúsculas — "VIRGINIA" vira "Virginia", porque saudação em caixa alta soa
 * como grito.
 */
function saudacao(nome: string | null | undefined): string {
  const limpo = nome?.trim() ?? ''
  if (!limpo || NAO_E_NOME.has(limpo.toUpperCase())) return 'Olá!'
  const primeiro = limpo.split(/\s+/)[0] ?? ''
  if (primeiro.length < 2) return 'Olá!'
  // Caixa alta vira caixa de gente; caixa baixa ganha a inicial. O nome chega
  // como a pessoa digitou no checkout, e ali tem de tudo.
  const resto =
    primeiro === primeiro.toUpperCase()
      ? primeiro.slice(1).toLowerCase()
      : primeiro.slice(1)
  return `Olá, ${primeiro.charAt(0).toUpperCase()}${resto}!`
}

function dataBr(d: string | Date | null): string | null {
  if (!d) return null
  const dt = new Date(d)
  return Number.isNaN(dt.getTime())
    ? null
    : dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export async function orientarAcessoAoGuia(params: {
  emailRemetente: string
  nomeCliente?: string | null
}): Promise<RespostaAcesso> {
  const sql = getSqlConteudo()
  const linhas = await sql<Compra[]>`
    SELECT product_name, order_date, status, buyer_name
      FROM hotmart_sales
     WHERE lower(buyer_email) = ${params.emailRemetente.trim().toLowerCase()}
     ORDER BY order_date DESC NULLS LAST
     LIMIT 5
  `

  if (linhas.length === 0) {
    // Pode ser compra com outro e-mail. Procurar por outro endereço a pedido
    // de quem escreveu deste é exatamente o ataque que bloqueamos — então
    // este caso é do Pedro, por decisão de 25/08.
    return {
      tipo: 'escalar',
      motivo:
        'Nenhuma compra do guia neste e-mail. Pode ter comprado com outro endereço, e confirmar isso exige julgamento humano.',
    }
  }

  const paga = linhas.find((l) => PAGAS.has((l.status ?? '').toUpperCase()))
  // O nome vem da própria compra quando quem chama não tem: chamar a pessoa
  // pelo nome é o que separa uma resposta de atendimento de um aviso de robô,
  // e o dado já veio na mesma consulta.
  const abertura = saudacao(
    params.nomeCliente ?? paga?.buyer_name ?? linhas[0]?.buyer_name,
  )

  if (!paga) {
    const pendente = linhas[0]!
    const quando = dataBr(pendente.order_date)
    return {
      tipo: 'pagamento_pendente',
      texto: `${abertura}

Localizei sua compra do ${pendente.product_name ?? 'guia'}${quando ? `, feita em ${quando}` : ''}, mas o pagamento ainda não foi confirmado. É por isso que o acesso não chegou.

Assim que a Hotmart confirmar o pagamento, o guia é enviado automaticamente para o seu e-mail. Boleto e Pix podem levar algumas horas para compensar.

Se já passou mais de dois dias úteis, responda este e-mail que a gente verifica para você.

Equipe Desafio Diabetes`,
    }
  }

  const quando = dataBr(paga.order_date)
  return {
    tipo: 'orientar',
    texto: `${abertura}

Sua compra do ${paga.product_name ?? 'guia'} está confirmada aqui${quando ? `, feita em ${quando}` : ''}.

O guia é enviado por e-mail pela Hotmart logo depois da confirmação. Procure na sua caixa de entrada uma mensagem da Hotmart.

Se não achar, vale procurar em três lugares que costumam esconder: a caixa de spam, a lixeira e a aba de promoções. O jeito mais rápido é pesquisar por "Hotmart" na busca do seu e-mail — o endereço do remetente muda, mas o nome é sempre Hotmart.

Se mesmo assim não encontrar, responda este e-mail dizendo que não achou, que a gente reenvia para você.

Equipe Desafio Diabetes`,
  }
}
