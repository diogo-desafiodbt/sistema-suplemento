import type { PlanType } from '@/types/protocol'

/** Planos oferecidos em novas compras. */
export const PURCHASE_PLAN_TYPES = ['1mes', '3meses', '6meses'] as const
export type PurchasePlanType = (typeof PURCHASE_PLAN_TYPES)[number]

export const DEFAULT_PURCHASE_PLAN: PurchasePlanType = '1mes'

export const SUBSCRIPTION_DISCOUNT_3M = 0.1
export const SUBSCRIPTION_DISCOUNT_6M = 0.15
/** Legado — clientes com assinatura_mensal ativa. */
export const SUBSCRIPTION_DISCOUNT = 0.1

export const PLAN_LABELS: Record<string, string> = {
  '1mes': 'Compra única',
  '3meses': 'Trimestral',
  '6meses': 'Semestral',
  assinatura_mensal: 'Assinatura mensal', // legado — esse sim é recorrente de verdade
  '1ano': 'Anual', // legado
}

export const PLAN_TYPE_LABEL: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única',
  '3meses': 'Trimestral',
  '6meses': 'Semestral',
}

export const PLAN_BADGE: Record<PurchasePlanType, string> = {
  '1mes': '',
  '3meses': '10% off · Parcelado em 3x no cartão',
  '6meses': '15% off · Parcelado em 6x no cartão · Maior desconto',
}

export const PLAN_HINT: Record<PurchasePlanType, string> = {
  '1mes': 'Compra única — à vista no Pix ou no cartão',
  '3meses': 'Compra única — parcelado em 3x no cartão, sem renovação automática',
  '6meses':
    'Compra única — parcelado em 6x no cartão, sem renovação automática · Maior desconto',
}

export function isPurchasePlanType(value: string): value is PurchasePlanType {
  return (PURCHASE_PLAN_TYPES as readonly string[]).includes(value)
}

export function isRecurringPlan(planType: string): boolean {
  return planType === 'assinatura_mensal' || planType === '1ano'
}

/**
 * Pode cancelar cobrança recorrente na Pagar.me: planos legados recorrentes,
 * ou qualquer subscription que ainda tenha `pagarme_sub_id` (ex.: 3meses antigo).
 */
export function canCancelRecurringBilling(
  planType: string,
  pagarmeSubId: string | null | undefined
): boolean {
  return isRecurringPlan(planType) || Boolean(pagarmeSubId)
}

/**
 * Preço cobrado agora (reais) — total do ciclo, não mensal.
 * 3meses = monthly × 3 × 0,9; 6meses = monthly × 6 × 0,85.
 */
export function getChargePrice(priceMonthly: number, planType: string): number {
  if (planType === '3meses') {
    return roundMoney(priceMonthly * 3 * (1 - SUBSCRIPTION_DISCOUNT_3M))
  }
  if (planType === '6meses') {
    return roundMoney(priceMonthly * 6 * (1 - SUBSCRIPTION_DISCOUNT_6M))
  }
  if (planType === 'assinatura_mensal') {
    return roundMoney(priceMonthly * (1 - SUBSCRIPTION_DISCOUNT))
  }
  if (planType === '1ano') return priceMonthly // legado
  return priceMonthly // 1mes
}

/** Parcelas de exibição na UI (3meses → 3×, 6meses → 6×). */
export function getPlanInstallmentCount(planType: string): number {
  if (planType === '3meses') return 3
  if (planType === '6meses') return 6
  return 1
}

/** Valor de cada parcela (total do ciclo ÷ N). */
export function getInstallmentPrice(
  priceMonthly: number,
  planType: string
): number {
  const count = getPlanInstallmentCount(planType)
  if (count <= 1) return getChargePrice(priceMonthly, planType)
  return roundMoney(getChargePrice(priceMonthly, planType) / count)
}

export function formatBRL(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/** Economia vs. pagar o ciclo cheio sem desconto (só planos novos com desconto). */
export function getSubscriptionDiscountAmount(
  priceMonthly: number,
  planType: string = '1mes'
): number {
  if (planType === '3meses') {
    return roundMoney(priceMonthly * 3 * SUBSCRIPTION_DISCOUNT_3M)
  }
  if (planType === '6meses') {
    return roundMoney(priceMonthly * 6 * SUBSCRIPTION_DISCOUNT_6M)
  }
  if (planType === 'assinatura_mensal') {
    return roundMoney(priceMonthly * SUBSCRIPTION_DISCOUNT)
  }
  return 0
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * SKU enviado à farmácia.
 * 3meses/6meses usam o SKU mensal — a quantidade física é multiplicada
 * (ver getPharmacyCycleMultiplier). Pode mudar após validação com a Miligrama.
 */
export function getPharmacySkuKey(
  planType: string
): 'pharmacy_sku_monthly' | 'pharmacy_sku_quarterly' | 'pharmacy_sku_yearly' {
  if (planType === '1ano') return 'pharmacy_sku_yearly'
  // Legado trimestral antigo no cadastro de produtos (raro).
  // Novos 3meses/6meses: SKU mensal × multiplicador de ciclo.
  return 'pharmacy_sku_monthly'
}

/**
 * Multiplicador de quantidade física no pedido da farmácia / pacote.
 * TODO(Miligrama): validar se despachar 3×/6× do SKU mensal num único
 * pedido é o modelo operacional correto — pode mudar.
 */
export function getPharmacyCycleMultiplier(planType: string): number {
  if (planType === '3meses') return 3
  if (planType === '6meses') return 6
  return 1
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
  // Novos planos e assinatura_mensal: calcular a partir de price_monthly.
  if (
    planType === '1mes' ||
    planType === '3meses' ||
    planType === '6meses' ||
    planType === 'assinatura_mensal'
  ) {
    return getChargePrice(monthly, planType)
  }
  // Legado 1ano: campo dedicado no produto.
  if (planType === '1ano') return product.price_yearly ?? 0
  return monthly
}

/**
 * Model A: a cada cobrança bem-sucedida, expires_at e next_billing_at
 * avançam pelo período do plano.
 */
export function addPlanPeriod(from: Date, planType: string): Date {
  const d = new Date(from)
  if (planType === '3meses') {
    d.setMonth(d.getMonth() + 3)
    return d
  }
  if (planType === '6meses') {
    d.setMonth(d.getMonth() + 6)
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
