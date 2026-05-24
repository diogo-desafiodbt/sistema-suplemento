export function getPatientOrderStatus(status: string | null, trackingCode: string | null): string {
  if (status === 'delivered') return 'Entregue'
  if (status === 'dispatched' && trackingCode) return 'Em trânsito'
  return 'Pedido confirmado'
}

export function getPatientOrderStatusColor(message: string): string {
  if (message === 'Entregue') return 'bg-green-100 text-green-800'
  if (message === 'Em trânsito') return 'bg-amber-100 text-amber-800'
  return 'bg-blue-100 text-blue-800'
}
