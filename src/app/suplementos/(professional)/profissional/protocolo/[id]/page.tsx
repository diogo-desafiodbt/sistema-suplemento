import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import imgLogoBranca from '@/../public/logo-branca.png'
import { registrarLeitura } from '@/lib/auditoria/leitura'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import {
  calcAge,
  DIAGNOSIS_LABELS,
  HEPATIC_LABELS,
  RENAL_LABELS,
} from '@/lib/protocol/triage'
import { sessaoAtual } from '@/lib/auth/sessao'
import { AssinarButton } from './AssinarButton'

type ProtocolItem = {
  id: string
  is_required: boolean
  removed_by_patient: boolean
  activation_reason: string | null
  products: { name: string } | null
}

type QuizResponse = {
  age: number | null
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
  const sessao = await sessaoAtual()

  if (!sessao) redirect('/suplementos/login')

  const profile = await getUserProfile(sessao.userId)

  if (profile?.role !== 'professional' && profile?.role !== 'admin') {
    redirect('/suplementos/dashboard')
  }

  // Esta é a tela que lê o quadro clínico inteiro — quiz, condições,
  // medicações, alergias. É a leitura mais sensível do sistema, e a que mais
  // importa ter registrada.
  registrarLeitura({
    quem: sessao.userId,
    papel: profile.role,
    oQue: 'protocolo',
    alvo: id,
  })

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    notFound()
  }

  const isAdmin = profile?.role === 'admin'
  const sql = getSql()

  // Autorização na própria consulta: profissional só vê fila aberta ou o
  // que ele assinou. Admin vê qualquer um. Inexistente e sem permissão
  // devolvem o mesmo 404.
  const rows = await sql<ProtocolDetail[]>`
    SELECT
      p.id,
      p.status,
      p.generated_at,
      p.source,
      CASE
        WHEN u.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'full_name', u.full_name,
          'email', u.email,
          'client_code', u.client_code
        )
      END AS users,
      CASE
        WHEN q.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'age', q.age,
          'birth_date', q.birth_date,
          'sex', q.sex,
          'is_pregnant_or_breastfeeding', q.is_pregnant_or_breastfeeding,
          'renal_conditions', q.renal_conditions,
          'hepatic_conditions', q.hepatic_conditions,
          'diagnosis_type', q.diagnosis_type,
          'medications', q.medications,
          'years_diagnosed', q.years_diagnosed,
          'allergies', q.allergies,
          'conditions_serious', q.conditions_serious,
          'hba1c_range', q.hba1c_range,
          'fasting_glucose', q.fasting_glucose,
          'symptoms', q.symptoms
        )
      END AS quiz_responses,
      COALESCE(items.items, '[]'::jsonb) AS protocol_items
    FROM protocols p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN quiz_responses q ON q.id = p.quiz_response_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pi.id,
          'is_required', pi.is_required,
          'removed_by_patient', pi.removed_by_patient,
          'activation_reason', pi.activation_reason,
          'products', CASE
            WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', pr.name)
          END
        )
        ORDER BY pi.id
      ) AS items
      FROM protocol_items pi
      LEFT JOIN products pr ON pr.id = pi.product_id
      WHERE pi.protocol_id = p.id
    ) items ON true
    WHERE p.id = ${id}::uuid
      AND (
        ${isAdmin}::boolean
        OR p.status = 'pending_signature'
        OR p.signed_by = (
          SELECT pf.id FROM professionals pf WHERE pf.user_id = ${sessao.userId}::uuid
        )
      )
    LIMIT 1
  `

  const protocolData = rows[0] ?? null
  if (!protocolData) notFound()
  const activeItems = protocolData.protocol_items?.filter(
    (item) => !item.removed_by_patient,
  )

  const quiz = protocolData.quiz_responses
  const patient = protocolData.users
  const isLegacyQuiz = quiz?.age == null && !quiz?.birth_date

  const ageFromBirth =
    quiz?.birth_date && !Number.isNaN(new Date(quiz.birth_date).getTime())
      ? calcAge(quiz.birth_date)
      : null
  const informedAge =
    typeof quiz?.age === 'number' && Number.isFinite(quiz.age) ? quiz.age : null

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
              href="/suplementos/profissional/fila"
              className="text-white/60 hover:text-white text-sm transition"
            >
              ← Voltar
            </Link>
            <Image
              src={imgLogoBranca}
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
                  {informedAge != null ? 'Idade informada' : 'Idade'}
                </p>
                <p className="font-semibold text-[#13244f]">
                  {informedAge != null
                    ? `${informedAge} anos`
                    : ageFromBirth != null
                      ? `${ageFromBirth} anos`
                      : '—'}
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
