import { QuizResponse, ProtocolItem } from '@/types/protocol'

const PRODUCTS = {
  BERBERINA_STD: {
    id: 'berberina-convencional',
    name: 'Berberina',
    skus: {
      '1mes': 'DD-BERB-STD-0X30',
      '3meses': 'DD-BERB-STD-0X90',
      '1ano': 'DD-BERB-STD-0X360',
    },
  },
  NEUROPATIA: {
    id: 'neuropatia',
    name: 'Neuropatia',
    skus: {
      '1mes': 'DD-NEURO-STD-0X30',
      '3meses': 'DD-NEURO-STD-0X90',
      '1ano': 'DD-NEURO-STD-0X360',
    },
  },
  OMEGA3: {
    id: 'omega3',
    name: 'Ômega 3',
    skus: {
      '1mes': 'DD-OMG3-STD-0X30',
      '3meses': 'DD-OMG3-STD-0X90',
      '1ano': 'DD-OMG3-STD-0X360',
    },
  },
} as const

export function generateProtocol(
  quiz: QuizResponse,
  planType: '1mes' | '3meses' | '1ano' = '1mes'
): ProtocolItem[] {
  const items: ProtocolItem[] = []

  items.push({
    product_id: PRODUCTS.BERBERINA_STD.id,
    product_name: PRODUCTS.BERBERINA_STD.name,
    pharmacy_sku: PRODUCTS.BERBERINA_STD.skus[planType],
    is_required: true,
    activation_reason: 'Protocolo base para controle glicêmico',
    quantity: 1,
  })

  const ativaNeuropatia =
    quiz.years_diagnosed === '5-10anos' ||
    quiz.years_diagnosed === '>10anos' ||
    quiz.medications.includes('metformina')

  if (ativaNeuropatia) {
    const reason = quiz.medications.includes('metformina')
      ? 'Metformina prolongada aumenta o risco de neuropatia periférica'
      : 'Diagnóstico há mais de 5 anos aumenta o risco de neuropatia periférica'

    items.push({
      product_id: PRODUCTS.NEUROPATIA.id,
      product_name: PRODUCTS.NEUROPATIA.name,
      pharmacy_sku: PRODUCTS.NEUROPATIA.skus[planType],
      is_required: false,
      activation_reason: reason,
      quantity: 1,
    })
  }

  const hasSymptoms =
    quiz.symptoms.length > 0 && !quiz.symptoms.includes('nenhum')

  if (hasSymptoms) {
    items.push({
      product_id: PRODUCTS.OMEGA3.id,
      product_name: PRODUCTS.OMEGA3.name,
      pharmacy_sku: PRODUCTS.OMEGA3.skus[planType],
      is_required: false,
      activation_reason: 'Indicado para sintomas neurológicos e inflamatórios',
      quantity: 1,
    })
  }

  if (quiz.allergies) {
    const alergiaLower = quiz.allergies.toLowerCase()
    return items.filter((item) => {
      if (alergiaLower.includes('berberina') && item.product_id.includes('berberina')) return false
      if (alergiaLower.includes('b12') || alergiaLower.includes('cobalamina')) {
        if (item.product_id === 'neuropatia') return false
      }
      if (alergiaLower.includes('omega') || alergiaLower.includes('peixe')) {
        if (item.product_id === 'omega3') return false
      }
      return true
    })
  }

  return items
}
