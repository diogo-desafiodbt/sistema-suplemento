'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const DURATION_MS = 10_000
const REDUCED_DURATION_MS = 6_000

const STATUS_MESSAGES = [
  'Analisando suas respostas...',
  'Cruzando com nosso banco de formulações...',
  'Montando sua recomendação...',
] as const

const INSTITUTIONAL_TEXT =
  'Desenvolvido por Dr. Turí Souza, com as maiores farmácias de manipulação do Brasil.'

/** Ease-out cúbico: rápido no início, desacelera perto do fim. */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function statusIndexForProgress(progress: number): number {
  if (progress < 0.34) return 0
  if (progress < 0.72) return 1
  return 2
}

function StatusIcon({ index, animate }: { index: number; animate: boolean }) {
  const spin = animate ? 'animate-pulse' : ''
  if (index === 0) {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        className={spin}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" stroke="#13244f" strokeWidth="1.8" />
        <path
          d="M16.5 16.5L21 21"
          stroke="#f4001e"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (index === 1) {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        className={spin}
        aria-hidden="true"
      >
        <path
          d="M4 7h16M4 12h10M4 17h14"
          stroke="#13244f"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="18" cy="12" r="2.5" fill="#f4001e" />
      </svg>
    )
  }
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      className={spin}
      aria-hidden="true"
    >
      <path
        d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"
        stroke="#13244f"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 12h14"
        stroke="#f4001e"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function RecomendacoesCarregandoPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [statusIndex, setStatusIndex] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const itemsRaw = sessionStorage.getItem('protocol_items')
    const triagemRaw = sessionStorage.getItem('triagem_data')
    if (!itemsRaw || !triagemRaw) {
      router.replace('/quiz')
      return
    }

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    queueMicrotask(() => setReduceMotion(prefersReduced))

    const duration = prefersReduced ? REDUCED_DURATION_MS : DURATION_MS
    const startedAt = performance.now()
    let raf = 0
    let cancelled = false

    const tick = (now: number) => {
      if (cancelled) return
      const linear = Math.min(1, (now - startedAt) / duration)
      const eased = easeOutCubic(linear)
      setProgress(eased)
      setStatusIndex(statusIndexForProgress(eased))

      if (linear < 1) {
        raf = window.requestAnimationFrame(tick)
      } else {
        router.replace('/recomendacoes')
      }
    }

    raf = window.requestAnimationFrame(tick)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [router])

  const percent = Math.round(progress * 100)
  const message = STATUS_MESSAGES[statusIndex]

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      <header className="px-6 pt-5 pb-2">
        <div className="max-w-lg mx-auto">
          <Image
            src="/logo-azul.png"
            alt="Desafio Diabetes"
            width={455}
            height={355}
            className="h-7 w-auto"
            priority
          />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-white border border-[#13244f]/10 shadow-sm flex items-center justify-center">
              <StatusIcon index={statusIndex} animate={!reduceMotion} />
            </div>
            <p
              className="font-display text-xl md:text-2xl text-[#13244f] min-h-[2.5rem]"
              aria-live="polite"
            >
              {message}
            </p>
          </div>

          <div className="space-y-2">
            <div
              className="h-2.5 rounded-full bg-[#13244f]/10 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Preparando sua recomendação"
            >
              <div
                className="h-full rounded-full bg-[#f4001e]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-[#13244f]/50 text-right font-medium tabular-nums">
              {percent}%
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-5 md:px-6 md:py-6">
            <p className="text-[10px] font-bold tracking-widest text-[#f4001e] uppercase mb-3">
              Desafio Diabetes
            </p>
            <p
              className={`text-sm md:text-base text-[#13244f]/85 leading-relaxed ${
                reduceMotion ? '' : '[animation:pulse_4s_ease-in-out_infinite]'
              }`}
            >
              {INSTITUTIONAL_TEXT}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
