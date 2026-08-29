'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EsqueletoTabela } from '@/components/admin/Esqueleto'

type Props = {
  src: string
  titulo: string
}

const ALTURA_MINIMA = 480

export function AbaDeServico({ src, titulo }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [altura, setAltura] = useState(ALTURA_MINIMA)
  const [erro, setErro] = useState(false)
  // O iframe so comeca a carregar depois que o HTML da moldura chega, e ai
  // ainda espera a Lambda do satelite: ~557 ms de execucao mais ~262 ms de
  // partida a frio em 42% das visitas, medido em 29/08. Ate aqui a tela
  // mostrava um retangulo vazio de 480 px.
  const [carregando, setCarregando] = useState(true)

  const ajustarAltura = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument
      if (!doc?.documentElement) return

      const h = doc.documentElement.scrollHeight
      if (h > 0) {
        setAltura(Math.max(h, ALTURA_MINIMA))
        setErro(false)
      }
    } catch {
      setErro(true)
    }
  }, [])

  useEffect(() => {
    setErro(false)
    setCarregando(true)
    setAltura(ALTURA_MINIMA)
  }, [src])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let observer: ResizeObserver | undefined

    const onLoad = () => {
      setCarregando(false)
      try {
        const doc = iframe.contentDocument
        if (!doc?.body) {
          setErro(true)
          return
        }

        ajustarAltura()
        observer = new ResizeObserver(() => ajustarAltura())
        observer.observe(doc.body)
        setErro(false)
      } catch {
        setErro(true)
      }
    }

    iframe.addEventListener('load', onLoad)
    return () => {
      iframe.removeEventListener('load', onLoad)
      observer?.disconnect()
    }
  }, [src, ajustarAltura])

  if (erro) {
    return (
      <div className="admin-card admin-vazio">
        <p className="admin-vazio-titulo">
          Não conseguimos carregar esta aba agora.
        </p>
        <p className="admin-vazio-texto">
          O serviço não respondeu. Tentar de novo costuma resolver.
        </p>
        <div className="admin-vazio-acao">
          <a href={src} className="admin-btn admin-btn--primario">
            Tentar de novo
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-quadro-servico" style={{ minHeight: altura }}>
      <iframe
        ref={iframeRef}
        src={src}
        title={titulo}
        style={{
          height: altura,
          overflow: 'hidden',
          opacity: carregando ? 0 : 1,
        }}
        scrolling="no"
      />
      {carregando ? (
        <div className="admin-quadro-esqueleto" aria-hidden>
          <EsqueletoTabela linhas={6} />
        </div>
      ) : null}
    </div>
  )
}
