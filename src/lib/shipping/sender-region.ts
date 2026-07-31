import { createAdminClient } from '@/lib/supabase/admin'

const NORTE_NORDESTE_UFS = [
  'AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO',
  'AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE',
]

export function isNorteNordeste(uf: string): boolean {
  return NORTE_NORDESTE_UFS.includes(uf.trim().toUpperCase())
}

export type SenderAddress = {
  nome: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

const CURITIBA_DEFAULTS: SenderAddress = {
  nome: 'Miligrama Farmácia de Manipulação',
  cep: '80220030',
  logradouro: 'R. Des. Westphalen',
  numero: '2201',
  complemento: '',
  bairro: 'Rebouças',
  cidade: 'Curitiba',
  uf: 'PR',
}

const FORTALEZA_DEFAULTS: SenderAddress = {
  nome: 'Miligrama',
  cep: '60150161',
  logradouro: 'Av. Santos Dumont',
  numero: '2284',
  complemento: '1º andar',
  bairro: 'Aldeota',
  cidade: 'Fortaleza',
  uf: 'CE',
}

/**
 * Origem do frete conforme destino: Norte/Nordeste sai de Fortaleza,
 * demais regiões saem de Curitiba (matriz).
 */
export async function getSenderAddress(destinoUf: string): Promise<SenderAddress> {
  const fortaleza = isNorteNordeste(destinoUf)
  const prefix = fortaleza ? 'shipping_sender_fortaleza' : 'shipping_sender'
  const defaults = fortaleza ? FORTALEZA_DEFAULTS : CURITIBA_DEFAULTS

  const admin = createAdminClient()
  const { data: configs } = await admin
    .from('system_config')
    .select('key, value')
    .in('key', [
      `${prefix}_nome`,
      `${prefix}_cep`,
      `${prefix}_logradouro`,
      `${prefix}_numero`,
      `${prefix}_complemento`,
      `${prefix}_bairro`,
      `${prefix}_cidade`,
      `${prefix}_uf`,
    ])

  const map = Object.fromEntries((configs ?? []).map(c => [c.key, c.value]))

  return {
    nome: map[`${prefix}_nome`] ?? defaults.nome,
    cep: (map[`${prefix}_cep`] ?? defaults.cep).replace(/\D/g, ''),
    logradouro: map[`${prefix}_logradouro`] ?? defaults.logradouro,
    numero: map[`${prefix}_numero`] ?? defaults.numero,
    complemento: map[`${prefix}_complemento`] ?? defaults.complemento,
    bairro: map[`${prefix}_bairro`] ?? defaults.bairro,
    cidade: map[`${prefix}_cidade`] ?? defaults.cidade,
    uf: map[`${prefix}_uf`] ?? defaults.uf,
  }
}
