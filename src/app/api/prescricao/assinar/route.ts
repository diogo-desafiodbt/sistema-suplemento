import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePrescriptionPdf } from '@/lib/pdf/generator'
import { sendToPharmacyWithPdf } from '@/lib/pharmacy/sender'
import type { PharmacyOrder } from '@/types/pharmacy'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

    const { data: linkedSubscription } = await admin
      .from('subscriptions')
      .select('id')
      .eq('protocol_id', protocol_id)
      .maybeSingle()

    if (linkedSubscription) {
      const { data: pendingOrder } = await admin
        .from('orders')
        .select('id, pharmacy_json')
        .eq('subscription_id', linkedSubscription.id)
        .is('pharmacy_sent_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pendingOrder?.pharmacy_json) {
        try {
          await sendToPharmacyWithPdf(
            pendingOrder.pharmacy_json as PharmacyOrder,
            buffer
          )
          await admin
            .from('orders')
            .update({
              status: 'sent_to_pharmacy',
              pharmacy_sent_at: new Date().toISOString(),
            })
            .eq('id', pendingOrder.id)
        } catch (pharmError) {
          console.error('Erro ao enviar prescrição para farmácia:', pharmError)
        }
      }
    }

    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey && patient.email) {
      try {
        const resend = new Resend(resendApiKey)
        const firstName = escapeHtml(patient.full_name?.split(' ')[0] ?? 'Olá')
        const doctorName = escapeHtml(professionalUser?.full_name ?? 'nossa equipe médica')

        await resend.emails.send({
          from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
          to: patient.email,
          subject: 'Boas notícias — seu tratamento foi aprovado',
          html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f0eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0eb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;border:1px solid #f0f0f0;overflow:hidden;">
          <tr>
            <td style="background-color:#13244f;padding:28px 32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.02em;">Desafio Diabetes</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#13244f;font-size:16px;line-height:1.6;">Olá, <strong>${firstName}</strong>,</p>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
                Temos uma ótima notícia para você: um profissional de saúde da nossa equipe revisou seu caso e <strong style="color:#13244f;">aprovou seu tratamento personalizado</strong>.
              </p>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
                Isso significa que seus suplementos já estão sendo preparados com todo o cuidado, para seguirem em direção à sua casa em breve.
              </p>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;">
                Você não precisa fazer nada agora — assim que houver novidades sobre o envio, avisaremos você por aqui. Estamos com você em cada passo dessa jornada.
              </p>
              <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;line-height:1.6;">
                Com carinho,
              </p>
              <p style="margin:0;color:#13244f;font-size:14px;font-weight:600;">
                ${doctorName}<br>
                <span style="font-weight:400;color:#6b7280;">Equipe Desafio Diabetes</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #f0f0f0;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center;">
                Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `.trim(),
        })
      } catch (emailError) {
        console.error('Erro ao enviar email de aprovação ao paciente:', emailError)
      }
    }

    return NextResponse.json({ ok: true, pdf_url: pdfUrl })
  } catch (error) {
    console.error('Assinar error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
