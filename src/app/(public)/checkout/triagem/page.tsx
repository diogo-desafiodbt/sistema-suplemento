'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/use-cart'
import type { PlanType } from '@/types/protocol'

type DiagnosisType = 'type2' | 'prediabetes' | 'undiagnosed'

const DIAGNOSIS_OPTIONS: { value: DiagnosisType; label: string }[] = [
  { value: 'type2', label: 'Diabetes tipo 2' },
  { value: 'prediabetes', label: 'Pré-diabetes' },
  { value: 'undiagnosed', label: 'Não diagnosticado / histórico familiar' },
]

export default function MiniTriagemPage() {
  const router = useRouter()
  const { items, plan } = useCart()
  const [diagnosis, setDiagnosis] = useState<DiagnosisType | ''>('')
  const [fullName, setFullName] = useState('')
  const [age, setAge] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (items.length === 0) {
      router.replace('/suplementos')
    }
  }, [items.length, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!diagnosis || !fullName.trim() || !age) {
      toast.error('Preencha todos os campos.')
      return
    }

    const ageNum = parseInt(age, 10)
    if (Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
      toast.error('Informe uma idade válida (18–120).')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const productIds = items.map(i => i.product_id)
      const { data: products } = await supabase
        .from('products')
        .select('id, name, price_monthly, price_quarterly, price_yearly')
        .in('id', productIds)

      const protocolItems = items.map(cartItem => {
        const product = products?.find(p => p.id === cartItem.product_id)
        return {
          product_id: cartItem.product_id,
          product_name: cartItem.name,
          is_required: false,
          activation_reason: 'Selecionado por você no carrinho',
          quantity: cartItem.quantity,
          price_monthly: product?.price_monthly ?? cartItem.price_monthly,
          price_quarterly: product?.price_quarterly ?? cartItem.price_monthly,
          price_yearly: product?.price_yearly ?? cartItem.price_monthly,
          image: cartItem.image,
        }
      })

      sessionStorage.setItem('checkout_source', 'mini_quiz')
      sessionStorage.setItem(
        'mini_quiz_data',
        JSON.stringify({
          diagnosis_type: diagnosis,
          full_name: fullName.trim(),
          age: ageNum,
        })
      )
      sessionStorage.setItem('protocol_items', JSON.stringify(protocolItems))
      sessionStorage.setItem('selected_plan', plan as PlanType)
      sessionStorage.removeItem('quiz_data')
      sessionStorage.removeItem('protocol_id')
      sessionStorage.removeItem('cart_locked_plan')

      router.push('/checkout')
    } catch {
      toast.error('Erro ao continuar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-[#13244f] focus:outline-none focus:ring-2 focus:ring-[#13244f]/20 bg-white'
  const labelClass =
    'block text-xs font-semibold text-[#13244f]/60 uppercase tracking-wide mb-1.5'

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-gray-400 hover:text-[#13244f]"
          >
            Voltar
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-lg bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5"
        >
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
              Antes do pagamento
            </p>
            <h1 className="text-2xl font-bold text-[#13244f]">Informações rápidas</h1>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Precisamos de 3 dados para preparar seu pedido. Leva menos de 1 minuto.
            </p>
          </div>

          <div>
            <label className={labelClass}>Tipo de diabetes</label>
            <div className="space-y-2">
              {DIAGNOSIS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDiagnosis(opt.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition ${
                    diagnosis === opt.value
                      ? 'border-[#13244f] bg-[#13244f]/5 text-[#13244f] font-semibold'
                      : 'border-gray-200 text-gray-600 hover:border-[#13244f]/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Nome completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className={inputClass}
              required
              autoComplete="name"
            />
          </div>

          <div>
            <label className={labelClass}>Idade</label>
            <input
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              min={18}
              max={120}
              placeholder="Ex: 45"
              className={inputClass}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !diagnosis}
            className="w-full bg-[#f4001e] text-white font-bold py-3.5 rounded-full text-sm hover:bg-[#a30000] transition disabled:opacity-50"
          >
            {loading ? 'Continuando...' : 'Ir para o checkout'}
          </button>
        </form>
      </main>
    </div>
  )
}
