/** Labels e tom dos tiers RFM (mesma escala do rfm-recalc). */

export const RFM_TIER_LABEL: Record<string, string> = {
  '1_campiao': 'Campeão',
  '2_dedicado': 'Dedicado',
  '3_promissor': 'Promissor',
  '4_estavel': 'Estável',
  '5_em_risco': 'Em risco',
  '6_hibernando': 'Hibernando',
  '7_perdido': 'Perdido',
}

/**
 * Tom do selo, nao classe de cor. Sete tiers em sete cores diferentes viravam
 * um arco-iris que nao dizia nada: o que interessa e se o cliente esta bem,
 * escorregando ou perdido. A cor mora no `admin.css`, com o resto.
 */
export const RFM_TIER_TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  '1_campiao': 'ok',
  '2_dedicado': 'ok',
  '3_promissor': 'ok',
  '4_estavel': 'neutro',
  '5_em_risco': 'atencao',
  '6_hibernando': 'atencao',
  '7_perdido': 'perigo',
}
