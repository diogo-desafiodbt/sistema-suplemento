export type Sex = 'homem' | 'mulher'
export type RenalCondition = 'hemodialise' | 'insuficiencia_renal_aguda' | 'tfg_menor_30'
export type HepaticCondition = 'cirrose' | 'hepatite_ativa' | 'ictericia' | 'esteatose'
export type DiagnosisType =
  | 'type1'
  | 'type2'
  | 'prediabetes'
  | 'lada_avancado'
  | 'undiagnosed'

export type TriageAnswers = {
  birth_date: string // ISO yyyy-mm-dd
  sex: Sex
  is_pregnant_or_breastfeeding: boolean // sempre false quando sex === 'homem'
  renal_conditions: RenalCondition[]
  hepatic_conditions: HepaticCondition[]
  diagnosis_type: DiagnosisType
  medications: string[] // informativo, não entra em nenhuma regra abaixo
}

export type ProductKey =
  | 'berberina'
  | 'neuropatia'
  | 'omega3'
  | 'polivitaminico'
  | 'resistencia_insulina'

export const PRODUCT_NAME_BY_KEY: Record<ProductKey, string> = {
  berberina: 'Berberina',
  neuropatia: 'Neuropatia',
  omega3: 'Ômega 3',
  polivitaminico: 'Polivitamínico',
  resistencia_insulina: 'Resistência à Insulina',
}

export const ALL_PRODUCT_KEYS: ProductKey[] = [
  'berberina',
  'neuropatia',
  'omega3',
  'polivitaminico',
  'resistencia_insulina',
]

export const DIAGNOSIS_LABELS: Record<string, string> = {
  type1: 'Diabetes Tipo 1',
  type2: 'Diabetes tipo 2',
  prediabetes: 'Pré-diabetes',
  lada_avancado: 'LADA avançado',
  undiagnosed: 'Não diagnosticado / histórico familiar',
}

export const RENAL_LABELS: Record<string, string> = {
  hemodialise: 'Hemodiálise',
  insuficiencia_renal_aguda: 'Insuficiência renal aguda',
  tfg_menor_30: 'TFG < 30',
}

export const HEPATIC_LABELS: Record<string, string> = {
  cirrose: 'Cirrose',
  hepatite_ativa: 'Hepatite ativa',
  ictericia: 'Icterícia',
  esteatose: 'Esteatose',
}

export function calcAge(birthDateIso: string): number {
  const birth = new Date(`${birthDateIso}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return 0
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age
}

export type TriageResult =
  | { blocked: true; blockReason: string }
  | {
      blocked: false
      allowed: ProductKey[]
      gates: Array<{ allowed: ProductKey[]; reason: string }>
    }

function intersect(a: ProductKey[], b: ProductKey[]): ProductKey[] {
  const setB = new Set(b)
  return a.filter(k => setB.has(k))
}

function sameSet(a: ProductKey[], b: ProductKey[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every(k => setB.has(k))
}

export function computeTriage(answers: TriageAnswers): TriageResult {
  if (calcAge(answers.birth_date) < 18) {
    return {
      blocked: true,
      blockReason: 'Vendemos apenas para maiores de 18 anos.',
    }
  }

  const gates: Array<{ allowed: ProductKey[]; reason: string }> = []

  if (answers.sex === 'mulher' && answers.is_pregnant_or_breastfeeding) {
    gates.push({
      allowed: ['omega3', 'polivitaminico'],
      reason:
        'Gravidez ou amamentação: por segurança, liberamos apenas Ômega 3 e Polivitamínico.',
    })
  }

  if (answers.renal_conditions.length > 0) {
    gates.push({
      allowed: ['omega3'],
      reason:
        'Condição renal informada: por segurança, liberamos apenas Ômega 3.',
    })
  }

  const hepaticSerious = answers.hepatic_conditions.filter(c => c !== 'esteatose')
  if (hepaticSerious.length > 0) {
    gates.push({
      allowed: ['omega3'],
      reason:
        'Condição hepática informada: por segurança, liberamos apenas Ômega 3.',
    })
  }

  if (
    answers.diagnosis_type === 'type1' ||
    answers.diagnosis_type === 'lada_avancado'
  ) {
    gates.push({
      allowed: ['neuropatia', 'polivitaminico', 'omega3'],
      reason:
        'Para esse perfil, liberamos Neuropatia, Polivitamínico e Ômega 3.',
    })
  }

  if (gates.length === 0) {
    return {
      blocked: false,
      allowed: [...ALL_PRODUCT_KEYS],
      gates: [],
    }
  }

  let allowed = [...ALL_PRODUCT_KEYS]
  for (const gate of gates) {
    allowed = intersect(allowed, gate.allowed)
  }

  return {
    blocked: false,
    allowed,
    gates,
  }
}

/** Sugestão automática para carrinho vazio, a partir do `allowed` da triagem. */
export function defaultSuggestion(allowed: ProductKey[]): ProductKey[] {
  if (sameSet(allowed, ALL_PRODUCT_KEYS)) return ['berberina']
  if (sameSet(allowed, ['omega3'])) return ['omega3']
  if (sameSet(allowed, ['omega3', 'polivitaminico'])) {
    return ['omega3', 'polivitaminico']
  }
  if (sameSet(allowed, ['neuropatia', 'polivitaminico', 'omega3'])) {
    return ['neuropatia']
  }
  return [...allowed]
}

/** Casa nome de produto da tabela `products` com ProductKey. */
export function productKeyFromName(name: string): ProductKey | null {
  const needle = name.toLowerCase().trim()
  if (!needle) return null

  for (const key of ALL_PRODUCT_KEYS) {
    if (PRODUCT_NAME_BY_KEY[key].toLowerCase() === needle) return key
  }

  const matches: ProductKey[] = []
  for (const key of ALL_PRODUCT_KEYS) {
    const label = PRODUCT_NAME_BY_KEY[key].toLowerCase()
    const firstWord = needle.split(/\s+/)[0] ?? ''
    if (!firstWord) continue
    if (needle.includes(label) || label.includes(firstWord)) {
      matches.push(key)
    }
  }

  // Na dúvida (0 ou >1), não adivinha.
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) {
    console.error(
      'productKeyFromName: nenhum produto do catálogo casou com o nome:',
      name
    )
  } else {
    console.error(
      'productKeyFromName: match ambíguo (mais de um produto); não resolvido:',
      name,
      { matches }
    )
  }
  return null
}

/** Motivo de bloqueio para um produto fora do `allowed`. */
export function blockReasonForProduct(
  key: ProductKey,
  gates: Array<{ allowed: ProductKey[]; reason: string }>
): string {
  const reasons = gates
    .filter((g) => !g.allowed.includes(key))
    .map((g) => g.reason)

  if (reasons.length === 0) {
    return 'Bloqueado por segurança clínica.'
  }
  if (reasons.length === 1) return reasons[0]
  return reasons.join(' ')
}
