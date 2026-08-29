// Corpo de e-mail legível.
//
// A ingestão fazia `html.replace(/<[^>]+>/g, ' ')`: toda tag virava um espaço.
// Uma imagem sumia sem deixar rastro — a pessoa escrevia "olha a foto do meu
// exame" e a tela mostrava a frase seguida de nada. As quebras de linha
// sumiam junto, e o e-mail inteiro virava um parágrafo só.

/** O que aparece no lugar de uma imagem. */
export const MARCA_IMAGEM = '<imagem>'

/**
 * HTML de e-mail vira texto legível: imagem marcada, quebras preservadas.
 * Usado na ingestão, então vale para as mensagens que chegarem daqui em diante.
 */
export function htmlParaTexto(html: string): string {
  // Sentinela em vez da marca final: `<imagem>` tem cara de tag e seria comido
  // pelo `replace` que tira as tags logo abaixo. Vira a marca no fim.
  const SENTINELA = '\u0000IMG\u0000'
  return (
    html
      // Fora antes de tudo: `<style>` e `<script>` têm conteúdo que não é texto
      // do e-mail e apareceria inteiro depois que as tags saíssem.
      .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<img\b[^>]*>/gi, ` ${SENTINELA} `)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '· ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      // Espaço repetido sim, quebra de linha não: aqui a quebra é informação.
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .replaceAll(SENTINELA, MARCA_IMAGEM)
      .trim()
  )
}

/**
 * Normaliza o que já está gravado, na hora de exibir.
 *
 * As mensagens de antes desta mudança seguem no banco como foram salvas, e
 * cada cliente de e-mail marca imagem de um jeito. Isto acerta a exibição sem
 * reescrever histórico.
 */
export function normalizarCorpo(texto: string | null | undefined): string {
  if (!texto) return ''
  return (
    texto
      // Gmail, Apple Mail e Outlook, nesta ordem.
      .replace(/\[image:[^\]]*\]/gi, MARCA_IMAGEM)
      .replace(/\[cid:[^\]]*\]/gi, MARCA_IMAGEM)
      .replace(/\[Imagem removida pelo remetente[^\]]*\]/gi, MARCA_IMAGEM)
      // Imagem embutida que escapou como URL crua.
      .replace(/\bdata:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, MARCA_IMAGEM)
      .replace(/\bhttps?:\/\/\S+\.(png|jpe?g|gif|webp|bmp|svg)(\?\S*)?/gi, MARCA_IMAGEM)
      // Duas imagens seguidas viram uma: o cliente que manda assinatura com
      // logo repete a mesma imagem em toda mensagem da conversa.
      .replace(new RegExp(`(${MARCA_IMAGEM}\\s*){2,}`, 'g'), `${MARCA_IMAGEM} `)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
