'use client'

import { useState } from 'react'

export function CopyButton({
  value,
  label,
}: {
  value: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs font-bold text-[#13244f] bg-[#13244f]/5 hover:bg-[#13244f]/10 px-2.5 py-1 rounded-lg transition"
    >
      {copied ? 'Copiado ✓' : (label ?? 'Copiar')}
    </button>
  )
}
