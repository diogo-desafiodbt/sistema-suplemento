export type SupplementContent = {
  slug: string
  name: string
  headline: string
  description: string
  composition: { ativo: string; dose: string }[]
  heroHorizontal: string
  heroVertical: string
  usage: string
  scienceNote: string
  gallery: string[]
}

export const supplements: SupplementContent[] = [
  {
    slug: 'neuropatia',
    name: 'Neuropatia',
    headline: 'Alívio e suporte nutricional personalizado para os nervos',
    description: 'Combata os sintomas com suporte especializado — com R-ALA, Benfotiamina e B12 Ativa.',
    composition: [
      { ativo: 'Benfotiamina', dose: '50 mg' },
      { ativo: 'Ácido Alfa Lipóico (ALA)', dose: '100 mg' },
      { ativo: 'Acetil-L-Carnitina HCl', dose: '100 mg' },
      { ativo: 'Piridoxina (Vitamina B6)', dose: '10 mg' },
    ],
    heroHorizontal: '/banners/banner-neuropatia-horizontal.png',
    heroVertical: '/banners/banner-neuropatia-vertical.png',
    usage: 'Tomar 1 dose, 2 vezes ao dia. 60 doses.',
    scienceNote:
      'Benfotiamina, ácido alfa-lipoico e acetil-L-carnitina têm estudos clínicos associados à redução de dor, dormência e formigamento em quadros de neuropatia diabética.',
    gallery: ['/categorias/categoria-neuropatia.png'],
  },
  {
    slug: 'resistencia-insulina',
    name: 'Resistência à Insulina',
    headline: 'Fórmula personalizada para equilibrar sua glicemia',
    description:
      'Com R-ALA, Canela e Melão de São Caetano para ajudar no equilíbrio da resistência à insulina.',
    composition: [
      { ativo: 'R-Ácido Alfa Lipóico estabilizado (R-ALA)', dose: '50 mg' },
      { ativo: 'Melão de São Caetano (Momordica charantia, ext. seco pad.)', dose: '300 mg' },
      { ativo: 'Canela (Cinnamomum, ext. seco pad.)', dose: '300 mg' },
    ],
    heroHorizontal: '/banners/banner-resistencia-insulina-horizontal.png',
    heroVertical: '/banners/banner-resistencia-insulina-vertical.png',
    usage: 'Tomar 1 dose, 2 vezes ao dia. 60 doses.',
    scienceNote:
      'Canela e ácido alfa-lipoico têm sido estudados por seu papel no equilíbrio da glicemia e da sensibilidade à insulina.',
    gallery: ['/categorias/categoria-resistencia-insulina.png'],
  },
  {
    slug: 'berberina',
    name: 'Berberina',
    headline: 'O ativo central do protocolo Desafio Diabetes',
    description:
      'A Berberina é um dos ativos naturais mais estudados no apoio ao controle glicêmico, auxiliando no equilíbrio da glicemia e da resistência à insulina.',
    composition: [
      { ativo: 'Berberina HCl (mín. 97%)', dose: '250 mg' },
      { ativo: 'Gymnema sylvestre (extrato seco padronizado)', dose: '150 mg' },
      { ativo: 'Picolinato de Cromo', dose: '200 mcg' },
    ],
    heroHorizontal: '/banners/banner-berberina-horizontal.png',
    heroVertical: '/banners/banner-berberina-vertical.png',
    usage: 'Tomar 1 dose, 2 vezes ao dia. Aviar 60 doses.',
    scienceNote:
      'A Berberina é um dos ativos naturais mais estudados no apoio ao controle glicêmico — pesquisas com dezenas de ensaios clínicos mostram redução de glicemia e hemoglobina glicada.',
    gallery: ['/categorias/categoria-berberina.png'],
  },
  {
    slug: 'omega3',
    name: 'Ômega 3',
    headline: 'Suporte anti-inflamatório para quem convive com diabetes',
    description:
      'Indicado para sintomas neurológicos e inflamatórios frequentemente associados ao diabetes.',
    composition: [
      { ativo: 'EPA (Ácido Eicosapentaenoico)', dose: '360 mg' },
      { ativo: 'DHA (Ácido Docosahexaenoico)', dose: '240 mg' },
    ],
    heroHorizontal: '/banners/banner-omega3-horizontal.png',
    heroVertical: '/banners/banner-omega3-vertical.png',
    usage: 'Tomar 1 dose ao dia. 30 doses.',
    scienceNote:
      'O Ômega-3 (EPA/DHA) tem evidência consistente na redução de triglicerídeos, um marcador cardiovascular frequentemente alterado em quem convive com diabetes.',
    gallery: ['/categorias/categoria-omega3.png'],
  },
]

export function getSupplementBySlug(slug: string) {
  return supplements.find((s) => s.slug === slug)
}
