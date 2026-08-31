// A lista de episódios que o Diogo pode transformar em link de origem.
//
// Vem da Biblioteca de Transcrições, no banco `conteudo`, que já tem os 105
// episódios com o endereço do vídeo no YouTube. É a única lista de vídeos que
// existe hoje: `youtube_videos` está vazia desde a mudança para o RDS.
//
// O apelido sai do título, não é digitado. Apelido digitado à mão vira
// "yt-aula7", "yt_aula_7" e "ytaula7" — três origens no relatório para o
// mesmo vídeo, que é exatamente o problema que o catálogo existe para evitar.

import { getSqlConteudo } from '@/lib/conteudo/db'

export type Episodio = {
  titulo: string
  url: string | null
  apelido: string
}

/**
 * `Podcast #32 — Título` vira `yt-podcast-32`; `Aula #7 — Título` vira
 * `yt-aula-07`. O zero à esquerda é para a lista sair em ordem quando o
 * relatório ordenar por nome.
 */
function comoSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function apelidoDoTitulo(titulo: string): string {
  const m = titulo.match(/^(Podcast|Aula|Receita)\s*#?(\d+)/i)
  // Com número, o apelido é curto e legível: `yt-aula-07`.
  if (m) return `yt-${m[1].toLowerCase()}-${m[2].padStart(2, '0')}`

  // Sem número, o título inteiro entra. As receitas não são numeradas, e
  // `yt-receita` para todas elas colidiria — duas receitas viravam a mesma
  // origem no relatório.
  return `yt-${comoSlug(titulo)}`.slice(0, 60).replace(/-$/, '')
}

export async function episodios(): Promise<Episodio[]> {
  const linhas = await getSqlConteudo()<{ title: string; source_url: string | null }[]>`
    SELECT title, source_url FROM blog_transcriptions ORDER BY title
  `
  return linhas.map((l) => ({
    titulo: l.title,
    url: l.source_url,
    apelido: apelidoDoTitulo(l.title),
  }))
}
