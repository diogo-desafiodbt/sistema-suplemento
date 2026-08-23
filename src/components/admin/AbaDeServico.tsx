'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  src: string
  titulo: string
}

const ALTURA_MINIMA = 480

export function AbaDeServico({ src, titulo }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [altura, setAltura] = useState(ALTURA_MINIMA)
  const [erro, setErro] = useState(false)

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
    setAltura(ALTURA_MINIMA)
  }, [src])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let observer: ResizeObserver | undefined

    const onLoad = () => {
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
      <div className="admin-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <p className="admin-vazio-titulo" style={{ marginBottom: 12 }}>
          Não conseguimos carregar esta aba agora.
        </p>
        <a href={src} className="admin-btn admin-btn--primario">
          Tentar de novo
        </a>
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={titulo}
      className="w-full border-0 block"
      style={{ height: altura, overflow: 'hidden' }}
      scrolling="no"
    />
  )
}
