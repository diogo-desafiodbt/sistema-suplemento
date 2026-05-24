'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type Step = 1 | 2 | 3 | 4

type LocalProtocolItem = {
  product_id: string
  product_name: string
  is_required: boolean
  removed?: boolean
  price_monthly?: number
  price_quarterly?: number
  price_yearly?: number
}

async function submitQuizAndGetProtocolId(plan: string): Promise<string | null> {
  const quizDataRaw = sessionStorage.getItem('quiz_data')
  const protocolItemsRaw = sessionStorage.getItem('protocol_items')
  if (!quizDataRaw) return sessionStorage.getItem('protocol_id')

  const quizData = JSON.parse(quizDataRaw)
  const protocolItems = protocolItemsRaw ? JSON.parse(protocolItemsRaw) : undefined
  const res = await fetch('/api/quiz/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...quizData, plan_type: plan, protocol_items: protocolItems }),
  })

  if (!res.ok) return null

  const result = await res.json()
  sessionStorage.setItem('protocol_id', result.protocol_id)
  sessionStorage.removeItem('quiz_data')
  return result.protocol_id as string
}

export default function CheckoutPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [items, setItems] = useState<LocalProtocolItem[]>([])
  const [plan, setPlan] = useState<string>('1mes')
  const [loading, setLoading] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [protocolId, setProtocolId] = useState<string | null>(null)

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

  useEffect(() => {
    const itemsRaw = sessionStorage.getItem('protocol_items')
    const savedPlan = sessionStorage.getItem('selected_plan')
    const savedProtocolId = sessionStorage.getItem('protocol_id')
    if (!itemsRaw) {
      router.push('/quiz')
      return
    }
    setItems(JSON.parse(itemsRaw))
    if (savedPlan) setPlan(savedPlan)
    if (savedProtocolId) setProtocolId(savedProtocolId)

    checkExistingSession()
  }, [])

  async function checkExistingSession() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const currentPlan = sessionStorage.getItem('selected_plan') ?? plan

    const savedProtocolId = sessionStorage.getItem('protocol_id')
    if (savedProtocolId) {
      setProtocolId(savedProtocolId)
      setStep(3)
      return
    }

    const protocolIdFromQuiz = await submitQuizAndGetProtocolId(currentPlan)
    if (protocolIdFromQuiz) {
      setProtocolId(protocolIdFromQuiz)
    } else {
      const { data: protocol } = await supabase
        .from('protocols')
        .select('id')
        .eq('user_id', user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (protocol) {
        setProtocolId(protocol.id)
        sessionStorage.setItem('protocol_id', protocol.id)
      }
    }

    setStep(3)
  }

  function getActiveItems() {
    return items.filter(item => !item.removed)
  }

  function getPrice(item: LocalProtocolItem): number {
    if (plan === '1mes') return item.price_monthly ?? 0
    if (plan === '3meses') return item.price_quarterly ?? 0
    return item.price_yearly ?? 0
  }

  function getTotal(): number {
    return getActiveItems().reduce((sum, item) => sum + getPrice(item), 0)
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

      const newProtocolId = await submitQuizAndGetProtocolId(plan)
      if (newProtocolId) {
        setProtocolId(newProtocolId)
      }

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
    if (!protocolId) {
      toast.error('Protocolo não encontrado. Refaça o quiz.')
      return
    }
    setProcessingPayment(true)

    const [expMonth, expYearRaw] = cardExpiry.split('/')
    const expYear = expYearRaw?.trim().length === 2
      ? `20${expYearRaw.trim()}`
      : expYearRaw?.trim()

    try {
      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol_id: protocolId,
          plan_type: plan,
          total_amount: getTotal(),
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

      router.push('/obrigado')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setProcessingPayment(false)
    }
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Seu tratamento</h2>
              <p className="text-gray-500 text-sm mt-1">Confirme os produtos selecionados</p>
            </div>
            <div className="space-y-3">
              {getActiveItems().map(item => (
                <div key={item.product_id} className="flex justify-between items-center bg-white border rounded-lg px-4 py-3">
                  <span className="text-sm font-medium">{item.product_name}</span>
                  <span className="text-sm">R$ {getPrice(item).toFixed(2).replace('.', ',')}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-medium">Total</span>
                <span className="font-semibold text-lg">R$ {getTotal().toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
            <Button onClick={() => setStep(2)} className="w-full" size="lg">
              Continuar
            </Button>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Criar sua conta</h2>
              <p className="text-gray-500 text-sm mt-1">
                Já tem conta?{' '}
                <a href="/login" className="underline">Faça login</a>
              </p>
            </div>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? 'Criando conta...' : 'Criar conta e continuar'}
              </Button>
            </form>
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Endereço de entrega</h2>
              <p className="text-gray-500 text-sm mt-1">Para onde enviamos seu tratamento</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  placeholder="00000-000"
                  value={cep}
                  onChange={e => setCep(e.target.value)}
                  onBlur={handleCepBlur}
                  maxLength={9}
                />
                {loadingCep && <p className="text-xs text-gray-400">Buscando CEP...</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="street">Rua</Label>
                <Input id="street" value={street} onChange={e => setStreet(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input id="number" value={number} onChange={e => setNumber(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="complement">Complemento</Label>
                  <Input id="complement" value={complement} onChange={e => setComplement(e.target.value)} placeholder="Apto, sala..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" value={city} onChange={e => setCity(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">UF</Label>
                  <Input id="state" value={state} onChange={e => setState(e.target.value)} maxLength={2} required />
                </div>
              </div>
            </div>
            <Button
              onClick={() => setStep(4)}
              disabled={!cep || !street || !number || !city || !state}
              className="w-full"
              size="lg"
            >
              Continuar para pagamento
            </Button>
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Pagamento</h2>
              <p className="text-gray-500 text-sm mt-1">Seus dados são criptografados e seguros</p>
            </div>
            <form onSubmit={handlePayment} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF do titular</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={e => setCpf(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Número do cartão</Label>
                <Input
                  id="cardNumber"
                  placeholder="0000 0000 0000 0000"
                  value={cardNumber}
                  onChange={e => setCardNumber(e.target.value)}
                  maxLength={19}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardName">Nome no cartão</Label>
                <Input
                  id="cardName"
                  placeholder="Como está no cartão"
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cardExpiry">Validade</Label>
                  <Input
                    id="cardExpiry"
                    placeholder="MM/AA"
                    value={cardExpiry}
                    onChange={e => setCardExpiry(e.target.value)}
                    maxLength={5}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cardCvv">CVV</Label>
                  <Input
                    id="cardCvv"
                    placeholder="000"
                    value={cardCvv}
                    onChange={e => setCardCvv(e.target.value)}
                    maxLength={4}
                    required
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Subtotal</span>
                  <span>R$ {getTotal().toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>R$ {getTotal().toFixed(2).replace('.', ',')}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">Renovação automática. Cancele quando quiser.</p>
              </div>

              <Button type="submit" disabled={processingPayment} className="w-full" size="lg">
                {processingPayment ? 'Processando pagamento...' : `Pagar R$ ${getTotal().toFixed(2).replace('.', ',')}`}
              </Button>
            </form>
          </div>
        )
    }
  }

  const STEP_LABELS = ['Tratamento', 'Conta', 'Entrega', 'Pagamento']

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Desafio Diabetes</span>
            <span className="text-sm text-gray-400">Passo {step} de 4</span>
          </div>
          <div className="flex gap-1">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex-1">
                <div className={`h-1 rounded-full ${i + 1 <= step ? 'bg-black' : 'bg-gray-200'}`} />
                <p className={`text-xs mt-1 text-center ${i + 1 === step ? 'text-black font-medium' : 'text-gray-400'}`}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-6">
        {renderStep()}
      </main>
    </div>
  )
}
