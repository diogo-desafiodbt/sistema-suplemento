import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AssinarButton } from './AssinarButton'

type ProtocolItem = {
  id: string
  is_required: boolean
  removed_by_patient: boolean
  activation_reason: string | null
  products: { name: string } | null
}

type QuizResponse = {
  diagnosis_type: string
  years_diagnosed: string
  hba1c_range: string
  fasting_glucose: string
  medications: string[]
  symptoms: string[]
  conditions_mild: string[]
  conditions_serious: string[]
  weight_status: string
  exercise_freq: string
  diet_quality: string
  allergies: string | null
}

type Patient = {
  full_name: string
  email: string
  client_code: string
  birth_date: string | null
}

type ProtocolDetail = {
  id: string
  status: string
  generated_at: string
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
  const { data: { user } } = await supabase.auth.getUser()

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
      users (
        full_name,
        email,
        client_code,
        birth_date
      ),
      quiz_responses (
        diagnosis_type,
        years_diagnosed,
        hba1c_range,
        fasting_glucose,
        medications,
        symptoms,
        conditions_mild,
        conditions_serious,
        weight_status,
        exercise_freq,
        diet_quality,
        allergies
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
    item => !item.removed_by_patient
  )

  const quiz = protocolData.quiz_responses
  const patient = protocolData.users

  const diagnosisLabel: Record<string, string> = {
    type2: 'Diabetes tipo 2',
    prediabetes: 'Pré-diabetes',
    undiagnosed: 'Não diagnosticado / histórico familiar',
  }

  const statusBadge = protocolData.status === 'signed'
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700'

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-[#13244f] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/profissional/fila" className="text-white/60 hover:text-white text-sm transition">
              ← Voltar
            </Link>
            <img src="/logo-branca.png" alt="Desafio Diabetes" className="h-6 w-auto" />
          </div>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="text-sm text-white/60 hover:text-white transition">Sair</button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Revisão clínica</p>
            <h1 className="text-2xl font-bold text-[#13244f]">{patient?.full_name}</h1>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${statusBadge}`}>
            {protocolData.status === 'signed' ? 'Assinada' : 'Pendente'}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-[#13244f]">Dados do paciente</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Nome</p>
              <p className="font-semibold text-[#13244f]">{patient?.full_name}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Email</p>
              <p className="font-semibold text-[#13244f]">{patient?.email}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Código do cliente</p>
              <p className="font-semibold text-[#13244f] font-mono">{patient?.client_code}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Protocolo gerado em</p>
              <p className="font-semibold text-[#13244f]">
                {new Date(protocolData.generated_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-[#13244f]">Perfil clínico</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Diagnóstico</p>
              <p className="font-semibold text-[#13244f]">{diagnosisLabel[quiz?.diagnosis_type ?? ''] ?? '-'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Tempo de diagnóstico</p>
              <p className="font-semibold text-[#13244f]">{quiz?.years_diagnosed ?? '-'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">HbA1c</p>
              <p className="font-semibold text-[#13244f]">{quiz?.hba1c_range ?? 'Não informado'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Glicemia em jejum</p>
              <p className="font-semibold text-[#13244f]">{quiz?.fasting_glucose ?? 'Não informado'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Medicamentos</p>
              <p className="font-semibold text-[#13244f]">
                {quiz?.medications && quiz.medications.length > 0 ? quiz.medications.join(', ') : 'Nenhum'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Sintomas</p>
              <p className="font-semibold text-[#13244f]">
                {quiz?.symptoms && quiz.symptoms.length > 0 ? quiz.symptoms.join(', ') : 'Nenhum'}
              </p>
            </div>
            {quiz?.conditions_serious && quiz.conditions_serious.length > 0 && (
              <div className="col-span-2">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Condições sérias</p>
                <p className="font-semibold text-red-600">{quiz.conditions_serious.join(', ')}</p>
              </div>
            )}
            {quiz?.allergies && quiz.allergies !== 'nao' && quiz.allergies !== 'nao_sei' && (
              <div className="col-span-2">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Alergias</p>
                <p className="font-semibold text-amber-600">{quiz.allergies}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-[#13244f]">Protocolo prescrito</h2>
          <div className="space-y-3">
            {activeItems?.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-3 border-b border-gray-50 last:border-0 last:pb-0">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[#13244f]">{item.products?.name}</span>
                    {item.is_required && (
                      <span className="text-[10px] bg-[#13244f]/10 text-[#13244f] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Principal</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.activation_reason}</p>
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
