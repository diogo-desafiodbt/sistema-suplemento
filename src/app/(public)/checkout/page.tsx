'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PLAN_LABELS, getChargePrice } from '@/lib/plans'

type Step = 2 | 3 | 4

type LocalProtocolItem = {
  product_id: string
  product_name: string
  is_required: boolean
  removed?: boolean
  price_monthly?: number
  price_quarterly?: number
  price_yearly?: number
  image?: string
  activation_reason?: string
  quantity?: number
}

type CheckoutSource = 'full_quiz' | 'mini_quiz'

export default function CheckoutPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(2)
  const [items, setItems] = useState<LocalProtocolItem[]>([])
  const [plan, setPlan] = useState<string>('assinatura_mensal')
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<CheckoutSource>('full_quiz')

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

  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cpf, setCpf] = useState('')
  const [processingPayment, setProcessingPayment] = useState(false)

  const [accountSummary, setAccountSummary] = useState<{ name: string; email: string } | null>(null)
  const [addressSummary, setAddressSummary] = useState<string | null>(null)

  useEffect(() => {
    const itemsRaw = sessionStorage.getItem('protocol_items')
    const savedPlan = sessionStorage.getItem('selected_plan')
    const savedSource = sessionStorage.getItem('checkout_source') as CheckoutSource | null
    const miniRaw = sessionStorage.getItem('mini_quiz_data')
    const quizRaw = sessionStorage.getItem('quiz_data')

    if (!itemsRaw) {
      router.push('/suplementos')
      return
    }

    if (savedSource === 'mini_quiz') {
      if (!miniRaw) {
        router.push('/checkout/triagem')
        return
      }
      setSource('mini_quiz')
    } else if (!quizRaw) {
      router.push('/quiz')
      return
    } else {
      setSource('full_quiz')
    }

    setItems(JSON.parse(itemsRaw))
    if (savedPlan) setPlan(savedPlan)

    checkExistingSession()
  }, [])

  async function checkExistingSession() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
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
    return items.filter(item => !item.removed)
  }

  function getPrice(item: LocalProtocolItem): number {
    return getChargePrice(item.price_monthly ?? 0, plan)
  }

  function getTotal(): number {
    return getActiveItems().reduce((sum, item) => sum + getPrice(item), 0)
  }

  function buildQuizPayload() {
    if (source === 'mini_quiz') {
      const mini = JSON.parse(sessionStorage.getItem('mini_quiz_data') ?? '{}')
      return {
        diagnosis_type: mini.diagnosis_type,
        full_name: mini.full_name,
        age: mini.age,
      }
    }
    return JSON.parse(sessionStorage.getItem('quiz_data') ?? '{}')
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
        toast.error('Este email já está cadastrado. Faça login ou use outro email.')
        return
      }

      await new Promise(resolve => setTimeout(resolve, 1000))

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
      } else {
        toast.error('CEP não encontrado')
      }
    } finally {
      setLoadingCep(false)
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault()
    setProcessingPayment(true)

    const [expMonth, expYearRaw] = cardExpiry.split('/')
    const expYear = expYearRaw?.trim().length === 2
      ? `20${expYearRaw.trim()}`
      : expYearRaw?.trim()

    try {
      const quiz = buildQuizPayload()
      if (!quiz?.diagnosis_type) {
        toast.error(
          source === 'mini_quiz'
            ? 'Dados da triagem incompletos. Volte e preencha novamente.'
            : 'Dados do questionário incompletos. Refaça o quiz.'
        )
        return
      }

      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_type: plan,
          total_amount: getTotal(),
          source,
          quiz,
          protocol_items: getActiveItems(),
          address: {
            zip_code: cep.replace(/\D/g, ''),
            street,
            number,
            complement,
            neighborhood,
            city,
            state,
          },
          card: {
            number: cardNumber,
            holder_name: cardName,
            exp_month: expMonth?.trim(),
            exp_year: expYear,
            cvv: cardCvv,
          },
          cpf,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Erro no pagamento')
        return
      }

      sessionStorage.removeItem('protocol_items')
      sessionStorage.removeItem('selected_plan')
      sessionStorage.removeItem('protocol_id')
      sessionStorage.removeItem('quiz_data')
      sessionStorage.removeItem('mini_quiz_data')
      sessionStorage.removeItem('checkout_source')
      sessionStorage.removeItem('cart_locked_plan')

      router.push('/obrigado')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setProcessingPayment(false)
    }
  }

  const planLabel = PLAN_LABELS[plan] ?? plan

  return (
    <div className="min-h-screen bg-[#f5f0eb]">

      <header className="bg-[#f5f0eb] px-6 py-5 border-b border-[#13244f]/10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
          <nav className="hidden sm:flex items-center gap-2 text-xs text-[#13244f]/50 font-medium">
            {['Conta', 'Entrega', 'Pagamento'].map((label, i) => {
              const stepNum = i + 2
              const isActive = step === stepNum
              const isDone = step > stepNum
              return (
                <span key={label} className="flex items-center gap-2">
                  {i > 0 && <span className="opacity-30">›</span>}
                  <span className={`${isActive ? 'text-[#13244f] font-bold' : isDone ? 'text-[#13244f]/70' : ''}`}>
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
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step > 2 ? 'bg-[#13244f] text-white' : step === 2 ? 'bg-[#13244f] text-white' : 'border-2 border-gray-300 text-gray-400'}`}>
                  {step > 2 ? '✓' : '1'}
                </span>
                <h2 className="font-bold text-[#13244f]">Criar sua conta</h2>
              </div>
              {step > 2 && (
                <button onClick={() => setStep(2)} className="text-xs text-[#f4001e] font-semibold hover:underline">
                  Editar
                </button>
              )}
            </div>

            {step === 2 && (
              <div className="px-6 pb-6 space-y-3 border-t border-gray-50">
                <p className="text-sm md:text-base text-gray-400 pt-3">
                  Já tem conta?{' '}
                  <a href="/login" className="text-[#f4001e] font-semibold hover:underline">Faça login</a>
                </p>
                <form onSubmit={handleCreateAccount} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    type="password"
                    placeholder="Crie uma senha (mínimo 6 caracteres)"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
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
                <p className="text-sm md:text-base text-[#13244f] font-medium">{accountSummary.name}</p>
                <p className="text-sm md:text-base text-gray-400">{accountSummary.email}</p>
              </div>
            )}
          </div>

          <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${step < 3 ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step > 3 ? 'bg-[#13244f] text-white' : step === 3 ? 'bg-[#13244f] text-white' : 'border-2 border-gray-300 text-gray-400'}`}>
                  {step > 3 ? '✓' : '2'}
                </span>
                <h2 className="font-bold text-[#13244f]">Endereço de entrega</h2>
              </div>
              {step > 3 && (
                <button onClick={() => setStep(3)} className="text-xs text-[#f4001e] font-semibold hover:underline">
                  Editar
                </button>
              )}
            </div>

            {step === 3 && (
              <div className="px-6 pb-6 space-y-3 border-t border-gray-50 pt-4">
                <input
                  placeholder="CEP"
                  value={cep}
                  onChange={e => setCep(e.target.value)}
                  onBlur={handleCepBlur}
                  maxLength={9}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                />
                {loadingCep && <p className="text-xs text-gray-400">Buscando CEP...</p>}
                <input
                  placeholder="Rua"
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="Número"
                    value={number}
                    onChange={e => setNumber(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    placeholder="Complemento"
                    value={complement}
                    onChange={e => setComplement(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                </div>
                <input
                  placeholder="Bairro"
                  value={neighborhood}
                  onChange={e => setNeighborhood(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    placeholder="Cidade"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    required
                    className="col-span-2 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    placeholder="UF"
                    value={state}
                    onChange={e => setState(e.target.value)}
                    maxLength={2}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm md:text-base text-[#13244f] font-medium bg-[#13244f]/5 rounded-xl px-4 py-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="#13244f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Entrega grátis para todo o Brasil
                </div>
                <button
                  onClick={() => {
                    setAddressSummary(`${street}, ${number}${complement ? ` ${complement}` : ''} — ${city}/${state}`)
                    setStep(4)
                  }}
                  disabled={!cep || !street || !number || !city || !state}
                  className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-3.5 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-40"
                >
                  Ir para o pagamento
                </button>
              </div>
            )}

            {step > 3 && addressSummary && (
              <div className="px-6 pb-4 border-t border-gray-50 pt-3">
                <p className="text-sm md:text-base text-[#13244f]">{addressSummary}</p>
              </div>
            )}
          </div>

          <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${step < 4 ? 'opacity-50' : ''}`}>
            <div className="px-6 py-4 flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 4 ? 'bg-[#13244f] text-white' : 'border-2 border-gray-300 text-gray-400'}`}>
                3
              </span>
              <h2 className="font-bold text-[#13244f]">Pagamento</h2>
            </div>

            {step === 4 && (
              <div className="px-6 pb-6 space-y-3 border-t border-gray-50 pt-4">
                <form onSubmit={handlePayment} className="space-y-3">
                  <input
                    placeholder="CPF do titular"
                    value={cpf}
                    onChange={e => setCpf(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    placeholder="Número do cartão"
                    value={cardNumber}
                    onChange={e => setCardNumber(e.target.value)}
                    maxLength={19}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <input
                    placeholder="Nome no cartão"
                    value={cardName}
                    onChange={e => setCardName(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Validade (MM/AA)"
                      value={cardExpiry}
                      onChange={e => setCardExpiry(e.target.value)}
                      maxLength={5}
                      required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                    />
                    <input
                      placeholder="CVV"
                      value={cardCvv}
                      onChange={e => setCardCvv(e.target.value)}
                      maxLength={4}
                      required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={processingPayment}
                    className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-4 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-50"
                  >
                    {processingPayment ? 'Processando...' : `Pagar R$ ${getTotal().toFixed(2).replace('.', ',')}`}
                  </button>
                </form>

                <div className="pt-2 space-y-2">
                  {[
                    'Pagamento 100% seguro e criptografado',
                    'Farmácias credenciadas pela ANVISA',
                    'Cancele quando quiser, sem burocracia',
                    'Entrega discreta direto na sua porta',
                  ].map(item => (
                    <div key={item} className="flex items-center gap-2 text-xs text-gray-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="#13244f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
              <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-1">Resumo da compra</p>
              <p className="text-sm md:text-base text-gray-400">{planLabel} de tratamento</p>
            </div>

            <div className="space-y-3">
              {getActiveItems().map(item => (
                <div key={item.product_id} className="flex items-center justify-between gap-3">
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
                      <p className="text-sm md:text-base font-medium text-[#13244f] truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-400">{item.is_required ? 'Tratamento principal' : 'Complementar'}</p>
                    </div>
                  </div>
                  <p className="text-sm md:text-base font-semibold text-[#13244f] flex-shrink-0">
                    R$ {getPrice(item).toFixed(2).replace('.', ',')}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center justify-between text-sm md:text-base">
                <span className="text-gray-500">Entrega</span>
                <span className="text-[#13244f] font-semibold">Grátis</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm md:text-base font-bold text-[#13244f]">Total</span>
                <span className="text-xl font-bold text-[#13244f]">
                  R$ {getTotal().toFixed(2).replace('.', ',')}
                </span>
              </div>
              <p className="text-xs text-gray-400 text-right">por {planLabel}{plan === 'assinatura_mensal' ? '/mês' : ''}</p>
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
