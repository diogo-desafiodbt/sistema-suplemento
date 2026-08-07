import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  calcAge,
  DIAGNOSIS_LABELS,
  HEPATIC_LABELS,
  RENAL_LABELS,
} from '@/lib/protocol/triage'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { AssinarButton } from './AssinarButton'

type ProtocolItem = {
  id: string
  is_required: boolean
  removed_by_patient: boolean
  activation_reason: string | null
  products: { name: string } | null
}

type QuizResponse = {
  birth_date: string | null
  sex: string | null
  is_pregnant_or_breastfeeding: boolean | null
  renal_conditions: string[] | null
  hepatic_conditions: string[] | null
  diagnosis_type: string
  medications: string[] | null
  years_diagnosed: string | null
  allergies: string | null
  conditions_serious: string[] | null
  hba1c_range: string | null
  fasting_glucose: string | null
  symptoms: string[] | null
}

type Patient = {
  full_name: string
  email: string
  client_code: string
}

type ProtocolDetail = {
  id: string
  status: string
  generated_at: string
  source: string | null
  users: Patient | null
  quiz_responses: QuizResponse | null
  protocol_items: ProtocolItem[]
}

export default async function ProtocoloPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'professional' && profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const admin = createAdminClient()

  const { data: protocol } = await admin
    .from('protocols')
    .select(`
      id,
      status,
      generated_at,
      source,
      users (
        full_name,
        email,
        client_code
      ),
      quiz_responses (
        birth_date,
        sex,
        is_pregnant_or_breastfeeding,
        renal_conditions,
        hepatic_conditions,
        diagnosis_type,
        medications,
        years_diagnosed,
        allergies,
        conditions_serious,
        hba1c_range,
        fasting_glucose,
        symptoms
      ),
      protocol_items (
        id,
        is_required,
        removed_by_patient,
        activation_reason,
        products (
          name
        )
      )
    `)
    .eq('id', id)
    .single()

  if (!protocol) redirect('/profissional/fila')

  const protocolData = protocol as unknown as ProtocolDetail
  const activeItems = protocolData.protocol_items?.filter(
    (item) => !item.removed_by_patient,
  )

  const quiz = protocolData.quiz_responses
  const patient = protocolData.users
  const isLegacyQuiz = !quiz?.birth_date

  const age =
    quiz?.birth_date && !Number.isNaN(new Date(quiz.birth_date).getTime())
      ? calcAge(quiz.birth_date)
      : null

  const renal = quiz?.renal_conditions ?? []
  const hepatic = quiz?.hepatic_conditions ?? []
  const pregnant = Boolean(quiz?.is_pregnant_or_breastfeeding)
  const showClinicalAlert =
    !isLegacyQuiz && (renal.length > 0 || hepatic.length > 0 || pregnant)

  const alertItems: string[] = []
  if (pregnant) alertItems.push('Gravidez ou amamentação')
  for (const c of renal) {
    alertItems.push(`Renal: ${RENAL_LABELS[c] ?? c}`)
  }
  for (const c of hepatic) {
    alertItems.push(`Hepática: ${HEPATIC_LABELS[c] ?? c}`)
  }

  const statusBadge =
    protocolData.status === 'signed'
      ? 'bg-green-100 text-green-700'
      : 'bg-amber-100 text-amber-700'

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-[#13244f] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/profissional/fila"
              className="text-white/60 hover:text-white text-sm transition"
            >
              ← Voltar
            </Link>
            <Image
              src="/logo-branca.png"
              alt="Desafio Diabetes"
              width={455}
              height={355}
              className="h-6 w-auto"
            />
          </div>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="text-sm text-white/60 hover:text-white transition"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
              Revisão clínica
            </p>
            <h1 className="text-2xl font-bold text-[#13244f]">
              {patient?.full_name}
            </h1>
            <span
              className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                protocolData.source === 'mini_quiz'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-violet-50 text-violet-700'
              }`}
            >
              {protocolData.source === 'mini_quiz'
                ? 'Compra direta (mini-questionário)'
                : 'Quiz completo'}
            </span>
          </div>
          <span
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${statusBadge}`}
          >
            {protocolData.status === 'signed' ? 'Assinada' : 'Pendente'}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-[#13244f]">Dados do paciente</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                Nome
              </p>
              <p className="font-semibold text-[#13244f]">
                {patient?.full_name}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                Email
              </p>
              <p className="font-semibold text-[#13244f]">{patient?.email}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                Código do cliente
              </p>
              <p className="font-semibold text-[#13244f] font-mono">
                {patient?.client_code}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                Protocolo gerado em
              </p>
              <p className="font-semibold text-[#13244f]">
                {new Date(protocolData.generated_at).toLocaleDateString(
                  'pt-BR',
                )}
              </p>
            </div>
          </div>
        </div>

        {showClinicalAlert && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-2">
            <p className="text-sm font-bold text-amber-900">
              Atenção clínica — condições que restringem produtos
            </p>
            <ul className="text-sm text-amber-900/90 list-disc pl-5 space-y-1">
              {alertItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-[#13244f]">
            {isLegacyQuiz ? 'Perfil clínico' : 'Perfil clínico (triagem)'}
          </h2>
          {isLegacyQuiz ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Diagnóstico
                </p>
                <p className="font-semibold text-[#13244f]">
                  {DIAGNOSIS_LABELS[quiz?.diagnosis_type ?? ''] ?? '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Tempo de diagnóstico
                </p>
                <p className="font-semibold text-[#13244f]">
                  {protocolData.source === 'mini_quiz'
                    ? quiz?.allergies?.startsWith('idade:')
                      ? `Não informado — idade ${quiz.allergies.replace('idade:', '')} anos`
                      : 'Não informado (compra direta)'
                    : (quiz?.years_diagnosed ?? '-')}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  HbA1c
                </p>
                <p className="font-semibold text-[#13244f]">
                  {quiz?.hba1c_range ?? 'Não informado'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Glicemia em jejum
                </p>
                <p className="font-semibold text-[#13244f]">
                  {quiz?.fasting_glucose ?? 'Não informado'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Medicamentos
                </p>
                <p className="font-semibold text-[#13244f]">
                  {quiz?.medications && quiz.medications.length > 0
                    ? quiz.medications.join(', ')
                    : 'Nenhum'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Sintomas
                </p>
                <p className="font-semibold text-[#13244f]">
                  {quiz?.symptoms && quiz.symptoms.length > 0
                    ? quiz.symptoms.join(', ')
                    : 'Nenhum'}
                </p>
              </div>
              {quiz?.conditions_serious &&
                quiz.conditions_serious.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                      Condições sérias
                    </p>
                    <p className="font-semibold text-red-600">
                      {quiz.conditions_serious.join(', ')}
                    </p>
                  </div>
                )}
              {quiz?.allergies &&
                quiz.allergies !== 'nao' &&
                quiz.allergies !== 'nao_sei' &&
                !quiz.allergies.startsWith('idade:') && (
                  <div className="col-span-2">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                      Alergias
                    </p>
                    <p className="font-semibold text-amber-600">
                      {quiz.allergies}
                    </p>
                  </div>
                )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Diagnóstico
                </p>
                <p className="font-semibold text-[#13244f]">
                  {DIAGNOSIS_LABELS[quiz?.diagnosis_type ?? ''] ?? '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Idade
                </p>
                <p className="font-semibold text-[#13244f]">
                  {age != null ? `${age} anos` : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Sexo
                </p>
                <p className="font-semibold text-[#13244f]">
                  {quiz?.sex === 'mulher'
                    ? 'Mulher'
                    : quiz?.sex === 'homem'
                      ? 'Homem'
                      : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Gravidez / amamentação
                </p>
                <p className="font-semibold text-[#13244f]">
                  {quiz?.sex === 'mulher' ? (pregnant ? 'Sim' : 'Não') : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Condições renais
                </p>
                <p className="font-semibold text-[#13244f]">
                  {renal.length > 0
                    ? renal.map((c) => RENAL_LABELS[c] ?? c).join(', ')
                    : 'Nenhuma'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Condições hepáticas
                </p>
                <p className="font-semibold text-[#13244f]">
                  {hepatic.length > 0
                    ? hepatic.map((c) => HEPATIC_LABELS[c] ?? c).join(', ')
                    : 'Nenhuma'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">
                  Medicamentos
                </p>
                <p className="font-semibold text-[#13244f]">
                  {quiz?.medications && quiz.medications.length > 0
                    ? quiz.medications.join(', ')
                    : 'Nenhum'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-[#13244f]">Protocolo prescrito</h2>
          <div className="space-y-3">
            {activeItems?.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 py-3 border-b border-gray-50 last:border-0 last:pb-0"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[#13244f]">
                      {item.products?.name}
                    </span>
                    {item.is_required && (
                      <span className="text-[10px] bg-[#13244f]/10 text-[#13244f] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    {item.activation_reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {protocolData.status === 'pending_signature' && (
          <AssinarButton protocolId={id} />
        )}

        {protocolData.status === 'signed' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center text-green-700 text-sm font-semibold">
            ✓ Prescrição assinada
          </div>
        )}
      </main>
    </div>
  )
}
