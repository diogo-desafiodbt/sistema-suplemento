/** Normaliza Message-ID removendo <> e espaços. */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.replace(/^<|>$/g, '').trim() || null
}

export function wrapMessageId(id: string): string {
  const normalized = normalizeMessageId(id) ?? id
  return normalized.startsWith('<') ? normalized : `<${normalized}>`
}
