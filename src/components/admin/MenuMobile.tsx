'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Botão de menu e véu da gaveta, para telas estreitas.
 *
 * Até 29/08/2026 a barra lateral simplesmente recebia `display: none` abaixo
 * de 860 px e nada tomava o lugar dela: no celular não havia como sair da tela
 * em que se estava.
 *
 * O estado vive aqui e vira uma classe no `.admin-shell`, em vez de o layout
 * inteiro virar componente de cliente por causa de um botão. O CSS faz o resto.
 */
export function MenuMobile() {
  const [aberto, setAberto] = useState(false)
  // O véu só existe depois da hidratação: `createPortal` precisa do document.
  const [montado, setMontado] = useState(false)
  const pathname = usePathname()

  useEffect(() => setMontado(true), [])

  const fechar = useCallback(() => setAberto(false), [])

  // Navegou, fecha. Sem isto a gaveta fica por cima da tela que acabou de abrir.
  useEffect(() => {
    setAberto(false)
  }, [pathname])

  useEffect(() => {
    const shell = document.querySelector('.admin-shell')
    if (!shell) return
    shell.classList.toggle('admin-shell--menu-aberto', aberto)
    // Trava a rolagem atrás da gaveta: rolar o conteúdo enquanto o menu está
    // por cima é o jeito mais rápido de perder o lugar onde se estava.
    document.body.style.overflow = aberto ? 'hidden' : ''
    return () => {
      shell.classList.remove('admin-shell--menu-aberto')
      document.body.style.overflow = ''
    }
  }, [aberto])

  // Esc fecha, como qualquer camada sobreposta.
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  return (
    <>
      <button
        type="button"
        className="admin-menu-botao"
        onClick={() => setAberto((v) => !v)}
        aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={aberto}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {aberto ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <>
              <path d="M3 12h18" />
              <path d="M3 6h18" />
              <path d="M3 18h18" />
            </>
          )}
        </svg>
      </button>

      {/* O véu vai para o body, não fica aqui dentro.
          O `.admin-topo` tem `position: sticky`, `z-index` e `backdrop-filter`
          — cada um deles sozinho já cria contexto de empilhamento, e um filho
          `position: fixed` fica preso dentro dele. O véu nasceria por baixo do
          conteúdo em vez de cobrir a tela. */}
      {montado && aberto
        ? createPortal(
            <button
              type="button"
              className="admin-menu-veu"
              onClick={fechar}
              aria-label="Fechar menu"
            />,
            document.body,
          )
        : null}
    </>
  )
}
