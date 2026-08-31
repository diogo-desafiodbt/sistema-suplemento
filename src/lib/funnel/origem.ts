// Captura da origem: quem trouxe esta pessoa até aqui.
//
// A origem chega como `?o=apelido` no endereço. Não existe subdomínio
// encurtador nem função redirecionadora: a página em si é o destino, e o
// carregamento dela é o clique. Um serviço só para contar clique e mandar
// para o mesmo lugar seria mais uma peça, mais um custo e mais uma coisa
// para cair, sem responder nada que a visita não responda.
//
// A gravação dura um ano, junto com o identificador do visitante. É esse
// prazo que faz o vídeo de março receber crédito pela compra de maio.

const COOKIE = 'dd_origem'
const UM_ANO = 60 * 60 * 24 * 365

/** `.desafiodiabetes.com`; nada em localhost, que não aceita ponto. */
function dominio(): string {
  const host = window.location.hostname
  if (host === 'localhost' || /^[\d.]+$/.test(host)) return ''
  return `; domain=.${host.split('.').slice(-2).join('.')}`
}

function ler(): string | null {
  for (const parte of document.cookie.split(';')) {
    const t = parte.trim()
    if (t.startsWith(`${COOKIE}=`)) {
      return decodeURIComponent(t.slice(COOKIE.length + 1))
    }
  }
  return null
}

/**
 * Grava a origem, se vier uma no endereço e ainda não houver uma gravada.
 *
 * A primeira ganha, e é de propósito: o crédito é de quem trouxe a pessoa.
 * Se a última ganhasse, a visita em que ela digita o endereço direto para
 * comprar apagaria o vídeo que fez o trabalho.
 *
 * Devolve a origem em vigor, para quem quiser mandar junto com o evento.
 */
export function capturarOrigem(): string | null {
  if (typeof window === 'undefined') return null

  const gravada = ler()
  if (gravada) return gravada

  const nova = new URLSearchParams(window.location.search).get('o')
  // Apelido é rótulo nosso, não texto de usuário: letras, números, hífen e
  // ponto, até 60. Qualquer coisa fora disso é lixo ou tentativa.
  if (!nova || !/^[\w.-]{1,60}$/.test(nova)) return null

  const seguro = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${COOKIE}=${encodeURIComponent(nova)}; path=/; max-age=${UM_ANO}` +
    `${dominio()}; SameSite=Lax${seguro}`

  return nova
}
