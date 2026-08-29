'use client'

import { useState } from 'react'
import { normalizarCorpo } from '@/lib/support/corpo-email'

/**
 * Corpo de e-mail com as primeiras linhas à mostra e o resto a um clique.
 *
 * A fila de suporte é lida de cima a baixo: com o e-mail inteiro aberto em
 * cada conversa, o que se faz é rolar muito para achar a próxima. As primeiras
 * linhas costumam bastar para saber do que se trata; quando não bastam, o
 * botão abre.
 *
 * Só corta quando há o que cortar — texto curto não ganha botão nenhum.
 */
export function TextoDobravel({
  texto,
  linhas = 6,
}: {
  texto: string | null | undefined
  linhas?: number
}) {
  const [aberto, setAberto] = useState(false)
  const corpo = normalizarCorpo(texto)

  if (!corpo) return <p className="admin-sub">(vazio)</p>

  // Estimativa deliberadamente grosseira: quebras de linha mais uma conta de
  // caracteres por linha. Errar para o lado de mostrar o botão é barato; errar
  // para o lado de esconder texto sem aviso, não.
  const quebras = corpo.split('\n').length
  const longo = quebras > linhas || corpo.length > linhas * 90

  return (
    <div className="dobravel">
      <div
        className={`dobravel-corpo ${aberto ? '' : 'dobravel-corpo--fechado'}`}
        style={aberto ? undefined : { maxHeight: `${linhas * 1.55}em` }}
      >
        {corpo}
      </div>
      {longo ? (
        <button
          type="button"
          className="dobravel-botao"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
        >
          {aberto ? 'Recolher' : 'Ver e-mail completo'}
        </button>
      ) : null}
    </div>
  )
}
