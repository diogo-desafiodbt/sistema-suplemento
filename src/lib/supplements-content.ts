export type SupplementContent = {
  slug: string
  name: string
  headline: string
  description: string
  composition: { ativo: string; dose: string }[]
  heroHorizontal: string
  heroVertical: string
  usage: string
  gallery: string[]
}

export const supplements: SupplementContent[] = [
  {
    slug: 'neuropatia',
    name: 'Neuropatia',
    headline: 'Alívio e suporte nutricional personalizado para os nervos',
    description: 'Combata os sintomas com suporte especializado — com R-ALA, Benfotiamina e B12 Ativa.',
    composition: [
      { ativo: 'Bio-enhanced R-Lipoic Acid (R-ALA)', dose: '50 mg' },
      { ativo: 'Metilcobalamina (Vit. B12 ativo)', dose: '500 mcg' },
      { ativo: 'Benfotiamina (Vit. B1 lipossolúvel)', dose: '150 mg' },
      { ativo: 'Ácido Gama-Linolênico (GLA)', dose: '100 mg' },
    ],
    heroHorizontal: '/banners/banner-neuropatia-horizontal.png',
    heroVertical: '/banners/banner-neuropatia-vertical.png',
    usage: 'Tomar 1 dose, 2 vezes ao dia.',
    gallery: [
      '/categorias/categoria-neuropatia.png',
    ],
  },
  {
    slug: 'resistencia-insulina',
    name: 'Resistência à Insulina',
    headline: 'Fórmula personalizada para equilibrar sua glicemia',
    description: 'Com R-ALA, Canela e Melão de São Caetano para ajudar no equilíbrio da resistência à insulina.',
    composition: [
      { ativo: 'R-Ácido Alfa Lipóico estabilizado (R-ALA)', dose: '30 mg' },
      { ativo: 'Melão de São Caetano (ext. seco pad.)', dose: '300 mg' },
      { ativo: 'Canela (ext. seco pad.)', dose: '300 mg' },
    ],
    heroHorizontal: '/banners/banner-resistencia-insulina-horizontal.png',
    heroVertical: '/banners/banner-resistencia-insulina-vertical.png',
    usage: 'Tomar 1 dose, 2 vezes ao dia.',
    gallery: [
      '/categorias/categoria-resistencia-insulina.png',
    ],
  },
  {
    slug: 'berberina',
    name: 'Berberina',
    headline: 'O ativo central do protocolo Desafio Diabetes',
    description: 'Estudos mostram que a Berberina age em mecanismos metabólicos similares à Metformina, auxiliando no controle da glicemia e da resistência à insulina.',
    composition: [],
    heroHorizontal: '/banners/banner-berberina-horizontal.png',
    heroVertical: '/banners/banner-berberina-vertical.png',
    usage: 'Tomar 1 dose, 2 vezes ao dia.',
    gallery: [
      '/categorias/categoria-berberina.png',
    ],
  },
  {
    slug: 'omega3',
    name: 'Ômega 3',
    headline: 'Suporte anti-inflamatório para quem convive com diabetes',
    description: 'Indicado para sintomas neurológicos e inflamatórios frequentemente associados ao diabetes.',
    composition: [],
    heroHorizontal: '/banners/banner-omega3-horizontal.png',
    heroVertical: '/banners/banner-omega3-vertical.png',
    usage: 'Tomar 1 dose, 2 vezes ao dia.',
    gallery: [
      '/categorias/categoria-omega3.png',
    ],
  },
]

export function getSupplementBySlug(slug: string) {
  return supplements.find((s) => s.slug === slug)
}
