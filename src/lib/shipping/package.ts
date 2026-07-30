import { createAdminClient } from '@/lib/supabase/admin'
import type { PackageDimensions } from '@/types/shipping'

export type PackageItem = { box_type: 'R80' | 'R110'; quantity: number }

type BoxDims = { altura: number; largura: number; comprimento: number; peso: number }

async function loadBoxConfig(): Promise<Record<'R80' | 'R110', BoxDims>> {
  const admin = createAdminClient()
  const { data: configs } = await admin
    .from('system_config')
    .select('key, value')
    .in('key', [
      'shipping_box_r80_altura',
      'shipping_box_r80_largura',
      'shipping_box_r80_comprimento',
      'shipping_box_r80_peso',
      'shipping_box_r110_altura',
      'shipping_box_r110_largura',
      'shipping_box_r110_comprimento',
      'shipping_box_r110_peso',
    ])

  const map = Object.fromEntries((configs ?? []).map(c => [c.key, c.value]))

  return {
    R80: {
      altura: parseFloat(map.shipping_box_r80_altura ?? '8'),
      largura: parseFloat(map.shipping_box_r80_largura ?? '18'),
      comprimento: parseFloat(map.shipping_box_r80_comprimento ?? '14.5'),
      peso: parseFloat(map.shipping_box_r80_peso ?? '0.2'),
    },
    R110: {
      altura: parseFloat(map.shipping_box_r110_altura ?? '7.2'),
      largura: parseFloat(map.shipping_box_r110_largura ?? '22.5'),
      comprimento: parseFloat(map.shipping_box_r110_comprimento ?? '14.5'),
      peso: parseFloat(map.shipping_box_r110_peso ?? '0.4'),
    },
  }
}

export async function computePackageDimensions(
  items: PackageItem[]
): Promise<PackageDimensions> {
  const boxes = await loadBoxConfig()

  const grouped = new Map<'R80' | 'R110', number>()
  for (const item of items) {
    if (item.box_type !== 'R80' && item.box_type !== 'R110') continue
    grouped.set(item.box_type, (grouped.get(item.box_type) ?? 0) + item.quantity)
  }

  if (grouped.size === 0) {
    return { altura: 1, largura: 1, comprimento: 1, peso: 0.1 }
  }

  let altura = 0
  let peso = 0
  let largura = 0
  let comprimento = 0

  for (const [type, qty] of grouped) {
    const dims = boxes[type]
    altura += dims.altura * qty
    peso += dims.peso * qty
    largura = Math.max(largura, dims.largura)
    comprimento = Math.max(comprimento, dims.comprimento)
  }

  return {
    altura: Math.ceil(altura),
    largura: Math.ceil(largura),
    comprimento: Math.ceil(comprimento),
    peso,
  }
}
