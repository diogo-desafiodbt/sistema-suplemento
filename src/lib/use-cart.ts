'use client'

import { useCallback, useSyncExternalStore } from 'react'
import type { PlanType } from '@/types/protocol'
import {
  DEFAULT_PURCHASE_PLAN,
  getChargePrice,
  isPurchasePlanType,
  type PurchasePlanType,
} from '@/lib/plans'

export type CartItem = {
  product_id: string
  name: string
  price_monthly: number
  quantity: number
  image: string
}

type CartStore = {
  items: CartItem[]
  plan: PlanType
}

const STORAGE_KEY = 'dd_cart'

function normalizePlan(value: unknown): PlanType {
  if (typeof value === 'string' && isPurchasePlanType(value)) return value
  // Planos legados no carrinho antigo → assinatura mensal
  if (value === '3meses' || value === '1ano') return DEFAULT_PURCHASE_PLAN
  return DEFAULT_PURCHASE_PLAN
}

function normalizeItem(raw: Partial<CartItem>): CartItem | null {
  if (!raw.product_id || !raw.name || typeof raw.price_monthly !== 'number') return null
  return {
    product_id: raw.product_id,
    name: raw.name,
    price_monthly: raw.price_monthly,
    quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1,
    image: typeof raw.image === 'string' ? raw.image : '',
  }
}

function readStore(): CartStore {
  if (typeof window === 'undefined') return { items: [], plan: DEFAULT_PURCHASE_PLAN }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], plan: DEFAULT_PURCHASE_PLAN }
    const parsed = JSON.parse(raw) as Partial<CartStore>
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(normalizeItem).filter((i): i is CartItem => i !== null)
      : []
    return {
      items,
      plan: normalizePlan(parsed.plan),
    }
  } catch {
    return { items: [], plan: DEFAULT_PURCHASE_PLAN }
  }
}

let store: CartStore = { items: [], plan: DEFAULT_PURCHASE_PLAN }
let hydrated = false
const listeners = new Set<() => void>()

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return
  store = readStore()
  hydrated = true
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {}
}

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  ensureHydrated()
  return store
}

const EMPTY_STORE: CartStore = { items: [], plan: DEFAULT_PURCHASE_PLAN }

function getServerSnapshot(): CartStore {
  return EMPTY_STORE
}

export function useCart() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const addItem = useCallback((item: {
    product_id: string
    name: string
    price_monthly: number
    plan: PlanType
    image: string
    quantity?: number
  }) => {
    ensureHydrated()
    const qty = item.quantity ?? 1
    const plan = normalizePlan(item.plan)
    const existing = store.items.find((i) => i.product_id === item.product_id)
    if (existing) {
      store = {
        plan,
        items: store.items.map((i) =>
          i.product_id === item.product_id
            ? { ...i, quantity: i.quantity + qty, image: item.image || i.image }
            : i
        ),
      }
    } else {
      store = {
        plan,
        items: [
          ...store.items,
          {
            product_id: item.product_id,
            name: item.name,
            price_monthly: item.price_monthly,
            quantity: qty,
            image: item.image,
          },
        ],
      }
    }
    persist()
    emit()
  }, [])

  const removeItem = useCallback((productId: string) => {
    ensureHydrated()
    store = {
      ...store,
      items: store.items.filter((i) => i.product_id !== productId),
    }
    persist()
    emit()
  }, [])

  const setPlan = useCallback((plan: PurchasePlanType) => {
    ensureHydrated()
    store = { ...store, plan }
    persist()
    emit()
  }, [])

  const chargeTotal = snapshot.items.reduce(
    (sum, item) => sum + getChargePrice(item.price_monthly, snapshot.plan) * item.quantity,
    0
  )

  return {
    items: snapshot.items,
    plan: snapshot.plan,
    chargeTotal,
    addItem,
    removeItem,
    setPlan,
  }
}
