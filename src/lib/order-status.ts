export function getPatientOrderStatus(
  status: string | null,
  trackingCode: string | null,
  pharmacySentAt?: string | null
): string {
  if (status === 'delivered') return 'Entregue'
  if (trackingCode) return 'Em trânsito'
  if (pharmacySentAt) return 'Em preparação na farmácia'
  return 'Pedido confirmado'
}

export function getPatientOrderStatusColor(message: string): string {
  if (message === 'Entregue') return 'bg-green-100 text-green-800'
  if (message === 'Em trânsito') return 'bg-amber-100 text-amber-800'
  if (message === 'Em preparação na farmácia') return 'bg-indigo-100 text-indigo-800'
  return 'bg-blue-100 text-blue-800'
}
