'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSqlConteudo } from '@/lib/conteudo/db'

// O construtor do blog mora aqui desde 31/08/2026.
//
// Antes ele era uma tela do próprio serviço do blog, com login separado e
// papel de banco próprio. Duas portas para a mesma pessoa. O serviço do blog
// continua existindo e continua servindo o que o público lê — é ele que fica
// exposto ao robô de busca, e é por isso que ele nunca teve chave do banco
// clínico. O que veio para cá foi só a mesa de trabalho.
//
// As tabelas são as mesmas, no banco `conteudo`, e o núcleo já entrava lá
// pelo `job_conteudo` para ler Hotmart, Omie e YouTube. Não precisou de grant
// novo.

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic()
  return _anthropic
}

const TETO_CENTAVOS = '150' // US$ 1,50 por rascunho. O de teste custou 1 centavo.

function exigirVariavel(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome}`)
  return valor
}

/**
 * Dispara o agente redator a partir de um tema da fila.
 *
 * A linha do rascunho nasce primeiro, como "gerando", e só depois a sessão —
 * o webhook precisa do id do rascunho no `metadata` para saber onde gravar
 * quando o agente terminar.
 */
export async function gerarRascunho(temaId: string) {
  await exigirAdmin()
  const sql = getSqlConteudo()

  const [tema] = await sql<
    { theme: string; target_keywords: string[] | null; target_prompts: string[] | null }[]
  >`
    SELECT theme, target_keywords, target_prompts
    FROM blog_theme_backlog WHERE id = ${temaId}::uuid
  `
  if (!tema) throw new Error(`Tema não encontrado: ${temaId}`)

  const [rascunho] = await sql<{ id: string }[]>`
    INSERT INTO blog_drafts (theme_id, status)
    VALUES (${temaId}::uuid, 'gerando')
    RETURNING id
  `
  if (!rascunho) throw new Error('Falha ao criar rascunho')

  const pedido = [
    `Tema: ${tema.theme}`,
    tema.target_keywords?.length
      ? `Keywords alvo: ${tema.target_keywords.join(', ')}`
      : null,
    tema.target_prompts?.length
      ? `Prompts de IA que esse post deve responder: ${tema.target_prompts.join(' | ')}`
      : null,
  ].filter(Boolean)

  try {
    const sessao = await getAnthropic().beta.sessions.create({
      agent: exigirVariavel('AGENT_REDATOR_ID'),
      environment_id: exigirVariavel('ENVIRONMENT_ID'),
      metadata: { role: 'redator_draft', draft_id: rascunho.id },
      budget: {
        type: 'limit',
        max_list_cost: { amount: TETO_CENTAVOS, currency: 'USD' },
      },
      initial_events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: pedido.join('\n') }],
        },
      ],
    })

    await sql`
      UPDATE blog_drafts SET managed_agent_session_id = ${sessao.id}
      WHERE id = ${rascunho.id}::uuid
    `
    await sql`
      UPDATE blog_theme_backlog SET status = 'em_producao'
      WHERE id = ${temaId}::uuid
    `
  } catch (erro) {
    // Sem isto o rascunho fica preso em "gerando" para sempre, e a tela mente
    // dizendo que o agente ainda está escrevendo.
    await sql`
      UPDATE blog_drafts
      SET status = 'erro',
          content_md = ${`Falha ao criar sessão: ${erro instanceof Error ? erro.message : String(erro)}`}
      WHERE id = ${rascunho.id}::uuid
    `
    throw erro
  }

  revalidatePath('/suplementos/admin/blog')
}

export async function aprovarAfirmacao(
  afirmacaoId: string,
  aprovada: boolean,
  nota?: string,
) {
  await exigirAdmin()
  const [linha] = await getSqlConteudo()<{ draft_id: string }[]>`
    UPDATE blog_draft_claims
    SET approved = ${aprovada}, reviewer_note = ${nota ?? null}
    WHERE id = ${afirmacaoId}::uuid
    RETURNING draft_id
  `
  if (linha) revalidatePath(`/suplementos/admin/blog/rascunhos/${linha.draft_id}`)
}

export async function aprovarRascunho(rascunhoId: string) {
  await exigirAdmin()
  await getSqlConteudo()`
    UPDATE blog_drafts SET status = 'aprovado' WHERE id = ${rascunhoId}::uuid
  `
  revalidatePath(`/suplementos/admin/blog/rascunhos/${rascunhoId}`)
  revalidatePath('/suplementos/admin/blog')
}

export async function rejeitarRascunho(rascunhoId: string) {
  await exigirAdmin()
  await getSqlConteudo()`
    UPDATE blog_drafts SET status = 'rejeitado' WHERE id = ${rascunhoId}::uuid
  `
  revalidatePath(`/suplementos/admin/blog/rascunhos/${rascunhoId}`)
  revalidatePath('/suplementos/admin/blog')
}

/** Primeiro parágrafo real do markdown, cortado em ~155 caracteres. */
function primeiraFrase(markdown: string): string {
  const paragrafo = markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 40 && !l.startsWith('#') && !l.startsWith('|'))
  if (!paragrafo) return ''
  const limpo = paragrafo.replace(/[*_`[\]]/g, '')
  return limpo.length <= 155 ? limpo : `${limpo.slice(0, 152).trimEnd()}…`
}

function comoSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/**
 * Publica um rascunho aprovado.
 *
 * Tudo numa transação: o post nasce, o rascunho vira publicado e o tema sai
 * da fila juntos. Se fossem chamadas soltas e a segunda falhasse, o post
 * apareceria no site com o rascunho ainda "aprovado" e o tema preso em
 * produção — e ninguém perceberia até tentar publicar de novo.
 */
export async function publicarRascunho(rascunhoId: string) {
  await exigirAdmin()
  const sql = getSqlConteudo()

  const [ja] = await sql<{ slug: string }[]>`
    SELECT slug FROM blog_posts WHERE draft_id = ${rascunhoId}::uuid
  `
  if (ja) return

  const [rascunho] = await sql<
    { id: string; title: string | null; content_md: string | null; status: string; theme_id: string | null }[]
  >`
    SELECT id, title, content_md, status, theme_id
    FROM blog_drafts WHERE id = ${rascunhoId}::uuid
  `
  if (!rascunho) throw new Error('Rascunho não encontrado.')
  if (rascunho.status !== 'aprovado') {
    throw new Error(`Só publico rascunho aprovado — esse está como "${rascunho.status}".`)
  }
  if (!rascunho.title || !rascunho.content_md) {
    throw new Error('Rascunho sem título ou conteúdo — não dá pra publicar.')
  }

  const base = comoSlug(rascunho.title)
  const titulo = rascunho.title
  const conteudo = rascunho.content_md

  const slug = await sql.begin(async (tx) => {
    // O sufixo sai do banco, dentro da transação: dois publicares do mesmo
    // título ao mesmo tempo não escolhem o mesmo endereço.
    const [livre] = await tx<{ slug: string }[]>`
      SELECT COALESCE(
        (SELECT ${base}::text WHERE NOT EXISTS (
           SELECT 1 FROM blog_posts WHERE slug = ${base}::text)),
        ${base}::text || '-' || (
          SELECT COUNT(*) + 1 FROM blog_posts
          WHERE slug = ${base}::text OR slug LIKE ${`${base}-%`}::text)
      ) AS slug
    `
    const escolhido = livre.slug

    await tx`
      INSERT INTO blog_posts (
        draft_id, slug, title, content_md, meta_description,
        canonical_url, status
      ) VALUES (
        ${rascunho.id}::uuid, ${escolhido}, ${titulo}, ${conteudo},
        ${primeiraFrase(conteudo)},
        ${`https://desafiodiabetes.com/blog/${escolhido}`}, 'publicado'
      )
    `
    await tx`
      UPDATE blog_drafts SET status = 'publicado' WHERE id = ${rascunhoId}::uuid
    `
    if (rascunho.theme_id) {
      await tx`
        UPDATE blog_theme_backlog SET status = 'publicado'
        WHERE id = ${rascunho.theme_id}::uuid
      `
    }
    return escolhido
  })

  revalidatePath('/suplementos/admin/blog')
  revalidatePath(`/suplementos/admin/blog/rascunhos/${rascunhoId}`)
  return slug
}

/** A mesma publicação, na forma que `<form action>` aceita. */
export async function publicarNoForm(rascunhoId: string) {
  await publicarRascunho(rascunhoId)
}
