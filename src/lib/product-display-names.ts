/**
 * Nome de EXIBIÇÃO dos produtos — não é o nome real (`products.name` no banco,
 * usado em PRODUCT_NAME_BY_KEY, checkout, farmácia, prescrição em PDF).
 * Nunca usar esse mapa em lugar que precise casar nome com o banco/farmácia —
 * só pra texto visível ao paciente/staff.
 */
export const PRODUCT_DISPLAY: Record<
  string,
  { name: string; ingredients?: string }
> = {
  'Berberine Complex': {
    name: 'Glicose Control',
    ingredients: 'Berberina + Gymnema + Picolinato de Cromo',
  },
  'R-Alpha Lipoic Complex': {
    name: 'Resistência à Insulina Complex',
    ingredients: 'Ácido R-Alfa Lipóico + Canela + Melão de São Caetano',
  },
  'Neuro Complex': {
    name: 'Neuropatia Support',
    ingredients:
      'Benfotiamina (B1) + Ácido Alfa Lipóico + Acetil-L-Carnitina + Piridoxina (B6)',
  },
  'Metabolic Multivit': {
    name: 'Polivitamínico Glicemic',
    ingredients:
      'Magnésio + D3 + K2 + Metilcobalamina (B12) + Metilfolato (B9) + Zinco',
  },
}

/** Retorna o nome de exibição; cai pro nome original se não estiver mapeado (ex. Ômega 3). */
export function getProductDisplayName(name: string): string {
  return PRODUCT_DISPLAY[name]?.name ?? name
}
