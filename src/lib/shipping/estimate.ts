export const PHARMACY_HANDLING_DAYS = 2
export const SAFETY_MARGIN_DAYS = 3

/** Prazo exibido ao cliente = transporte + manipulação + margem de segurança. */
export function estimateCustomerDeliveryDays(prazoTransporteDias: number): number {
  return prazoTransporteDias + PHARMACY_HANDLING_DAYS + SAFETY_MARGIN_DAYS
}

/** Soma dias úteis (pula sábado e domingo; não considera feriados). */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay() // 0 = domingo, 6 = sábado
    if (day !== 0 && day !== 6) added++
  }
  return result
}
