import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AssinarButton } from './AssinarButton'
import { Badge } from '@/components/ui/badge'

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/profissional/fila" className="text-sm text-gray-500 hover:text-gray-700">
            ← Voltar para fila
          </a>
        </div>
        <Badge className={
          protocolData.status === 'signed'
            ? 'bg-green-100 text-green-700 border-0'
            : 'bg-amber-100 text-amber-700 border-0'
        }>
          {protocolData.status === 'signed' ? 'Assinada' : 'Pendente'}
        </Badge>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-lg">Dados do paciente</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Nome</p>
              <p className="font-medium">{patient?.full_name}</p>
            </div>
            <div>
              <p className="text-gray-500">Email</p>
              <p className="font-medium">{patient?.email}</p>
            </div>
            <div>
              <p className="text-gray-500">Código do cliente</p>
              <p className="font-medium">{patient?.client_code}</p>
            </div>
            <div>
              <p className="text-gray-500">Protocolo gerado em</p>
              <p className="font-medium">
                {new Date(protocolData.generated_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-lg">Perfil clínico</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Diagnóstico</p>
              <p className="font-medium">{diagnosisLabel[quiz?.diagnosis_type ?? ''] ?? '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Tempo de diagnóstico</p>
              <p className="font-medium">{quiz?.years_diagnosed ?? '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">HbA1c</p>
              <p className="font-medium">{quiz?.hba1c_range ?? 'Não informado'}</p>
            </div>
            <div>
              <p className="text-gray-500">Glicemia em jejum</p>
              <p className="font-medium">{quiz?.fasting_glucose ?? 'Não informado'}</p>
            </div>
            <div>
              <p className="text-gray-500">Medicamentos</p>
              <p className="font-medium">
                {quiz?.medications && quiz.medications.length > 0 ? quiz.medications.join(', ') : 'Nenhum'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Sintomas</p>
              <p className="font-medium">
                {quiz?.symptoms && quiz.symptoms.length > 0 ? quiz.symptoms.join(', ') : 'Nenhum'}
              </p>
            </div>
            {quiz?.conditions_serious && quiz.conditions_serious.length > 0 && (
              <div className="col-span-2">
                <p className="text-gray-500">Condições sérias</p>
                <p className="font-medium text-red-600">{quiz.conditions_serious.join(', ')}</p>
              </div>
            )}
            {quiz?.allergies && quiz.allergies !== 'nao' && quiz.allergies !== 'nao_sei' && (
              <div className="col-span-2">
                <p className="text-gray-500">Alergias</p>
                <p className="font-medium text-amber-600">{quiz.allergies}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-lg">Protocolo prescrito</h2>
          <div className="space-y-3">
            {activeItems?.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{item.products?.name}</span>
                    {item.is_required && (
                      <Badge variant="secondary" className="text-xs">Principal</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{item.activation_reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {protocolData.status === 'pending_signature' && (
          <AssinarButton protocolId={id} />
        )}

        {protocolData.status === 'signed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center text-green-700 text-sm font-medium">
            ✓ Prescrição assinada
          </div>
        )}
      </main>
    </div>
  )
}
