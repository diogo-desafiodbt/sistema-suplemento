import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql, withTransaction } from '@/lib/db'
import { generatePrescriptionPdf } from '@/lib/pdf/generator'
import { createPrescriptionPdfSignedUrl } from '@/lib/pdf/signed-url'
import { sendToPharmacyWithPdf } from '@/lib/pharmacy/sender'
import { enviarPdf } from '@/lib/s3/prescricoes'
import { createClient } from '@/lib/supabase/server'
import type { PharmacyOrder } from '@/types/pharmacy'

type ProtocolRow = {
  id: string
  protocol_items: Array<{
    removed_by_patient: boolean
    is_required: boolean
    activation_reason: string | null
    products: { name: string } | null
  }> | null
  users: {
    full_name: string
    email: string
    client_code: string
  } | null
  quiz_responses: {
    diagnosis_type: string
    age: number | null
    birth_date: string | null
    sex: string | null
    is_pregnant_or_breastfeeding: boolean | null
    renal_conditions: string[] | null
    hepatic_conditions: string[] | null
    medications: string[]
    years_diagnosed: string | null
    hba1c_range: string | null
    allergies: string | null
  } | null
  [key: string]: unknown
}

type ProfessionalRow = {
  id: string
  crm: string | null
  crm_state: string | null
  specialty: string | null
  users: { full_name: string } | null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const profile = await getUserProfile(user.id)

    if (profile?.role !== 'professional' && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { protocol_id } = await request.json()
    if (!protocol_id) {
      return NextResponse.json(
        { error: 'protocol_id obrigatório' },
        { status: 400 },
      )
    }

    const sql = getSql()

    const protocolRows = await sql<ProtocolRow[]>`
      SELECT p.*,
        CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
          'full_name', u.full_name, 'email', u.email, 'client_code', u.client_code) END AS users,
        CASE WHEN q.id IS NULL THEN NULL ELSE jsonb_build_object(
          'diagnosis_type', q.diagnosis_type, 'age', q.age, 'birth_date', q.birth_date,
          'sex', q.sex, 'is_pregnant_or_breastfeeding', q.is_pregnant_or_breastfeeding,
          'renal_conditions', q.renal_conditions, 'hepatic_conditions', q.hepatic_conditions,
          'medications', q.medications, 'years_diagnosed', q.years_diagnosed,
          'hba1c_range', q.hba1c_range, 'allergies', q.allergies) END AS quiz_responses,
        COALESCE(items.list, '[]'::jsonb) AS protocol_items
      FROM protocols p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN quiz_responses q ON q.id = p.quiz_response_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', pi.id, 'is_required', pi.is_required,
          'removed_by_patient', pi.removed_by_patient,
          'activation_reason', pi.activation_reason,
          'products', CASE WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', pr.name) END
        ) ORDER BY pi.id) AS list
        FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
        WHERE pi.protocol_id = p.id) items ON true
      WHERE p.id = ${protocol_id}::uuid AND p.status = 'pending_signature'
      LIMIT 1
    `

    const protocol = protocolRows[0]
    if (!protocol) {
      return NextResponse.json(
        { error: 'Protocolo não encontrado ou já assinado' },
        { status: 404 },
      )
    }

    const professionalRows = await sql<ProfessionalRow[]>`
      SELECT pf.id, pf.crm, pf.crm_state, pf.specialty,
        CASE WHEN u.id IS NULL THEN NULL
          ELSE jsonb_build_object('full_name', u.full_name) END AS users
      FROM professionals pf
      LEFT JOIN users u ON u.id = pf.user_id
      WHERE pf.user_id = ${user.id}::uuid
      LIMIT 1
    `

    const professional = professionalRows[0] ?? null
    if (!professional) {
      return NextResponse.json(
        { error: 'Registro de profissional não encontrado' },
        { status: 400 },
      )
    }

    const activeItems = (protocol.protocol_items ?? []).filter(
      (item) => !item.removed_by_patient,
    )

    const patient = protocol.users as {
      full_name: string
      email: string
      client_code: string
    }
    const professionalUser = professional.users
    const quiz = protocol.quiz_responses as {
      diagnosis_type: string
      age: number | null
      birth_date: string | null
      sex: string | null
      is_pregnant_or_breastfeeding: boolean | null
      renal_conditions: string[] | null
      hepatic_conditions: string[] | null
      medications: string[]
      years_diagnosed: string | null
      hba1c_range: string | null
      allergies: string | null
    }

    const signedAt = new Date().toISOString()

    const { buffer, hash } = await generatePrescriptionPdf({
      patient,
      professional: {
        full_name: professionalUser?.full_name ?? 'Médico',
        crm: professional.crm ?? '',
        crm_state: professional.crm_state ?? '',
        specialty: professional.specialty ?? '',
      },
      protocol: {
        id: protocol.id,
        signed_at: signedAt,
      },
      items: activeItems.map((item) => ({
        name: item.products?.name ?? '',
        activation_reason: item.activation_reason ?? '',
        is_required: item.is_required,
      })),
      quiz,
    })

    const fileName = `${protocol_id}.pdf`
    try {
      await enviarPdf(fileName, buffer)
    } catch (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Erro ao salvar PDF' }, { status: 500 })
    }

    const pdfUrl = (await createPrescriptionPdfSignedUrl(fileName)) ?? ''

    const ipAddress = request.headers.get('x-forwarded-for') ?? 'unknown'
    const userAgent = request.headers.get('user-agent') ?? 'unknown'

    try {
      await withTransaction(async (tx) => {
        await tx`
          UPDATE protocols
          SET
            status = 'signed',
            signed_at = ${signedAt},
            signed_by = ${professional.id}::uuid,
            prescription_pdf_path = ${fileName}
          WHERE id = ${protocol_id}::uuid
        `
        await tx`
          INSERT INTO prescription_audit_logs (
            protocol_id, professional_id, action, signed_at,
            ip_address, user_agent, pdf_url, pdf_hash, payload_snapshot
          ) VALUES (
            ${protocol_id}::uuid,
            ${professional.id}::uuid,
            'signed',
            ${signedAt},
            ${ipAddress},
            ${userAgent},
            ${null},
            ${hash},
            ${tx.json(protocol as never)}
          )
        `
      })
    } catch (writeError) {
      console.error('Assinar write error:', writeError)
      return NextResponse.json(
        { error: 'Erro ao gravar assinatura e auditoria' },
        { status: 500 },
      )
    }

    const linkedRows = await sql<{ id: string }[]>`
      SELECT id FROM subscriptions
      WHERE protocol_id = ${protocol_id}::uuid
      LIMIT 1
    `
    const linkedSubscription = linkedRows[0] ?? null

    if (linkedSubscription) {
      const pendingRows = await sql<
        { id: string; pharmacy_json: unknown }[]
      >`
        SELECT id, pharmacy_json FROM orders
        WHERE subscription_id = ${linkedSubscription.id}::uuid
          AND pharmacy_sent_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `
      const pendingOrder = pendingRows[0] ?? null

      if (pendingOrder?.pharmacy_json) {
        try {
          await sendToPharmacyWithPdf(
            pendingOrder.pharmacy_json as PharmacyOrder,
            buffer,
          )
          await sql`
            UPDATE orders
            SET
              status = 'sent_to_pharmacy',
              pharmacy_sent_at = ${new Date().toISOString()}
            WHERE id = ${pendingOrder.id}::uuid
          `
        } catch (pharmError) {
          console.error('Erro ao enviar prescrição para farmácia:', pharmError)
        }
      }
    }

    return NextResponse.json({ ok: true, pdf_url: pdfUrl })
  } catch (error) {
    console.error('Assinar error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
