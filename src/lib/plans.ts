import type { PlanType } from '@/types/protocol'

/** Planos oferecidos em novas compras. */
export const PURCHASE_PLAN_TYPES = ['1mes', 'assinatura_mensal'] as const
export type PurchasePlanType = (typeof PURCHASE_PLAN_TYPES)[number]

export const DEFAULT_PURCHASE_PLAN: PurchasePlanType = 'assinatura_mensal'

export const SUBSCRIPTION_DISCOUNT = 0.1

export const PLAN_LABELS: Record<string, string> = {
  '1mes': 'Compra única',
  assinatura_mensal: 'Assinatura',
  '3meses': 'Trimestral',
  '1ano': 'Anual',
}

export const PLAN_TYPE_LABEL: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única',
  assinatura_mensal: 'Assinatura',
}

export const PLAN_BADGE: Record<PurchasePlanType, string> = {
  '1mes': '',
  assinatura_mensal: '10% off · Cancele quando quiser',
}

export const PLAN_HINT: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única, sem renovação automática',
  assinatura_mensal: 'Cobrança mensal · Cancele quando quiser',
}

export function isPurchasePlanType(value: string): value is PurchasePlanType {
  return (PURCHASE_PLAN_TYPES as readonly string[]).includes(value)
}

export function isRecurringPlan(planType: string): boolean {
  return (
    planType === 'assinatura_mensal' ||
    planType === '3meses' ||
    planType === '1ano'
  )
}

/** Preço cobrado agora (reais). Assinatura = price_monthly com 10% off. */
export function getChargePrice(priceMonthly: number, planType: string): number {
  if (planType === 'assinatura_mensal') {
    return roundMoney(priceMonthly * (1 - SUBSCRIPTION_DISCOUNT))
  }
  if (planType === '3meses') return priceMonthly // legado: telas novas não usam
  if (planType === '1ano') return priceMonthly
  return priceMonthly
}

export function getSubscriptionDiscountAmount(priceMonthly: number): number {
  return roundMoney(priceMonthly * SUBSCRIPTION_DISCOUNT)
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Sempre pacote físico de 30 dias para compra única e assinatura mensal. */
export function getPharmacySkuKey(
  planType: string
): 'pharmacy_sku_monthly' | 'pharmacy_sku_quarterly' | 'pharmacy_sku_yearly' {
  if (planType === '3meses') return 'pharmacy_sku_quarterly'
  if (planType === '1ano') return 'pharmacy_sku_yearly'
  return 'pharmacy_sku_monthly'
}

export function getUnitPriceFromProduct(
  product: {
    price_monthly: number | null
    price_quarterly: number | null
    price_yearly: number | null
  } | null,
  planType: string
): number {
  if (!product) return 0
  const monthly = product.price_monthly ?? 0
  if (planType === 'assinatura_mensal') return getChargePrice(monthly, planType)
  if (planType === '3meses') return product.price_quarterly ?? 0
  if (planType === '1ano') return product.price_yearly ?? 0
  return monthly
}

/**
 * Model A (recomendado): a cada cobrança bem-sucedida, expires_at e
 * next_billing_at avançam 1 mês. No cancelamento, entitlements seguem
 * até expires_at do período já pago.
 */
export function addPlanPeriod(from: Date, planType: string): Date {
  const d = new Date(from)
  if (planType === '3meses') {
    d.setMonth(d.getMonth() + 3)
    return d
  }
  if (planType === '1ano') {
    d.setFullYear(d.getFullYear() + 1)
    return d
  }
  // 1mes e assinatura_mensal: +1 mês
  d.setMonth(d.getMonth() + 1)
  return d
}

export function asPlanType(value: string): PlanType {
  return value as PlanType
}
