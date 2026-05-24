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
  BERBERINA_HOM: {
    id: 'berberina-homeopata',
    name: 'Berberina Homeopata',
    skus: {
      '1mes': 'DD-BERB-HOM-0X30',
      '3meses': 'DD-BERB-HOM-0X90',
      '1ano': 'DD-BERB-HOM-0X360',
    },
  },
  VITAMINA_B12: {
    id: 'vitamina-b12',
    name: 'Vitamina B12',
    skus: {
      '1mes': 'DD-VTB12-STD-0X30',
      '3meses': 'DD-VTB12-STD-0X90',
      '1ano': 'DD-VTB12-STD-0X360',
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
  const hasSeriosCondition = quiz.conditions_serious.length > 0

  const berberina = hasSeriosCondition
    ? PRODUCTS.BERBERINA_HOM
    : PRODUCTS.BERBERINA_STD

  items.push({
    product_id: berberina.id,
    product_name: berberina.name,
    pharmacy_sku: berberina.skus[planType],
    is_required: true,
    activation_reason: hasSeriosCondition
      ? 'Berberina Homeopata indicada por condição de saúde séria'
      : 'Protocolo base para controle glicêmico',
    quantity: 1,
  })

  const ativaB12 =
    quiz.years_diagnosed === '5-10anos' ||
    quiz.years_diagnosed === '>10anos' ||
    quiz.medications.includes('metformina')

  if (ativaB12) {
    const reason = quiz.medications.includes('metformina')
      ? 'Metformina pode reduzir absorção de B12'
      : 'Diagnóstico há mais de 5 anos aumenta risco de deficiência de B12'

    items.push({
      product_id: PRODUCTS.VITAMINA_B12.id,
      product_name: PRODUCTS.VITAMINA_B12.name,
      pharmacy_sku: PRODUCTS.VITAMINA_B12.skus[planType],
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
        if (item.product_id === 'vitamina-b12') return false
      }
      if (alergiaLower.includes('omega') || alergiaLower.includes('peixe')) {
        if (item.product_id === 'omega3') return false
      }
      return true
    })
  }

  return items
}
