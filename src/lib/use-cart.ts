'use client'

import { useCallback, useSyncExternalStore } from 'react'
import type { PlanType } from '@/types/protocol'

export type CartItem = {
  product_id: string
  name: string
  price_monthly: number
  quantity: number
}

type CartStore = {
  items: CartItem[]
  plan: PlanType
}

const STORAGE_KEY = 'dd_cart'
const DEFAULT_PLAN: PlanType = '3meses'
const VALID_PLANS: PlanType[] = ['1mes', '3meses', '1ano']

function normalizePlan(value: unknown): PlanType {
  return VALID_PLANS.includes(value as PlanType) ? (value as PlanType) : DEFAULT_PLAN
}

function readStore(): CartStore {
  if (typeof window === 'undefined') return { items: [], plan: DEFAULT_PLAN }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], plan: DEFAULT_PLAN }
    const parsed = JSON.parse(raw) as Partial<CartStore>
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      plan: normalizePlan(parsed.plan),
    }
  } catch {
    return { items: [], plan: DEFAULT_PLAN }
  }
}

let store: CartStore = { items: [], plan: DEFAULT_PLAN }
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

const EMPTY_STORE: CartStore = { items: [], plan: DEFAULT_PLAN }

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
    quantity?: number
  }) => {
    ensureHydrated()
    const qty = item.quantity ?? 1
    const existing = store.items.find((i) => i.product_id === item.product_id)
    if (existing) {
      store = {
        plan: item.plan,
        items: store.items.map((i) =>
          i.product_id === item.product_id
            ? { ...i, quantity: i.quantity + qty }
            : i
        ),
      }
    } else {
      store = {
        plan: item.plan,
        items: [
          ...store.items,
          {
            product_id: item.product_id,
            name: item.name,
            price_monthly: item.price_monthly,
            quantity: qty,
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

  return {
    items: snapshot.items,
    plan: snapshot.plan,
    addItem,
    removeItem,
  }
}
