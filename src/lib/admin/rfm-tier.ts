/** Labels e cores dos tiers RFM (mesma escala do rfm-recalc). */

export const RFM_TIER_LABEL: Record<string, string> = {
  '1_campiao': 'Campeão',
  '2_dedicado': 'Dedicado',
  '3_promissor': 'Promissor',
  '4_estavel': 'Estável',
  '5_em_risco': 'Em risco',
  '6_hibernando': 'Hibernando',
  '7_perdido': 'Perdido',
}

export const RFM_TIER_BADGE: Record<string, string> = {
  '1_campiao': 'bg-green-50 text-green-700',
  '2_dedicado': 'bg-emerald-50 text-emerald-700',
  '3_promissor': 'bg-blue-50 text-blue-700',
  '4_estavel': 'bg-gray-100 text-gray-600',
  '5_em_risco': 'bg-amber-50 text-amber-700',
  '6_hibernando': 'bg-orange-50 text-orange-700',
  '7_perdido': 'bg-red-50 text-red-700',
}
