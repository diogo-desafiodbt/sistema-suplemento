'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { trackFunnelEvent } from '@/lib/funnel/track'
import {
  DEFAULT_PURCHASE_PLAN,
  getChargePrice,
  isPurchasePlanType,
  PLAN_TYPE_LABEL,
  type PurchasePlanType,
} from '@/lib/plans'
import { estimateCustomerDeliveryDays } from '@/lib/shipping/estimate'
import { createClient } from '@/lib/supabase/client'
import {
  type ShippingOptionPublic,
  type ShippingSelection,
  shippingQuoteKey,
} from '@/types/shipping'

type Step = 2 | 3 | 4

type LocalProtocolItem = {
  product_id: string
  product_name: string
  is_required: boolean
  removed?: boolean
  blocked?: boolean
  price_monthly?: number
  price_quarterly?: number
  price_yearly?: number
  image?: string
  activation_reason?: string
  quantity?: number
}

type CheckoutSource = 'full_quiz' | 'mini_quiz'

const FALLBACK_SHIPPING: ShippingSelection = {
  tipo: 'padrao',
  valor: 0,
  prazoDias: 0,
  codigoServico: '',
}

type PaymentMethod = 'credit_card' | 'pix'

type PixInfo = {
  qr_code: string
  qr_code_url: string
  expires_at: string
}

function clearCheckoutSession() {
  sessionStorage.removeItem('protocol_items')
  sessionStorage.removeItem('selected_plan')
  sessionStorage.removeItem('protocol_id')
  sessionStorage.removeItem('triagem_data')
  sessionStorage.removeItem('quiz_data')
  sessionStorage.removeItem('mini_quiz_data')
  sessionStorage.removeItem('checkout_source')
  sessionStorage.removeItem('cart_locked_plan')
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function CheckoutPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(2)
  const [items, setItems] = useState<LocalProtocolItem[]>([])
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<CheckoutSource>('full_quiz')
  const [plan, setPlan] = useState<PurchasePlanType>(DEFAULT_PURCHASE_PLAN)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [cep, setCep] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [loadingCep, setLoadingCep] = useState(false)

  const [shippingOptions, setShippingOptions] = useState<
    ShippingOptionPublic[]
  >([])
  const [shipping, setShipping] = useState<ShippingSelection>(FALLBACK_SHIPPING)
  const [loadingShipping, setLoadingShipping] = useState(false)
  const [shippingError, setShippingError] = useState(false)

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('credit_card')
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cpf, setCpf] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [processingPayment, setProcessingPayment] = useState(false)

  const [pixInfo, setPixInfo] = useState<PixInfo | null>(null)
  const [pixSubscriptionId, setPixSubscriptionId] = useState<string | null>(
    null,
  )
  const [pixExpired, setPixExpired] = useState(false)
  const [pixSecondsLeft, setPixSecondsLeft] = useState(0)

  const [accountSummary, setAccountSummary] = useState<{
    name: string
    email: string
  } | null>(null)
  const [addressSummary, setAddressSummary] = useState<string | null>(null)

  const pixAllowed = plan === '1mes'

  useEffect(() => {
    trackFunnelEvent('checkout_started')
  }, [])

  useEffect(() => {
    if (!pixAllowed && paymentMethod === 'pix') {
      setPaymentMethod('credit_card')
      setPixInfo(null)
      setPixSubscriptionId(null)
      setPixExpired(false)
    }
  }, [pixAllowed, paymentMethod])

  useEffect(() => {
    if (!pixInfo?.expires_at || pixExpired) return

    const tick = () => {
      const left = Math.max(
        0,
        Math.floor(
          (new Date(pixInfo.expires_at).getTime() - Date.now()) / 1000,
        ),
      )
      setPixSecondsLeft(left)
      if (left <= 0) setPixExpired(true)
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [pixInfo, pixExpired])

  useEffect(() => {
    if (!pixSubscriptionId || pixExpired || !pixInfo) return

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/checkout/status?subscription_id=${encodeURIComponent(pixSubscriptionId)}`,
        )
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'paid') {
          clearCheckoutSession()
          router.push('/obrigado')
        }
      } catch {
        /* ignore transient poll errors */
      }
    }

    poll()
    const id = window.setInterval(poll, 4000)
    return () => window.clearInterval(id)
  }, [pixSubscriptionId, pixExpired, pixInfo, router])

  useEffect(() => {
    const itemsRaw = sessionStorage.getItem('protocol_items')
    const savedSource = sessionStorage.getItem(
      'checkout_source',
    ) as CheckoutSource | null
    const savedPlan = sessionStorage.getItem('selected_plan')
    const triagemRaw = sessionStorage.getItem('triagem_data')

    if (!itemsRaw) {
      router.push('/suplementos')
      return
    }

    if (!triagemRaw) {
      router.push('/quiz')
      return
    }

    setSource(savedSource === 'mini_quiz' ? 'mini_quiz' : 'full_quiz')
    if (savedPlan && isPurchasePlanType(savedPlan)) {
      setPlan(savedPlan)
    } else {
      setPlan(DEFAULT_PURCHASE_PLAN)
    }
    const parsed: LocalProtocolItem[] = JSON.parse(itemsRaw)
    setItems(parsed)

    checkExistingSession()
  }, [])

  async function checkExistingSession() {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    if (profile) {
      setAccountSummary({
        name: profile.full_name ?? '',
        email: profile.email ?? user.email ?? '',
      })
    }
    setStep(3)
  }

  function getActiveItems() {
    return items.filter((item) => !item.removed && !item.blocked)
  }

  function hasOmega3(): boolean {
    return getActiveItems().some(
      (item) =>
        item.product_name.toLowerCase().includes('ômega') ||
        item.product_name.toLowerCase().includes('omega'),
    )
  }

  function getPrice(item: LocalProtocolItem): number {
    return getChargePrice(item.price_monthly ?? 0, plan) * (item.quantity ?? 1)
  }

  function getProductsSubtotal(): number {
    return getActiveItems().reduce((sum, item) => sum + getPrice(item), 0)
  }

  function getTotal(): number {
    return getProductsSubtotal() + (shipping.valor ?? 0)
  }

  function buildQuizPayload() {
    return JSON.parse(sessionStorage.getItem('triagem_data') ?? '{}')
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      })

      if (error) {
        console.error('SignUp error completo:', error)
        toast.error(error.message)
        return
      }

      if (!data.user) {
        toast.error(
          'Este email já está cadastrado. Faça login ou use outro email.',
        )
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))

      setAccountSummary({ name: fullName, email })
      setStep(3)
      toast.success('Conta criada com sucesso!')
    } catch (err: any) {
      console.error('SignUp catch:', err)
      toast.error(err?.message ?? `Erro desconhecido: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function fetchShippingQuote(cepDigits: string, uf: string) {
    setLoadingShipping(true)
    setShippingError(false)
    try {
      const active = getActiveItems().filter((i) => i.product_id)
      if (active.length === 0) {
        setShippingOptions([])
        setShipping(FALLBACK_SHIPPING)
        setShippingError(true)
        return
      }

      const res = await fetch('/api/shipping/cotacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cepdestino: cepDigits,
          uf,
          valordeclarado: getProductsSubtotal(),
          protocol_items: active.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity ?? 1,
          })),
        }),
      })
      const data = await res.json()
      const options = (data.options ?? []) as ShippingOptionPublic[]

      if (!options.length || data.erro) {
        setShippingOptions([])
        setShipping(FALLBACK_SHIPPING)
        setShippingError(true)
        return
      }

      setShippingOptions(options)
      const preferred =
        options.find((o) => o.tipo === 'economica') ?? options[0]
      setShipping({
        tipo: preferred.tipo,
        valor: preferred.valor,
        prazoDias: preferred.prazoDias,
        codigoServico: preferred.codigoServico,
        transportadora: preferred.transportadora,
        nomeServico: preferred.nomeServico,
      })
      setShippingError(false)
    } catch {
      setShippingOptions([])
      setShipping(FALLBACK_SHIPPING)
      setShippingError(true)
    } finally {
      setLoadingShipping(false)
    }
  }

  async function handleCepBlur() {
    if (cep.replace(/\D/g, '').length !== 8) return
    setLoadingCep(true)
    try {
      const { fetchAddressByCep } = await import('@/lib/cep')
      const address = await fetchAddressByCep(cep)
      if (address) {
        setStreet(address.street)
        setNeighborhood(address.neighborhood)
        setCity(address.city)
        setState(address.state)
        await fetchShippingQuote(cep.replace(/\D/g, ''), address.state)
      } else {
        toast.error('CEP não encontrado')
      }
    } finally {
      setLoadingCep(false)
    }
  }

  async function handlePayment(e?: React.FormEvent) {
    e?.preventDefault()
    if (!termsAccepted) {
      toast.error(
        'É necessário aceitar os Termos de Uso para finalizar a compra.',
      )
      return
    }
    setProcessingPayment(true)
    setPixExpired(false)

    const [expMonth, expYearRaw] = cardExpiry.split('/')
    const expYear =
      expYearRaw?.trim().length === 2
        ? `20${expYearRaw.trim()}`
        : expYearRaw?.trim()

    try {
      const quiz = buildQuizPayload()
      if (!quiz?.diagnosis_type) {
        toast.error('Dados da triagem incompletos. Volte e preencha novamente.')
        return
      }

      const method: PaymentMethod = pixAllowed ? paymentMethod : 'credit_card'

      const body: Record<string, unknown> = {
        total_amount: getTotal(),
        source,
        plan_type: plan,
        quiz,
        protocol_items: getActiveItems(),
        shipping,
        payment_method: method,
        terms_accepted: true,
        address: {
          zip_code: cep.replace(/\D/g, ''),
          street,
          number,
          complement,
          neighborhood,
          city,
          state,
        },
        cpf,
      }

      if (method === 'credit_card') {
        body.card = {
          number: cardNumber,
          holder_name: cardName,
          exp_month: expMonth?.trim(),
          exp_year: expYear,
          cvv: cardCvv,
        }
      }

      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      const results = data.results as
        | {
            oneTime?: { ok: boolean; paid?: boolean; error?: string }
            subscription?: { ok: boolean; paid?: boolean; error?: string }
          }
        | undefined

      if (!res.ok) {
        toast.error(data.error ?? 'Erro no pagamento')
        return
      }

      if (method === 'pix') {
        if (!data.pix?.qr_code_url || !data.subscription_id) {
          toast.error('Não foi possível gerar o QR Code Pix. Tente novamente.')
          return
        }
        setPixInfo({
          qr_code: data.pix.qr_code ?? '',
          qr_code_url: data.pix.qr_code_url,
          expires_at: data.pix.expires_at,
        })
        setPixSubscriptionId(data.subscription_id)
        setPixExpired(false)
        return
      }

      if (method === 'credit_card') {
        const paid =
          results?.oneTime?.paid === true ||
          results?.subscription?.paid === true
        if (!paid) {
          toast.error(
            'Pagamento recusado pela operadora do cartão. Verifique os dados ou tente outro cartão.',
          )
          return
        }
      }

      clearCheckoutSession()
      router.push('/obrigado')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setProcessingPayment(false)
    }
  }

  async function copyPixCode() {
    if (!pixInfo?.qr_code) return
    try {
      await navigator.clipboard.writeText(pixInfo.qr_code)
      toast.success('Código Pix copiado')
    } catch {
      toast.error('Não foi possível copiar. Selecione o código manualmente.')
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-[#f5f0eb] px-6 py-5 border-b border-[#13244f]/10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <img
            src="/logo-azul.png"
            alt="Desafio Diabetes"
            className="h-7 w-auto"
          />
          <nav className="hidden sm:flex items-center gap-2 text-xs text-[#13244f]/50 font-medium">
            {['Conta', 'Entrega', 'Pagamento'].map((label, i) => {
              const stepNum = i + 2
              const isActive = step === stepNum
              const isDone = step > stepNum
              return (
                <span key={label} className="flex items-center gap-2">
                  {i > 0 && <span className="opacity-30">›</span>}
                  <span
                    className={`${isActive ? 'text-[#13244f] font-bold' : isDone ? 'text-[#13244f]/70' : ''}`}
                  >
                    {isDone ? `✓ ${label}` : label}
                  </span>
                </span>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 space-y-3 w-full min-w-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step > 2 ? 'bg-[#13244f] text-white' : step === 2 ? 'bg-[#13244f] text-white' : 'border-2 border-gray-300 text-gray-400'}`}
                >
                  {step > 2 ? '✓' : '1'}
                </span>
                <h2 className="font-bold text-[#13244f]">Criar sua conta</h2>
              </div>
              {step > 2 && (
                <button
                  onClick={() => setStep(2)}
                  className="text-xs text-[#f4001e] font-semibold hover:underline"
                >
                  Editar
                </button>
              )}
            </div>

            {step === 2 && (
              <div className="px-6 pb-6 space-y-3 border-t border-gray-50">
                <p className="text-sm md:text-base text-gray-400 pt-3">
                  Já tem conta?{' '}
                  <a
                    href="/login"
                    className="text-[#f4001e] font-semibold hover:underline"
                  >
                    Faça login
                  </a>
                </p>
                <form onSubmit={handleCreateAccount} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    type="password"
                    placeholder="Crie uma senha (mínimo 6 caracteres)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-3.5 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'Criando conta...' : 'Continuar'}
                  </button>
                </form>
              </div>
            )}

            {step > 2 && accountSummary && (
              <div className="px-6 pb-4 border-t border-gray-50 pt-3">
                <p className="text-sm md:text-base text-[#13244f] font-medium">
                  {accountSummary.name}
                </p>
                <p className="text-sm md:text-base text-gray-400">
                  {accountSummary.email}
                </p>
              </div>
            )}
          </div>

          <div
            className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${step < 3 ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step > 3 ? 'bg-[#13244f] text-white' : step === 3 ? 'bg-[#13244f] text-white' : 'border-2 border-gray-300 text-gray-400'}`}
                >
                  {step > 3 ? '✓' : '2'}
                </span>
                <h2 className="font-bold text-[#13244f]">
                  Endereço de entrega
                </h2>
              </div>
              {step > 3 && (
                <button
                  onClick={() => setStep(3)}
                  className="text-xs text-[#f4001e] font-semibold hover:underline"
                >
                  Editar
                </button>
              )}
            </div>

            {step === 3 && (
              <div className="px-6 pb-6 space-y-3 border-t border-gray-50 pt-4">
                <input
                  placeholder="CEP"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  onBlur={handleCepBlur}
                  maxLength={9}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                />
                {loadingCep && (
                  <p className="text-xs text-gray-400">Buscando CEP...</p>
                )}
                <input
                  placeholder="Rua"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="Número"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    placeholder="Complemento"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                </div>
                <input
                  placeholder="Bairro"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    placeholder="Cidade"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="col-span-2 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    placeholder="UF"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    maxLength={2}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#13244f]/60 uppercase tracking-wide">
                    Frete
                  </p>
                  {loadingShipping && (
                    <p className="text-xs text-gray-400">Calculando frete…</p>
                  )}
                  {!loadingShipping && shippingOptions.length > 0 && (
                    <div className="grid gap-2 max-h-80 overflow-y-auto pr-1">
                      {shippingOptions.map((opt) => {
                        const selected =
                          shippingQuoteKey(shipping) === shippingQuoteKey(opt)
                        const tipoLabel =
                          opt.tipo === 'economica'
                            ? 'Mais barata'
                            : opt.tipo === 'expressa'
                              ? 'Mais rápida'
                              : null
                        return (
                          <button
                            key={shippingQuoteKey(opt)}
                            type="button"
                            onClick={() =>
                              setShipping({
                                tipo: opt.tipo,
                                valor: opt.valor,
                                prazoDias: opt.prazoDias,
                                codigoServico: opt.codigoServico,
                                transportadora: opt.transportadora,
                                nomeServico: opt.nomeServico,
                              })
                            }
                            className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                              selected
                                ? 'border-[#13244f] bg-[#13244f]/5'
                                : 'border-gray-200 hover:border-[#13244f]/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-bold text-[#13244f] truncate">
                                    {opt.transportadora || 'Transportadora'}
                                  </p>
                                  {tipoLabel && (
                                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#13244f]/10 text-[#13244f]">
                                      {tipoLabel}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 mt-0.5 truncate">
                                  {opt.nomeServico || opt.codigoServico}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {(() => {
                                    const dias = estimateCustomerDeliveryDays(
                                      opt.prazoDias,
                                    )
                                    return `chega em até ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'} · serviço ${opt.codigoServico}`
                                  })()}
                                </p>
                              </div>
                              <p className="text-sm font-bold text-[#13244f] flex-shrink-0">
                                R$ {opt.valor.toFixed(2).replace('.', ',')}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {!loadingShipping && shippingError && (
                    <p className="text-xs text-gray-400 bg-[#13244f]/5 rounded-xl px-4 py-3">
                      Não foi possível cotar o frete agora. Você pode seguir —
                      calculamos na hora do envio.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setAddressSummary(
                      `${street}, ${number}${complement ? ` ${complement}` : ''} — ${city}/${state}`,
                    )
                    setStep(4)
                  }}
                  disabled={
                    !cep ||
                    !street ||
                    !number ||
                    !city ||
                    !state ||
                    loadingShipping
                  }
                  className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-3.5 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-40"
                >
                  Ir para o pagamento
                </button>
              </div>
            )}

            {step > 3 && addressSummary && (
              <div className="px-6 pb-4 border-t border-gray-50 pt-3">
                <p className="text-sm md:text-base text-[#13244f]">
                  {addressSummary}
                </p>
              </div>
            )}
          </div>

          {step >= 4 && (
            <aside className="rounded-2xl bg-[#13244f] text-white shadow-lg border-l-8 border-[#f4001e] overflow-hidden">
              <div className="px-5 py-5 md:px-6 md:py-6 space-y-4">
                <div className="flex items-start gap-4">
                  <img
                    src="/dr-turi.png"
                    alt="Dr. Turí Souza"
                    className="h-16 w-16 md:h-20 md:w-20 rounded-full object-cover object-top bg-white/10 shrink-0 ring-2 ring-[#f4001e]/60"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-[#f4001e] px-3 py-1 text-[10px] md:text-xs font-bold uppercase tracking-wide">
                      Antes de pagar
                    </p>
                    <p className="text-lg md:text-xl font-bold leading-snug">
                      Atenção,{' '}
                      {(accountSummary?.name ?? '').split(' ')[0] || 'paciente'}
                      .
                    </p>
                  </div>
                </div>

                <div className="space-y-3.5 text-sm md:text-base leading-relaxed text-white/90">
                  <p>
                    Nós levamos a saúde de quem tem diabetes a sério — e estamos
                    muito orgulhosos do passo que você está dando no caminho da
                    reversão.
                  </p>
                  <p>
                    O Dr. Turí Souza dedicou anos à validação dessa formulação
                    até chegar numa linha de suplementos de alto padrão, pensada
                    exclusivamente para diabéticos.
                  </p>
                  <p>
                    Seu suplemento não sai de uma linha industrial. Ele é
                    preparado num atelier farmacêutico, lote a lote, sob a
                    responsabilidade direta de um farmacêutico especializado —
                    um processo raro no mercado de suplementação, reservado a
                    quem exige o mais alto padrão de qualidade. É esse cuidado
                    que garante alta tecnologia e rastreabilidade em cada
                    entrega.
                  </p>
                  <p className="font-semibold text-white">
                    Sua formulação chega em breve, com a exclusividade e a
                    segurança que o seu tratamento merece.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M9 12l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                    Farmácia credenciada ANVISA
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90">
                    Preparado lote a lote
                  </span>
                </div>
              </div>
            </aside>
          )}

          <div
            className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${step < 4 ? 'opacity-50' : ''}`}
          >
            <div className="px-6 py-4 flex items-center gap-3">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 4 ? 'bg-[#13244f] text-white' : 'border-2 border-gray-300 text-gray-400'}`}
              >
                3
              </span>
              <h2 className="font-bold text-[#13244f]">Pagamento</h2>
            </div>

            {step === 4 && (
              <div className="px-6 pb-6 space-y-3 border-t border-gray-50 pt-4">
                {pixInfo ? (
                  <div className="space-y-4">
                    <div className="text-center space-y-1">
                      <p className="font-bold text-[#13244f] text-lg">
                        Pague com Pix
                      </p>
                      <p className="text-sm text-gray-500">
                        Escaneie o QR Code ou copie o código. Confirmamos
                        automaticamente após o pagamento.
                      </p>
                    </div>

                    {pixExpired ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-center space-y-3">
                        <p className="text-sm font-semibold text-amber-800">
                          QR code expirado
                        </p>
                        <p className="text-xs text-amber-700">
                          Gere um novo código para concluir o pagamento.
                        </p>
                        <button
                          type="button"
                          disabled={processingPayment}
                          onClick={() => handlePayment()}
                          className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-3 rounded-full font-bold text-sm transition disabled:opacity-50"
                        >
                          {processingPayment
                            ? 'Gerando…'
                            : 'Gerar novo QR Code'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-center">
                          <img
                            src={pixInfo.qr_code_url}
                            alt="QR Code Pix"
                            className="w-56 h-56 rounded-xl border border-gray-100 bg-white p-2"
                          />
                        </div>
                        <p className="text-center text-sm text-[#13244f] font-medium">
                          Expira em {formatCountdown(pixSecondsLeft)}
                        </p>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-[#13244f]/60 uppercase tracking-wide">
                            Pix copia e cola
                          </p>
                          <textarea
                            readOnly
                            value={pixInfo.qr_code}
                            rows={3}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-[#13244f] bg-gray-50 font-mono break-all resize-none"
                          />
                          <button
                            type="button"
                            onClick={copyPixCode}
                            className="w-full border border-[#13244f] text-[#13244f] py-3 rounded-full font-bold text-sm hover:bg-[#13244f]/5 transition"
                          >
                            Copiar
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 text-center">
                          Aguardando confirmação do pagamento…
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handlePayment} className="space-y-3">
                    {pixAllowed && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('credit_card')}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                            paymentMethod === 'credit_card'
                              ? 'border-[#13244f] bg-[#13244f] text-white'
                              : 'border-gray-200 text-[#13244f] hover:border-[#13244f]/40'
                          }`}
                        >
                          Cartão de crédito
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('pix')}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                            paymentMethod === 'pix'
                              ? 'border-[#13244f] bg-[#13244f] text-white'
                              : 'border-gray-200 text-[#13244f] hover:border-[#13244f]/40'
                          }`}
                        >
                          Pix
                        </button>
                      </div>
                    )}

                    <input
                      placeholder={
                        paymentMethod === 'pix' && pixAllowed
                          ? 'CPF'
                          : 'CPF do titular'
                      }
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                    />

                    {(paymentMethod === 'credit_card' || !pixAllowed) && (
                      <>
                        <input
                          placeholder="Número do cartão"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          maxLength={19}
                          required
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                        />
                        <input
                          placeholder="Nome no cartão"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          required
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            placeholder="Validade (MM/AA)"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            maxLength={5}
                            required
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                          />
                          <input
                            placeholder="CVV"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value)}
                            maxLength={4}
                            required
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                          />
                        </div>
                      </>
                    )}

                    {paymentMethod === 'pix' && pixAllowed && (
                      <p className="text-xs text-gray-500 bg-[#13244f]/5 rounded-xl px-4 py-3">
                        Após gerar o QR Code, você terá 1 hora para pagar. A
                        confirmação é automática.
                      </p>
                    )}

                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#13244f]"
                      />
                      <span className="text-xs text-gray-500 leading-relaxed">
                        Li e concordo com os{' '}
                        <a
                          href="/termos-de-uso"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[#13244f] underline hover:text-[#f4001e]"
                        >
                          Termos de Uso
                        </a>
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={processingPayment || !termsAccepted}
                      className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-4 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-50"
                    >
                      {processingPayment
                        ? 'Processando...'
                        : paymentMethod === 'pix' && pixAllowed
                          ? `Gerar Pix — R$ ${getTotal().toFixed(2).replace('.', ',')}`
                          : `Pagar R$ ${getTotal().toFixed(2).replace('.', ',')}`}
                    </button>
                  </form>
                )}

                <div className="pt-2 space-y-2">
                  {[
                    'Pagamento 100% seguro e criptografado',
                    'Farmácias credenciadas pela ANVISA',
                    'Cancele quando quiser, sem burocracia',
                    'Entrega discreta direto na sua porta',
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 text-xs text-gray-400"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="#13244f"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-96 lg:sticky lg:top-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-1">
                Resumo da compra
              </p>
              <p className="text-sm md:text-base text-gray-400">
                {PLAN_TYPE_LABEL[plan]}
              </p>
            </div>

            <div className="space-y-3">
              {getActiveItems().map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.product_name}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#ececec] flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm md:text-base font-medium text-[#13244f] truncate">
                        {(item.quantity ?? 1) > 1 ? `${item.quantity}× ` : ''}
                        {item.product_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.is_required ? 'Principal' : 'Complementar'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm md:text-base font-semibold text-[#13244f] flex-shrink-0">
                    R$ {getPrice(item).toFixed(2).replace('.', ',')}
                  </p>
                </div>
              ))}
            </div>

            {hasOmega3() && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 flex gap-2.5">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0 mt-0.5"
                  aria-hidden
                >
                  <path
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="#b45309"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Caso utilize medicamentos anticoagulantes ou antiagregantes
                  plaquetários, consulte o seu médico antes de iniciar a
                  suplementação.
                </p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center justify-between text-sm md:text-base">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-[#13244f] font-semibold">
                  R$ {getProductsSubtotal().toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm md:text-base">
                <span className="text-gray-500">Frete</span>
                <span className="text-[#13244f] font-semibold">
                  {shipping.valor > 0
                    ? `R$ ${shipping.valor.toFixed(2).replace('.', ',')}`
                    : shippingError
                      ? 'A calcular'
                      : 'R$ 0,00'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm md:text-base font-bold text-[#13244f]">
                  Total hoje
                </span>
                <span className="text-xl font-bold text-[#13244f]">
                  R$ {getTotal().toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            <div className="bg-[#13244f]/5 rounded-xl px-4 py-3 text-xs text-[#13244f] leading-relaxed">
              Planos flexíveis — cancele, pause ou adie quando quiser
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
