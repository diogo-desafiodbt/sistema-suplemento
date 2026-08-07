/** Remove dados sensíveis de payloads Pagar.me antes de log/DB. */
export function summarizePagarmePayload(
  data: unknown,
): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { raw_type: typeof data }
  }

  const d = data as Record<string, unknown>
  const charges = Array.isArray(d.charges)
    ? d.charges.map((c) => {
        if (!c || typeof c !== 'object') return null
        const charge = c as Record<string, unknown>
        return {
          id: charge.id,
          status: charge.status,
          amount: charge.amount,
          paid_amount: charge.paid_amount,
          payment_method: charge.payment_method,
        }
      })
    : undefined

  const cycle =
    d.current_cycle && typeof d.current_cycle === 'object'
      ? {
          id: (d.current_cycle as Record<string, unknown>).id,
          status: (d.current_cycle as Record<string, unknown>).status,
        }
      : undefined

  return {
    id: d.id,
    status: d.status,
    message: d.message,
    charges,
    current_cycle: cycle,
  }
}
