import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import { TERMS_CONTENT, TERMS_VERSION } from '@/lib/terms/content'

export const metadata: Metadata = {
  title: 'Termos de Uso — Desafio Diabetes',
  description:
    'Termos e Condições Gerais de Uso da plataforma Desafio Diabetes.',
}

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] = []

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'p', text: paragraph.join(' ') })
      paragraph = []
    }
  }

  function flushList() {
    if (list.length > 0) {
      blocks.push({ type: 'ul', items: list })
      list = []
    }
  }

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()

    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }
    if (line.startsWith('### ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'h3', text: line.slice(4) })
      continue
    }
    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'h2', text: line.slice(3) })
      continue
    }
    if (line.startsWith('# ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'h1', text: line.slice(2) })
      continue
    }
    if (line.startsWith('- ')) {
      flushParagraph()
      list.push(line.slice(2))
      continue
    }
    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return blocks
}

/** Renderiza negrito (**texto**) dentro de um trecho de texto. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos derivados de um split() de texto estático, sem id natural; a lista nunca é reordenada
        <strong key={i} className="font-semibold text-[#13244f]">
          {part.slice(2, -2)}
        </strong>
      )
    }
    // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos derivados de um split() de texto estático, sem id natural; a lista nunca é reordenada
    return <span key={i}>{part}</span>
  })
}

export default function TermosDeUsoPage() {
  const blocks = parseBlocks(TERMS_CONTENT)

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      <Header />

      <main className="flex-1 px-4 md:px-6 py-10 md:py-16">
        <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-10 md:px-12 md:py-14">
          {blocks.map((block, i) => {
            if (block.type === 'h1') {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: blocos vêm de um parser de markdown estático (TERMS_CONTENT), sem id natural; a lista nunca é reordenada
                <div key={i} className="mb-10">
                  <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-2">
                    Documento legal · versão {TERMS_VERSION}
                  </p>
                  <h1 className="font-display text-3xl md:text-4xl text-[#13244f] leading-tight">
                    {block.text}
                  </h1>
                </div>
              )
            }
            if (block.type === 'h2') {
              return (
                <h2
                  // biome-ignore lint/suspicious/noArrayIndexKey: blocos vêm de um parser de markdown estático, sem id natural; a lista nunca é reordenada
                  key={i}
                  className="font-display text-xl md:text-2xl text-[#13244f] mt-12 mb-4 pt-6 border-t border-gray-100"
                >
                  {block.text}
                </h2>
              )
            }
            if (block.type === 'h3') {
              return (
                <h3
                  // biome-ignore lint/suspicious/noArrayIndexKey: blocos vêm de um parser de markdown estático, sem id natural; a lista nunca é reordenada
                  key={i}
                  className="text-base md:text-lg font-bold text-[#13244f] mt-8 mb-3"
                >
                  {block.text}
                </h3>
              )
            }
            if (block.type === 'ul') {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: blocos vêm de um parser de markdown estático, sem id natural; a lista nunca é reordenada
                <ul key={i} className="space-y-2 mb-5 pl-1">
                  {block.items.map((item, j) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: itens de lista vêm de um parser de markdown estático, sem id natural; a lista nunca é reordenada
                      key={j}
                      className="flex gap-3 text-sm md:text-[15px] text-gray-600 leading-relaxed"
                    >
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#f4001e]" />
                      <span>{renderInline(item)}</span>
                    </li>
                  ))}
                </ul>
              )
            }
            return (
              <p
                // biome-ignore lint/suspicious/noArrayIndexKey: blocos vêm de um parser de markdown estático, sem id natural; a lista nunca é reordenada
                key={i}
                className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-5"
              >
                {renderInline(block.text)}
              </p>
            )
          })}
        </article>
      </main>

      <Footer />
    </div>
  )
}
