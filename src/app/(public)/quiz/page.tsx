'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trackFunnelEvent } from '@/lib/funnel/track'
import {
  ALL_PRODUCT_KEYS,
  blockReasonForProduct,
  cheapestSuggestion,
  type DiagnosisType,
  defaultSuggestion,
  type HepaticCondition,
  PRODUCT_NAME_BY_KEY,
  type ProductKey,
  productKeyFromName,
  type RenalCondition,
  type Sex,
  type TriageAnswers,
} from '@/lib/protocol/triage'
import {
  findSupplementImageByProductName,
  supplements,
} from '@/lib/supplements-content'

type TriageForm = {
  full_name: string
  age: string
  sex: Sex | null
  is_pregnant_or_breastfeeding: boolean | null
  renal_conditions: RenalCondition[]
  renal_none: boolean
  hepatic_conditions: HepaticCondition[]
  hepatic_none: boolean
  diagnosis_type: DiagnosisType | null
  medications: string[]
  medications_none: boolean
  allergic_supplement_slugs: string[]
}

/** Catálogo ativo no funil (sem Ômega 3) — para a pergunta de alergias. */
const ALLERGY_CATALOG_NAMES = new Set(
  ALL_PRODUCT_KEYS.map((k) => PRODUCT_NAME_BY_KEY[k]),
)
const ALLERGY_SUPPLEMENTS = supplements.filter((s) =>
  ALLERGY_CATALOG_NAMES.has(s.name),
)

type ProtocolItemBuilt = {
  product_id: string
  product_name: string
  pharmacy_sku: string
  is_required: boolean
  activation_reason: string
  quantity: number
  removed?: boolean
  blocked?: boolean
  price_monthly?: number
  price_quarterly?: number
  price_yearly?: number
  image?: string
}

type ProductRow = {
  id: string
  name: string
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  is_active: boolean
}

const RENAL_OPTIONS: Array<{ value: RenalCondition; label: string }> = [
  { value: 'hemodialise', label: 'Faço hemodiálise' },
  {
    value: 'insuficiencia_renal_aguda',
    label: 'Tenho Insuficiência Renal Aguda',
  },
  {
    value: 'tfg_menor_30',
    label: 'Minha Taxa de Filtração Glomerular (TFG) é menor que 30',
  },
]

const HEPATIC_OPTIONS: Array<{ value: HepaticCondition; label: string }> = [
  { value: 'cirrose', label: 'Cirrose' },
  { value: 'hepatite_ativa', label: 'Hepatite ativa' },
  { value: 'ictericia', label: 'Icterícia' },
  { value: 'esteatose', label: 'Esteatose' },
]

const DIAGNOSIS_OPTIONS: Array<{ value: DiagnosisType; label: string }> = [
  { value: 'type1', label: 'Diabetes Tipo 1 (autoimune da infância)' },
  { value: 'type2', label: 'Diabetes Tipo 2' },
  { value: 'prediabetes', label: 'Pré-diabetes / Resistência à insulina' },
  {
    value: 'lada_avancado',
    label: 'Diabetes LADA avançado (já usa insulina lenta e insulina rápida)',
  },
  { value: 'undiagnosed', label: 'Nenhum dos anteriores' },
]

const MEDICATION_OPTIONS: Array<{ value: string; label: string }> = [
  {
    value: 'insulina',
    label:
      'Insulina (Lantus®, Basaglar®, Toujeo®, Tresiba®, Humulin®, Novolin®, Fiasp®, NovoRapid®, Humalog®).',
  },
  {
    value: 'metformina',
    label: 'Metformina (Glifage®, Dimefor®, Glucoformin®).',
  },
  {
    value: 'sulfonilureias',
    label: 'Sulfonilureias (Diamicron®, Glicazida®, Amaryl®, Daonil®).',
  },
  {
    value: 'sglt2',
    label: 'Inibidores da SGLT-2 (Forxiga®, Jardiance®, Invokana®).',
  },
  {
    value: 'gliptinas',
    label: 'Gliptinas (Januvia®, Galvus®, Onglyza®, Nesina®, Trayenta®).',
  },
  { value: 'pioglitazona', label: 'Pioglitazona (Actos®).' },
  {
    value: 'glp1',
    label:
      'Agonistas do GLP-1 (Ozempic®, Wegovy®, Mounjaro®, Trulicity®, Victoza®).',
  },
  {
    value: 'anticoagulantes',
    label:
      'Anticoagulantes e antiagregantes plaquetários (Marevan®, Xarelto®, Eliquis®, Pradaxa®, Plavix®, AAS®).',
  },
  { value: 'pressao', label: 'Medicamentos para pressão arterial.' },
  { value: 'colesterol', label: 'Medicamentos para colesterol.' },
]

const initialForm: TriageForm = {
  full_name: '',
  age: '',
  sex: null,
  is_pregnant_or_breastfeeding: null,
  renal_conditions: [],
  renal_none: false,
  hepatic_conditions: [],
  hepatic_none: false,
  diagnosis_type: null,
  medications: [],
  medications_none: false,
  allergic_supplement_slugs: [],
}

type StepId =
  | 'nome'
  | 'idade'
  | 'sexo'
  | 'gestacao'
  | 'renal'
  | 'hepatica'
  | 'diabetes'
  | 'medicamentos'
  | 'alergias'

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
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
      <span
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          selected ? 'border-[#13244f]' : 'border-gray-300'
        }`}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-[#13244f]" />}
      </span>
      {label}
    </button>
  )
}

function CheckOption({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm md:text-base text-left transition-all ${
        selected
          ? 'border-[#13244f] bg-[#13244f]/5 text-[#13244f] font-medium'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
      }`}
    >
      <span
        className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          selected ? 'border-[#13244f] bg-[#13244f]' : 'border-gray-300'
        }`}
      >
        {selected && (
          <svg
            width="10"
            height="8"
            viewBox="0 0 10 8"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1 4l2.5 2.5L9 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="leading-snug">{label}</span>
    </button>
  )
}

function QuestionWrapper({
  title,
  subtitle,
  category,
  children,
  showContinue = false,
  continueDisabled = false,
  onContinue,
  onBack,
  stepIndex,
  loading = false,
}: {
  title: string
  subtitle?: string
  category?: string
  children: React.ReactNode
  showContinue?: boolean
  continueDisabled?: boolean
  onContinue?: () => void
  onBack: () => void
  stepIndex: number
  loading?: boolean
}) {
  return (
    <div className="space-y-5">
      <div>
        {category && (
          <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-2">
            {category}
          </p>
        )}
        <h2 className="font-display text-2xl md:text-3xl lg:text-4xl text-[#13244f] leading-snug">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm md:text-base text-gray-500 mt-1.5 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
      {(stepIndex > 0 || showContinue) && (
        <div className="flex gap-3 pt-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={onBack}
              className="flex-1 border border-[#13244f] text-[#13244f] py-3 rounded-full text-sm font-semibold hover:bg-[#13244f]/5 transition"
            >
              Voltar
            </button>
          )}
          {showContinue && (
            <button
              type="button"
              onClick={onContinue}
              disabled={continueDisabled || loading}
              className="flex-1 bg-[#f4001e] text-white py-3 rounded-full text-sm font-semibold hover:bg-[#a30000] transition disabled:opacity-40"
            >
              {loading ? 'Processando…' : 'Continuar'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function QuizPage() {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<TriageForm>(initialForm)
  const [loading, setLoading] = useState(false)
  const [blockReason, setBlockReason] = useState<string | null>(null)

  useEffect(() => {
    trackFunnelEvent('quiz_started')
  }, [])

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = ['nome', 'idade', 'sexo']
    if (form.sex === 'mulher') base.push('gestacao')
    base.push('renal', 'hepatica', 'diabetes', 'medicamentos', 'alergias')
    return base
  }, [form.sex])

  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const progress = ((stepIndex + 1) / steps.length) * 100

  function goNext() {
    setStepIndex((s) => Math.min(s + 1, steps.length - 1))
  }

  function goBack() {
    setStepIndex((s) => Math.max(s - 1, 0))
  }

  function toggleRenal(value: RenalCondition) {
    setForm((prev) => {
      const has = prev.renal_conditions.includes(value)
      return {
        ...prev,
        renal_none: false,
        renal_conditions: has
          ? prev.renal_conditions.filter((v) => v !== value)
          : [...prev.renal_conditions, value],
      }
    })
  }

  function toggleHepatic(value: HepaticCondition) {
    setForm((prev) => {
      const has = prev.hepatic_conditions.includes(value)
      return {
        ...prev,
        hepatic_none: false,
        hepatic_conditions: has
          ? prev.hepatic_conditions.filter((v) => v !== value)
          : [...prev.hepatic_conditions, value],
      }
    })
  }

  function toggleMedication(value: string) {
    setForm((prev) => {
      const has = prev.medications.includes(value)
      return {
        ...prev,
        medications_none: false,
        medications: has
          ? prev.medications.filter((v) => v !== value)
          : [...prev.medications, value],
      }
    })
  }

  function toggleAllergicSupplement(slug: string) {
    setForm((prev) => {
      const has = prev.allergic_supplement_slugs.includes(slug)
      return {
        ...prev,
        allergic_supplement_slugs: has
          ? prev.allergic_supplement_slugs.filter((s) => s !== slug)
          : [...prev.allergic_supplement_slugs, slug],
      }
    })
  }

  async function finishTriage() {
    const age = Number.parseInt(form.age, 10)
    if (
      !form.sex ||
      !form.diagnosis_type ||
      !Number.isFinite(age) ||
      age < 1 ||
      age > 120
    ) {
      toast.error('Preencha todas as perguntas antes de continuar.')
      return
    }

    const answers: TriageAnswers = {
      age,
      sex: form.sex,
      is_pregnant_or_breastfeeding:
        form.sex === 'mulher' ? !!form.is_pregnant_or_breastfeeding : false,
      renal_conditions: form.renal_none ? [] : form.renal_conditions,
      hepatic_conditions: form.hepatic_none ? [] : form.hepatic_conditions,
      diagnosis_type: form.diagnosis_type,
      medications: form.medications_none ? [] : form.medications,
    }

    trackFunnelEvent('quiz_completed')
    setLoading(true)
    try {
      const sessionRes = await fetch('/api/quiz/triage-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      const sessionData = await sessionRes.json()
      if (sessionRes.status === 403 || sessionData.blocked) {
        setBlockReason(
          sessionData.error ??
            'Vendemos apenas para pessoas a partir de 14 anos.',
        )
        return
      }
      if (!sessionRes.ok || !sessionData.token || !sessionData.allowed) {
        throw new Error('triage-session')
      }

      const allowed = sessionData.allowed as ProductKey[]
      trackFunnelEvent('quiz_eligible')

      const res = await fetch('/api/products')
      if (!res.ok) throw new Error('products')
      const data = await res.json()
      const products: ProductRow[] = (data.products ?? []).filter(
        (p: ProductRow) => p.is_active !== false,
      )

      const productByKey = new Map<ProductKey, ProductRow>()
      for (const product of products) {
        const key = productKeyFromName(product.name)
        if (key && !productByKey.has(key)) productByKey.set(key, product)
      }

      const monthlyPriceByKey: Partial<Record<ProductKey, number>> = {}
      for (const [key, product] of productByKey) {
        monthlyPriceByKey[key] = product.price_monthly
      }

      const suggestion =
        allowed.length > 0
          ? cheapestSuggestion(allowed, monthlyPriceByKey)
          : defaultSuggestion(allowed)
      const suggestionSet = new Set(suggestion)

      const protocolItems: ProtocolItemBuilt[] = []

      for (const key of ALL_PRODUCT_KEYS) {
        const product = productByKey.get(key)
        if (!product) {
          throw new Error(
            `Produto sem match no catálogo: ${key} (${PRODUCT_NAME_BY_KEY[key]})`,
          )
        }

        const name = PRODUCT_NAME_BY_KEY[key]
        const image = findSupplementImageByProductName(name) ?? undefined
        const base = {
          product_id: product.id,
          product_name: name,
          pharmacy_sku: '',
          quantity: 1,
          price_monthly: product.price_monthly,
          price_quarterly: product.price_quarterly,
          price_yearly: product.price_yearly,
          image,
        }

        if (!allowed.includes(key)) {
          protocolItems.push({
            ...base,
            is_required: false,
            removed: true,
            blocked: true,
            activation_reason: blockReasonForProduct(key, []),
          })
          continue
        }

        if (suggestionSet.has(key)) {
          protocolItems.push({
            ...base,
            is_required: true,
            removed: false,
            activation_reason: 'Sugestão principal para o seu perfil',
          })
        } else {
          protocolItems.push({
            ...base,
            is_required: false,
            removed: true,
            activation_reason: 'Disponível — adicione se quiser',
          })
        }
      }

      const allergicNames = ALLERGY_SUPPLEMENTS.filter((s) =>
        form.allergic_supplement_slugs.includes(s.slug),
      ).map((s) => s.name)
      const allergiesText =
        allergicNames.length > 0
          ? `Paciente indicou alergia a algum ingrediente das fórmulas: ${allergicNames.join(', ')}.`
          : null
      const triagemData = {
        ...answers,
        full_name: form.full_name.trim(),
        allergies: allergiesText,
      }

      sessionStorage.setItem('protocol_items', JSON.stringify(protocolItems))
      sessionStorage.setItem('triagem_data', JSON.stringify(triagemData))
      sessionStorage.setItem('triage_session_token', sessionData.token as string)
      sessionStorage.setItem('checkout_source', 'full_quiz')
      sessionStorage.removeItem('quiz_data')
      sessionStorage.removeItem('mini_quiz_data')
      sessionStorage.removeItem('protocol_id')
      sessionStorage.removeItem('cart_locked_plan')
      sessionStorage.removeItem('selected_plan')

      router.push('/recomendacoes/carregando')
    } catch {
      toast.error('Erro ao processar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Tela de bloqueio (menor de 18)
  if (blockReason) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
        <header className="px-6 pt-5 pb-4">
          <div className="max-w-lg mx-auto">
            <Image
              src="/logo-azul.png"
              alt="Desafio Diabetes"
              width={455}
              height={355}
              className="h-7 w-auto"
            />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-amber-200 shadow-sm p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  stroke="#b45309"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="font-display text-2xl text-[#13244f]">
              Não foi possível continuar
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              {blockReason}
            </p>
            <Link
              href="/suplementos"
              className="inline-flex mt-2 bg-[#13244f] text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-[#0d1a3a] transition"
            >
              Voltar ao início
            </Link>
          </div>
        </main>
      </div>
    )
  }

  function renderStep() {
    switch (step) {
      case 'nome':
        return (
          <QuestionWrapper
            category="DADOS BÁSICOS"
            title="Qual é o seu nome completo?"
            showContinue
            continueDisabled={form.full_name.trim().length < 3}
          
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
            onContinue={goNext}
          >
            <input
              type="text"
              value={form.full_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, full_name: e.target.value }))
              }
              placeholder="Seu nome completo"
              className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
            />
          </QuestionWrapper>
        )

      case 'idade': {
        const ageNum = Number.parseInt(form.age, 10)
        const ageValid = Number.isFinite(ageNum) && ageNum >= 1 && ageNum <= 120

        return (
          <QuestionWrapper
            category="DADOS BÁSICOS"
            title="Qual é a sua idade?"
            showContinue
            continueDisabled={!ageValid}
          
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
            onContinue={goNext}
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={form.age}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, '')
                setForm((prev) => ({ ...prev, age: raw }))
              }}
              placeholder="Ex.: 45"
              className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm md:text-base bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
            />
            <p className="text-xs text-gray-500 mt-2">
              Informe apenas o número (anos completos).
            </p>
          </QuestionWrapper>
        )
      }

      case 'sexo':
        return (
          <QuestionWrapper category="DADOS BÁSICOS" title="Qual é o seu sexo?"
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
          >
            {(
              [
                { value: 'homem' as Sex, label: 'Homem' },
                { value: 'mulher' as Sex, label: 'Mulher' },
              ] as const
            ).map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={form.sex === opt.value}
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    sex: opt.value,
                    is_pregnant_or_breastfeeding:
                      opt.value === 'homem'
                        ? false
                        : prev.is_pregnant_or_breastfeeding,
                  }))
                  setTimeout(goNext, 120)
                }}
              />
            ))}
          </QuestionWrapper>
        )

      case 'gestacao':
        return (
          <QuestionWrapper
            category="DADOS BÁSICOS"
            title="Está grávida ou amamentando?"
          
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
          >
            {[
              { value: true, label: 'Sim' },
              { value: false, label: 'Não' },
            ].map((opt) => (
              <OptionButton
                key={String(opt.value)}
                label={opt.label}
                selected={form.is_pregnant_or_breastfeeding === opt.value}
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    is_pregnant_or_breastfeeding: opt.value,
                  }))
                  setTimeout(goNext, 120)
                }}
              />
            ))}
          </QuestionWrapper>
        )

      case 'renal':
        return (
          <QuestionWrapper
            category="SAÚDE"
            title="Você tem alguma condição renal?"
            subtitle="Pode marcar mais de uma, ou nenhuma"
            showContinue
            continueDisabled={
              !form.renal_none && form.renal_conditions.length === 0
            }
          
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
            onContinue={goNext}
          >
            {RENAL_OPTIONS.map((opt) => (
              <CheckOption
                key={opt.value}
                label={opt.label}
                selected={form.renal_conditions.includes(opt.value)}
                onClick={() => toggleRenal(opt.value)}
              />
            ))}
            <CheckOption
              label="Nenhuma das anteriores"
              selected={form.renal_none}
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  renal_none: true,
                  renal_conditions: [],
                }))
                setTimeout(goNext, 120)
              }}
            />
          </QuestionWrapper>
        )

      case 'hepatica':
        return (
          <QuestionWrapper
            category="SAÚDE"
            title="Você tem alguma condição hepática?"
            subtitle="Pode marcar mais de uma, ou nenhuma"
            showContinue
            continueDisabled={
              !form.hepatic_none && form.hepatic_conditions.length === 0
            }
          
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
            onContinue={goNext}
          >
            {HEPATIC_OPTIONS.map((opt) => (
              <CheckOption
                key={opt.value}
                label={opt.label}
                selected={form.hepatic_conditions.includes(opt.value)}
                onClick={() => toggleHepatic(opt.value)}
              />
            ))}
            <CheckOption
              label="Nenhuma das anteriores"
              selected={form.hepatic_none}
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  hepatic_none: true,
                  hepatic_conditions: [],
                }))
                setTimeout(goNext, 120)
              }}
            />
          </QuestionWrapper>
        )

      case 'diabetes':
        return (
          <QuestionWrapper
            category="DIABETES"
            title="Qual é o seu tipo de diabetes?"
          
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
          >
            {DIAGNOSIS_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={form.diagnosis_type === opt.value}
                onClick={() => {
                  setForm((prev) => ({ ...prev, diagnosis_type: opt.value }))
                  setTimeout(goNext, 120)
                }}
              />
            ))}
          </QuestionWrapper>
        )

      case 'medicamentos':
        return (
          <QuestionWrapper
            category="MEDICAMENTOS"
            title="Você utiliza algum destes medicamentos?"
            subtitle="Selecione todos que se aplicam — a resposta é só informativa"
            showContinue
            continueDisabled={
              !form.medications_none && form.medications.length === 0
            }
            onContinue={goNext}
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
          >
            {MEDICATION_OPTIONS.map((opt) => (
              <CheckOption
                key={opt.value}
                label={opt.label}
                selected={form.medications.includes(opt.value)}
                onClick={() => toggleMedication(opt.value)}
              />
            ))}
            <CheckOption
              label="Não utilizo nenhum medicamento"
              selected={form.medications_none}
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  medications_none: true,
                  medications: [],
                }))
                setTimeout(goNext, 120)
              }}
            />
          </QuestionWrapper>
        )

      case 'alergias':
        return (
          <QuestionWrapper
            category="ALERGIAS"
            title="Você tem alergia a algum ingrediente?"
            subtitle="Confira a composição de cada fórmula e marque as que têm algum ingrediente ao qual você é alérgico. Opcional — deixe tudo desmarcado se não tiver alergias."
            showContinue
            onContinue={finishTriage}
            onBack={goBack}
            stepIndex={stepIndex}
            loading={loading}
          >
            <div className="space-y-2">
              {ALLERGY_SUPPLEMENTS.map((supp, idx) => {
                const selected = form.allergic_supplement_slugs.includes(
                  supp.slug,
                )
                return (
                  <button
                    key={supp.slug}
                    type="button"
                    onClick={() => toggleAllergicSupplement(supp.slug)}
                    aria-pressed={selected}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                      selected
                        ? 'border-[#13244f] bg-[#13244f]/5'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                          selected
                            ? 'border-[#13244f] bg-[#13244f]'
                            : 'border-gray-300'
                        }`}
                      >
                        {selected && (
                          <svg
                            width="10"
                            height="8"
                            viewBox="0 0 10 8"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M1 4l2.5 2.5L9 1"
                              stroke="white"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <p
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          selected ? 'text-[#13244f]' : 'text-[#13244f]/50'
                        }`}
                      >
                        Fórmula {idx + 1} — tenho alergia a algum ingrediente
                      </p>
                    </div>
                    <ul className="space-y-1 pl-7">
                      {supp.composition.map((c) => (
                        <li
                          key={`${supp.slug}-${c.ativo}`}
                          className="text-sm text-gray-700 leading-relaxed"
                        >
                          {c.ativo}
                          {c.dose ? ` — ${c.dose}` : ''}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          </QuestionWrapper>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      <header className="px-6 pt-5 pb-2">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Image
            src="/logo-azul.png"
            alt="Desafio Diabetes"
            width={455}
            height={355}
            className="h-7 w-auto"
          />
          <span className="text-xs text-[#13244f]/50 font-medium">
            {stepIndex + 1} / {steps.length}
          </span>
        </div>
        <div className="max-w-lg mx-auto mt-4 h-1.5 bg-[#13244f]/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#f4001e] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-lg mx-auto">{renderStep()}</div>
      </main>
    </div>
  )
}
