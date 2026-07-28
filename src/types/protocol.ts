export type DiagnosisType = 'type2' | 'prediabetes' | 'undiagnosed'
/** Novos planos: 1mes | assinatura_mensal. Legado: 3meses | 1ano (só dados antigos). */
export type PlanType = '1mes' | 'assinatura_mensal' | '3meses' | '1ano'
export type ProtocolStatus = 'pending_signature' | 'signed' | 'rejected'
export type RfmTier =
  | '1_campiao'
  | '2_dedicado'
  | '3_promissor'
  | '4_estavel'
  | '5_em_risco'
  | '6_hibernando'
  | '7_perdido'

export interface QuizResponse {
  diagnosis_type: DiagnosisType
  years_diagnosed: string
  hba1c_range: string | null
  fasting_glucose: string | null
  medications: string[]
  family_history: string[]
  symptoms: string[]
  conditions_mild: string[]
  conditions_serious: string[]
  weight_status: string | null
  exercise_freq: string | null
  diet_quality: string | null
  allergies: string | null
  prior_treatment: string[]
}

export interface ProtocolItem {
  product_id: string
  product_name: string
  pharmacy_sku: string
  is_required: boolean
  activation_reason: string
  quantity: number
}

export interface GeneratedProtocol {
  items: ProtocolItem[]
  quiz_response_id: string
}
