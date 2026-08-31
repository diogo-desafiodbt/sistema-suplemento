'use client'

import { useEffect } from 'react'
import { capturarOrigem } from '@/lib/funnel/origem'
import { trackFunnelEvent } from '@/lib/funnel/track'

/**
 * Primeiro passo da jornada, disparado uma vez por carregamento de página.
 *
 * A ordem importa: capturar a origem antes de mandar o evento, senão a
 * primeira visita — justamente a que carrega de onde a pessoa veio — chega ao
 * Rastro sem origem, e ela é a única que interessa para atribuição.
 */
export function RegistrarVisita() {
  useEffect(() => {
    capturarOrigem()
    trackFunnelEvent('visita')
  }, [])

  return null
}
