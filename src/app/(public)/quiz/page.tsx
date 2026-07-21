'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { QuizFormData } from '@/lib/quiz/schema'
import { useCart } from '@/lib/use-cart'
import type { ProtocolItem } from '@/types/protocol'

const TOTAL_STEPS = 13

const initialState: Partial<QuizFormData> = {
  medications: [],
  family_history: [],
  symptoms: [],
  conditions_mild: [],
  conditions_serious: [],
  prior_treatment: [],
  plan_type: '1mes',
}

export default function QuizPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<Partial<QuizFormData>>(initialState)
  const [loading, setLoading] = useState(false)
  const { items: cartItems, plan: cartPlan } = useCart()
  const [introSeen, setIntroSeen] = useState(true)

  useEffect(() => {
    if (cartItems.length > 0) {
      setIntroSeen(false)
    }
    // Evaluate cart once on mount (after client hydration of useCart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const progress = (step / TOTAL_STEPS) * 100

  function goNext() {
    setStep(s => Math.min(s + 1, TOTAL_STEPS))
  }

  function setSingle<K extends keyof QuizFormData>(key: K, value: QuizFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function isSelected(key: keyof QuizFormData, value: string) {
    return ((form[key] as string[]) ?? []).includes(value)
  }

  async function submit(dataOverride?: Partial<QuizFormData>) {
    const data = dataOverride ?? form
    setLoading(true)
    try {
      sessionStorage.setItem('quiz_data', JSON.stringify(data))

      let items: ProtocolItem[]

      if (cartItems.length > 0) {
        items = cartItems.map((cartItem) => ({
          product_id: cartItem.product_id,
          product_name: cartItem.name,
          pharmacy_sku: '',
          is_required: false,
          activation_reason: 'Selecionado por você no carrinho',
          quantity: cartItem.quantity,
        }))
        sessionStorage.setItem('cart_locked_plan', cartPlan)
      } else {
        const { generateProtocol } = await import('@/lib/protocol/generator')
        items = generateProtocol(data as QuizFormData, data.plan_type ?? '1mes')
        sessionStorage.removeItem('cart_locked_plan')
      }

      sessionStorage.setItem('protocol_items', JSON.stringify(items))

      router.push('/recomendacoes')
    } catch {
      toast.error('Erro ao processar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function finishStep(nextForm: Partial<QuizFormData>, isLast = false) {
    setTimeout(() => {
      if (isLast) submit(nextForm)
      else goNext()
    }, 120)
  }

  function selectSingleAndAdvance<K extends keyof QuizFormData>(key: K, value: QuizFormData[K]) {
    const nextForm = { ...form, [key]: value }
    setForm(nextForm)
    finishStep(nextForm)
  }

  function selectMultipleAndAdvance(key: keyof QuizFormData, value: string, isLast = false) {
    const current = (form[key] as string[]) ?? []
    if (current.includes(value)) return

    let updated: string[]
    if (value === 'nenhum' && (key === 'medications' || key === 'symptoms')) {
      updated = ['nenhum']
    } else if (key === 'family_history' && (value === 'nao' || value === 'nao_sei')) {
      updated = [value]
    } else {
      updated = [...current.filter(v => v !== 'nenhum'), value]
    }

    const nextForm = { ...form, [key]: updated }
    setForm(nextForm)
    finishStep(nextForm, isLast)
  }

  function OptionButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm md:text-base text-left transition-all ${
          selected
            ? 'border-[#13244f] bg-[#13244f]/5 text-[#13244f] font-medium'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
        }`}
      >
        <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          selected ? 'border-[#13244f]' : 'border-gray-300'
        }`}>
          {selected && <span className="w-2 h-2 rounded-full bg-[#13244f]" />}
        </span>
        {label}
      </button>
    )
  }

  function QuestionWrapper({
    title, subtitle, category, children, showContinue = false,
  }: {
    title: string; subtitle?: string; category?: string; children: React.ReactNode; showContinue?: boolean
  }) {
    const showAllergyContinue = showContinue && form.allergies !== 'nao' && form.allergies !== 'nao_sei'

    return (
      <div className="space-y-5">
        <div>
          {category && (
            <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-2">{category}</p>
          )}
          <h2 className="font-display text-2xl md:text-3xl lg:text-4xl text-[#13244f] leading-snug">{title}</h2>
          {subtitle && <p className="text-sm md:text-base text-gray-500 mt-1.5 leading-relaxed">{subtitle}</p>}
        </div>
        <div className="space-y-3">{children}</div>
        {(step > 1 || showAllergyContinue) && (
          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex-1 border border-[#13244f] text-[#13244f] py-3 rounded-full text-sm font-semibold hover:bg-[#13244f]/5 transition"
              >
                Voltar
              </button>
            )}
            {showAllergyContinue && (
              <button
                type="button"
                onClick={goNext}
                disabled={!form.allergies?.trim()}
                className="flex-1 bg-[#f4001e] text-white py-3 rounded-full text-sm font-semibold hover:bg-[#a30000] transition disabled:opacity-40"
              >
                Continuar
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function selectConditionAndAdvance(type: 'mild' | 'serious', value: string) {
    const key = type === 'mild' ? 'conditions_mild' : 'conditions_serious'
    const nextForm = { ...form, [key]: [value] }
    setForm(nextForm)
    finishStep(nextForm)
  }

  function clearConditionsAndAdvance() {
    const nextForm = { ...form, conditions_mild: [], conditions_serious: [] }
    setForm(nextForm)
    finishStep(nextForm)
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <QuestionWrapper category="DIABETES" title="Qual é o seu diagnóstico?">
            {[
              { value: 'type2', label: 'Diabetes tipo 2' },
              { value: 'prediabetes', label: 'Pré-diabetes' },
              { value: 'undiagnosed', label: 'Ainda não fui diagnosticado, mas tenho histórico familiar' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.diagnosis_type === opt.value}
                onClick={() => selectSingleAndAdvance('diagnosis_type', opt.value as QuizFormData['diagnosis_type'])} />
            ))}
          </QuestionWrapper>
        )

      case 2:
        return (
          <QuestionWrapper title="Há quanto tempo você convive com isso?">
            {[
              { value: '<1ano', label: 'Menos de 1 ano' },
              { value: '1-5anos', label: 'Entre 1 e 5 anos' },
              { value: '5-10anos', label: 'Entre 5 e 10 anos' },
              { value: '>10anos', label: 'Mais de 10 anos' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.years_diagnosed === opt.value}
                onClick={() => selectSingleAndAdvance('years_diagnosed', opt.value as QuizFormData['years_diagnosed'])} />
            ))}
          </QuestionWrapper>
        )

      case 3:
        return (
          <QuestionWrapper title="Você sabe qual foi sua última hemoglobina glicada (HbA1c)?"
            subtitle="Esse exame mede o controle do diabetes nos últimos 3 meses">
            {[
              { value: '<7', label: 'Abaixo de 7% — bem controlado' },
              { value: '7-9', label: 'Entre 7% e 9% — controle moderado' },
              { value: '>9', label: 'Acima de 9% — controle difícil' },
              { value: 'nao_sei', label: 'Não sei / não fiz o exame' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.hba1c_range === opt.value}
                onClick={() => selectSingleAndAdvance('hba1c_range', opt.value as QuizFormData['hba1c_range'])} />
            ))}
          </QuestionWrapper>
        )

      case 4:
        return (
          <QuestionWrapper title="Qual costuma ser sua glicemia em jejum?">
            {[
              { value: '<100', label: 'Abaixo de 100 mg/dL' },
              { value: '100-125', label: 'Entre 100 e 125 mg/dL' },
              { value: '126-199', label: 'Entre 126 e 199 mg/dL' },
              { value: '>200', label: 'Acima de 200 mg/dL' },
              { value: 'nao_sei', label: 'Não monitoro / não sei' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.fasting_glucose === opt.value}
                onClick={() => selectSingleAndAdvance('fasting_glucose', opt.value as QuizFormData['fasting_glucose'])} />
            ))}
          </QuestionWrapper>
        )

      case 5:
        return (
          <QuestionWrapper title="Você faz uso de algum medicamento para diabetes?"
            subtitle="Selecione todos que se aplicam">
            {[
              { value: 'metformina', label: 'Metformina' },
              { value: 'insulina', label: 'Insulina' },
              { value: 'outro', label: 'Outro (Ozempic, Jardiance, etc.)' },
              { value: 'nenhum', label: 'Não uso nenhum' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={isSelected('medications', opt.value)}
                onClick={() => selectMultipleAndAdvance('medications', opt.value)} />
            ))}
          </QuestionWrapper>
        )

      case 6:
        return (
          <QuestionWrapper title="Existe histórico de diabetes na sua família?"
            subtitle="Selecione todos que se aplicam">
            {[
              { value: 'pai_mae', label: 'Sim, pai ou mãe' },
              { value: 'avos', label: 'Sim, avós' },
              { value: 'irmaos', label: 'Sim, irmãos' },
              { value: 'nao', label: 'Não' },
              { value: 'nao_sei', label: 'Não sei' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={isSelected('family_history', opt.value)}
                onClick={() => selectMultipleAndAdvance('family_history', opt.value)} />
            ))}
          </QuestionWrapper>
        )

      case 7:
        return (
          <QuestionWrapper title="Você sente algum desses sintomas com frequência?"
            subtitle="Selecione todos que se aplicam">
            {[
              { value: 'formigamento', label: 'Formigamento ou dormência nas mãos/pés' },
              { value: 'fadiga', label: 'Cansaço e fadiga excessivos' },
              { value: 'visao', label: 'Visão embaçada' },
              { value: 'cicatrizacao', label: 'Dificuldade de cicatrização' },
              { value: 'sede', label: 'Sede excessiva / urinação frequente' },
              { value: 'nenhum', label: 'Não tenho nenhum desses sintomas' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={isSelected('symptoms', opt.value)}
                onClick={() => selectMultipleAndAdvance('symptoms', opt.value)} />
            ))}
          </QuestionWrapper>
        )

      case 8:
        return (
          <QuestionWrapper title="Você tem ou já teve alguma dessas condições de saúde?"
            subtitle="Selecione todas que se aplicam">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Condições gerais</p>
            {[
              { value: 'hipertensao', label: 'Pressão alta (hipertensão)' },
              { value: 'colesterol', label: 'Colesterol ou triglicerídeos elevados' },
              { value: 'figado_gorduroso', label: 'Fígado gorduroso (esteatose leve)' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={isSelected('conditions_mild', opt.value)}
                onClick={() => selectConditionAndAdvance('mild', opt.value)} />
            ))}
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide pt-2">Condições sérias</p>
            {[
              { value: 'doenca_renal', label: 'Doença renal crônica' },
              { value: 'doenca_cardiaca', label: 'Doença cardíaca (insuficiência, infarto ou arritmia)' },
              { value: 'cirrose', label: 'Cirrose ou doença hepática grave' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={isSelected('conditions_serious', opt.value)}
                onClick={() => selectConditionAndAdvance('serious', opt.value)} />
            ))}
            <OptionButton label="Nenhuma dessas condições"
              selected={form.conditions_mild?.length === 0 && form.conditions_serious?.length === 0}
              onClick={clearConditionsAndAdvance} />
          </QuestionWrapper>
        )

      case 9:
        return (
          <QuestionWrapper title="Como você descreveria seu peso atual?">
            {[
              { value: 'saudavel', label: 'Peso saudável' },
              { value: 'sobrepeso', label: 'Sobrepeso leve' },
              { value: 'obesidade', label: 'Obesidade' },
              { value: 'abaixo', label: 'Abaixo do peso' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.weight_status === opt.value}
                onClick={() => selectSingleAndAdvance('weight_status', opt.value as QuizFormData['weight_status'])} />
            ))}
          </QuestionWrapper>
        )

      case 10:
        return (
          <QuestionWrapper title="Com que frequência você pratica atividade física?">
            {[
              { value: 'nenhum', label: 'Não pratico' },
              { value: '1-2x', label: '1 a 2 vezes por semana' },
              { value: '3-4x', label: '3 a 4 vezes por semana' },
              { value: '5x+', label: '5 ou mais vezes por semana' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.exercise_freq === opt.value}
                onClick={() => selectSingleAndAdvance('exercise_freq', opt.value as QuizFormData['exercise_freq'])} />
            ))}
          </QuestionWrapper>
        )

      case 11:
        return (
          <QuestionWrapper title="Como você avalia sua alimentação hoje?">
            {[
              { value: 'low_carb', label: 'Sigo dieta com restrição de carboidratos' },
              { value: 'tenta', label: 'Tento me alimentar bem, sem dieta específica' },
              { value: 'sem_restricao', label: 'Como de tudo sem restrições' },
              { value: 'dificuldade', label: 'Tenho dificuldade de manter alimentação saudável' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.diet_quality === opt.value}
                onClick={() => selectSingleAndAdvance('diet_quality', opt.value as QuizFormData['diet_quality'])} />
            ))}
          </QuestionWrapper>
        )

      case 12:
        return (
          <QuestionWrapper title="Você tem alergia a algum componente?"
            subtitle="Ex: berberina, ômega-3, vitamina B12"
            showContinue>
            {[
              { value: 'nao', label: 'Não tenho alergias conhecidas' },
              { value: 'nao_sei', label: 'Não sei' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={form.allergies === opt.value}
                onClick={() => selectSingleAndAdvance('allergies', opt.value)} />
            ))}
            <button type="button"
              onClick={() => setSingle('allergies', '')}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm text-left transition-all ${
                form.allergies !== null && form.allergies !== 'nao' && form.allergies !== 'nao_sei'
                  ? 'border-[#13244f] bg-[#13244f]/5 text-[#13244f] font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}>
              <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                form.allergies !== null && form.allergies !== 'nao' && form.allergies !== 'nao_sei'
                  ? 'border-[#13244f]' : 'border-gray-300'
              }`}>
                {form.allergies !== null && form.allergies !== 'nao' && form.allergies !== 'nao_sei' && (
                  <span className="w-2 h-2 rounded-full bg-[#13244f]" />
                )}
              </span>
              Sim, tenho alergia
            </button>
            {form.allergies !== null && form.allergies !== 'nao' && form.allergies !== 'nao_sei' && (
              <input type="text" placeholder="Descreva sua alergia..."
                value={form.allergies ?? ''}
                onChange={e => setSingle('allergies', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f]" />
            )}
          </QuestionWrapper>
        )

      case 13:
        return (
          <QuestionWrapper title="Você já fez algum tratamento contínuo para diabetes por mais de 6 meses?"
            subtitle="Selecione todos que se aplicam">
            {[
              { value: 'medicamentos', label: 'Sim, apenas com medicamentos' },
              { value: 'suplementos', label: 'Sim, com suplementos naturais' },
              { value: 'dieta', label: 'Sim, com mudança de dieta' },
              { value: 'comecando', label: 'Não, estou começando agora' },
            ].map(opt => (
              <OptionButton key={opt.value} label={opt.label}
                selected={isSelected('prior_treatment', opt.value)}
                onClick={() => !loading && selectMultipleAndAdvance('prior_treatment', opt.value, true)} />
            ))}
            {loading && (
              <p className="text-sm text-[#13244f]/60 text-center pt-2 font-medium">Gerando protocolo...</p>
            )}
          </QuestionWrapper>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      <header className="bg-[#f5f0eb] px-6 pt-5 pb-3">
        <div className="max-w-lg md:max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4 gap-3">
            <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
            <div className="flex items-center gap-2">
              {cartItems.length > 0 && (
                <span className="text-xs font-medium text-[#13244f] bg-white border border-[#ececec] rounded-full px-2.5 py-1">
                  🛒 {cartItems.length} {cartItems.length === 1 ? 'item' : 'itens'} no carrinho
                </span>
              )}
              <span className="text-xs text-gray-400 font-medium">{step} de {TOTAL_STEPS}</span>
            </div>
          </div>
          <div className="w-full h-0.5 bg-gray-200 rounded-full">
            <div
              className="h-0.5 bg-[#13244f] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-start md:items-center justify-center px-6 pt-10 pb-10">
        <div className="w-full max-w-lg md:max-w-5xl md:grid md:grid-cols-[1fr_1.3fr] md:gap-12 md:items-center">
          {/* Painel lateral — só desktop */}
          <div className="hidden md:flex flex-col gap-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase">SUA SEGURANÇA EM PRIMEIRO LUGAR</p>
            <h3 className="font-display text-2xl text-[#13244f] leading-snug">Desenvolvido pelo Dr. Turí Souza</h3>
            <p className="text-base text-gray-600 leading-relaxed">
              Cada resposta ajuda a gente a confirmar que o suplemento é seguro pro seu caso — alergias, medicações e histórico são revisados antes de qualquer aprovação.
            </p>
            <div className="border-t border-gray-100 pt-5 flex flex-col gap-3">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
                Farmácia credenciada ANVISA
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Pagamento seguro
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Cancele quando quiser
              </div>
            </div>
          </div>

          {/* Conteúdo da pergunta */}
          <div className="w-full">
            {!introSeen ? (
              <div className="space-y-5">
                <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-2">SUA SEGURANÇA PRIMEIRO</p>
                <h2 className="font-display text-2xl md:text-3xl text-[#13244f] leading-snug">
                  Antes de liberar sua compra, vamos confirmar que é seguro pra você
                </h2>
                <p className="text-sm md:text-base text-gray-500 leading-relaxed">
                  Esse questionário existe pra validar que seu corpo está preparado para receber o suplemento que você escolheu. A gente se preocupa com a sua saúde — por isso analisamos alergias, predisposições e histórico antes de aprovar sua compra. Desenvolvido pelo Dr. Turí Souza, pra te dar mais segurança na sua suplementação.
                </p>
                <button
                  type="button"
                  onClick={() => setIntroSeen(true)}
                  className="w-full bg-[#f4001e] text-white py-3 rounded-full text-sm font-semibold hover:bg-[#a30000] transition"
                >
                  Começar
                </button>
              </div>
            ) : (
              renderStep()
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
