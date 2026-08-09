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
  warningNote?: string
}

export const supplements: SupplementContent[] = [
  {
    slug: 'neuropatia',
    name: 'Neuro Complex',
    headline: 'Suporte nutricional à saúde dos nervos.',
    description: 'Suporte nutricional à saúde dos nervos.',
    composition: [
      { ativo: 'Benfotiamina', dose: '50 mg' },
      { ativo: 'Ácido Alfa Lipóico', dose: '100 mg' },
      { ativo: 'Acetil-L-Carnitina HCl', dose: '100 mg' },
      { ativo: 'Piridoxina (Vitamina B6)', dose: '10 mg' },
    ],
    heroHorizontal: '/banners/banner-neuropatia-horizontal.png',
    heroVertical: '/banners/banner-neuropatia-vertical.png',
    usage: '1 dose 2x ao dia. 60 doses.',
    scienceNote:
      'Benfotiamina, ácido alfa-lipoico e acetil-L-carnitina têm estudos clínicos associados ao suporte nutricional em quadros de neuropatia diabética.',
    gallery: ['/categorias/categoria-neuropatia.png'],
  },
  {
    slug: 'resistencia-insulina',
    name: 'R-Alpha Lipoic Complex',
    headline: 'Suporte à sensibilidade à insulina e ao metabolismo energético.',
    description:
      'Suporte à sensibilidade à insulina e ao metabolismo energético.',
    composition: [
      {
        ativo:
          'R-Ácido Alfa Lipóico estabilizado (R-ALA / Bio-enhanced R-Lipoic Acid)',
        dose: '50 mg',
      },
      {
        ativo:
          'Melão de São Caetano (Momordica charantia) extrato seco padronizado',
        dose: '300 mg',
      },
      {
        ativo:
          'Canela (Cinnamomum verum ou cassia) extrato seco padronizado',
        dose: '300 mg',
      },
    ],
    heroHorizontal: '/banners/banner-resistencia-insulina-horizontal.png',
    heroVertical: '/banners/banner-resistencia-insulina-vertical.png',
    usage: '1 dose 2x ao dia. 60 doses.',
    scienceNote:
      'Canela e ácido alfa-lipoico têm sido estudados por seu papel no equilíbrio da glicemia e da sensibilidade à insulina.',
    gallery: ['/categorias/categoria-resistencia-insulina.png'],
  },
  {
    slug: 'berberina',
    name: 'Berberine Complex',
    headline: 'Suporte ao equilíbrio da glicemia e do metabolismo da glicose.',
    description:
      'Suporte ao equilíbrio da glicemia e do metabolismo da glicose.',
    composition: [
      { ativo: 'Berberina HCl (mín. 97%)', dose: '250 mg' },
      {
        ativo: 'Gymnema sylvestre extrato seco padronizado',
        dose: '150 mg',
      },
      { ativo: 'Picolinato de Cromo', dose: '200 mcg' },
    ],
    heroHorizontal: '/banners/banner-berberina-horizontal.png',
    heroVertical: '/banners/banner-berberina-vertical.png',
    usage: '1 dose 2x ao dia. 60 doses.',
    scienceNote:
      'A Berberina é um dos ativos naturais mais estudados no apoio ao equilíbrio glicêmico.',
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
  {
    slug: 'polivitaminico',
    name: 'Metabolic Multivit',
    headline: 'Vitaminas e minerais essenciais para o metabolismo saudável.',
    description:
      'Vitaminas e minerais essenciais para o metabolismo saudável.',
    composition: [
      {
        ativo: 'Vitamina B12 — Metilcobalamina (forma ativa)',
        dose: '1000 mcg',
      },
      { ativo: 'Vitamina B9 — Metilfolato de cálcio', dose: '500 mcg' },
      {
        ativo: 'Zinco Bisglicinato Quelado',
        dose: '10 mg de zinco elementar',
      },
      {
        ativo: 'Magnésio Bisglicinato tamponado',
        dose: '100 mg de magnésio elementar',
      },
      {
        ativo: 'Vitamina D3 — Colecalciferol microencapsulado',
        dose: '4000 UI',
      },
      { ativo: 'Vitamina K2 — MK-7', dose: '120 mcg' },
    ],
    heroHorizontal: '/banners/banner-polivitaminico-horizontal.png',
    heroVertical: '/banners/banner-polivitaminico-vertical.png',
    usage:
      '1 dose ao dia, junto à principal refeição contendo gordura. 30 doses.',
    scienceNote:
      'Suporte nutricional complementar ao protocolo Desafio Diabetes.',
    gallery: ['/categorias/categoria-polivitaminico.png'],
  },
]

export function getSupplementBySlug(slug: string) {
  return supplements.find((s) => s.slug === slug)
}

/**
 * Casa um nome de produto (ex: vindo de order_items.products.name) com uma
 * entrada de conteúdo, mesmo padrão do matchProduct do CategoryCarousel.
 * Retorna a imagem principal (gallery[0]) ou null se não houver match.
 */
export function findSupplementImageByProductName(name: string): string | null {
  const needle = name.toLowerCase()
  const firstWord = needle.split(' ')[0]
  const match =
    supplements.find((s) => s.name.toLowerCase() === needle) ??
    supplements.find((s) => needle.includes(s.name.toLowerCase())) ??
    supplements.find((s) => s.name.toLowerCase().includes(firstWord))
  return match?.gallery[0] ?? null
}
