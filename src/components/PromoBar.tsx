'use client'

import { useState, useEffect } from 'react'

export const pad = (n: number) => String(n).padStart(2, '0')

export function useCountdown() {
  const [t, setT] = useState({ h: 0, m: 0, s: 0 })
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const midnight = new Date()
      midnight.setHours(24, 0, 0, 0)
      const d = midnight.getTime() - now.getTime()
      setT({ h: Math.floor(d / 3600000), m: Math.floor(d / 60000) % 60, s: Math.floor(d / 1000) % 60 })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

export default function PromoBar() {
  const time = useCountdown()

  return (
    <div className="bg-[#13244f] text-white text-xs py-2 px-4 flex items-center justify-center gap-3 sticky top-0 z-40">
      <span className="font-medium">30% off no 1º pedido</span>
      <span className="opacity-40 hidden sm:inline">·</span>
      <div className="hidden sm:flex items-center gap-1.5">
        <span className="opacity-70">Termina em</span>
        {[{ v: time.h, l: 'h' }, { v: time.m, l: 'm' }, { v: time.s, l: 's' }].map(({ v, l }, i) => (
          <span key={l} className="flex items-center gap-0.5">
            {i > 0 && <span className="opacity-40">:</span>}
            <span className="font-bold">{pad(v)}</span>
            <span className="opacity-60">{l}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
