import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePrescriptionPdf } from '@/lib/pdf/generator'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'professional' && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { protocol_id } = await request.json()
    if (!protocol_id) {
      return NextResponse.json({ error: 'protocol_id obrigatório' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: protocol, error } = await admin
      .from('protocols')
      .select(`
        *,
        users ( full_name, email, client_code ),
        quiz_responses ( diagnosis_type, years_diagnosed, medications ),
        protocol_items (
          id, is_required, removed_by_patient, activation_reason,
          products ( name )
        )
      `)
      .eq('id', protocol_id)
      .eq('status', 'pending_signature')
      .single()

    if (error || !protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado ou já assinado' }, { status: 404 })
    }

    const { data: professional } = await admin
      .from('professionals')
      .select(`
        id, crm, crm_state, specialty,
        users ( full_name )
      `)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!professional) {
      return NextResponse.json({ error: 'Registro de profissional não encontrado' }, { status: 400 })
    }

    const activeItems = (protocol.protocol_items as Array<{
      removed_by_patient: boolean
      is_required: boolean
      activation_reason: string | null
      products: { name: string } | null
    }>).filter(item => !item.removed_by_patient)

    const patient = protocol.users as unknown as { full_name: string; email: string; client_code: string }
    const professionalUser = professional.users as unknown as { full_name: string } | null
    const quiz = protocol.quiz_responses as unknown as {
      diagnosis_type: string
      years_diagnosed: string
      medications: string[]
    }

    const signedAt = new Date().toISOString()

    const { buffer, hash } = await generatePrescriptionPdf({
      patient,
      professional: {
        full_name: professionalUser?.full_name ?? 'Médico',
        crm: professional.crm,
        crm_state: professional.crm_state,
        specialty: professional.specialty,
      },
      protocol: {
        id: protocol.id,
        signed_at: signedAt,
      },
      items: activeItems.map(item => ({
        name: item.products?.name ?? '',
        activation_reason: item.activation_reason ?? '',
        is_required: item.is_required,
      })),
      quiz,
    })

    const fileName = `${protocol_id}.pdf`
    const { error: uploadError } = await admin.storage
      .from('prescricoes')
      .upload(fileName, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Erro ao salvar PDF' }, { status: 500 })
    }

    const { data: signedUrl } = await admin.storage
      .from('prescricoes')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365)

    const pdfUrl = signedUrl?.signedUrl ?? ''

    const { error: updateError } = await admin
      .from('protocols')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_by: professional.id,
        prescription_pdf_url: pdfUrl,
      })
      .eq('id', protocol_id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Erro ao atualizar protocolo' }, { status: 500 })
    }

    const { error: auditError } = await admin.from('prescription_audit_logs').insert({
      protocol_id,
      professional_id: professional.id,
      action: 'signed',
      signed_at: signedAt,
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
      user_agent: request.headers.get('user-agent') ?? 'unknown',
      pdf_url: pdfUrl,
      pdf_hash: hash,
      payload_snapshot: protocol,
    })

    if (auditError) {
      console.error('Audit error:', auditError)
      return NextResponse.json({ error: 'Erro ao registrar auditoria' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, pdf_url: pdfUrl })
  } catch (error) {
    console.error('Assinar error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
