import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import {
  calcAge,
  DIAGNOSIS_LABELS,
  RENAL_LABELS,
  HEPATIC_LABELS,
} from '@/lib/protocol/triage'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 24,
    borderBottom: '1px solid #e5e5e5',
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 160,
    color: '#666',
  },
  value: {
    flex: 1,
    fontFamily: 'Helvetica-Bold',
  },
  productItem: {
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
  },
  productName: {
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  productDesc: {
    fontSize: 10,
    color: '#666',
  },
  footer: {
    marginTop: 40,
    borderTop: '1px solid #e5e5e5',
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    alignItems: 'center',
  },
  signatureLine: {
    width: 200,
    borderBottom: '1px solid #1a1a1a',
    marginBottom: 4,
  },
  signatureText: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  stamp: {
    fontSize: 10,
    color: '#666',
  },
})

type PrescriptionData = {
  patient: {
    full_name: string
    email: string
    client_code: string
  }
  professional: {
    full_name: string
    crm: string
    crm_state: string
    specialty: string
  }
  protocol: {
    id: string
    signed_at: string
  }
  items: Array<{
    name: string
    activation_reason: string
    is_required: boolean
  }>
  quiz: {
    diagnosis_type: string
    birth_date?: string | null
    sex?: string | null
    is_pregnant_or_breastfeeding?: boolean | null
    renal_conditions?: string[] | null
    hepatic_conditions?: string[] | null
    medications: string[]
    years_diagnosed?: string | null
    hba1c_range?: string | null
    allergies?: string | null
  }
}

export function PrescriptionDocument({ data }: { data: PrescriptionData }) {
  const isLegacyQuiz = !data.quiz.birth_date
  const age =
    data.quiz.birth_date && !Number.isNaN(new Date(data.quiz.birth_date).getTime())
      ? calcAge(data.quiz.birth_date)
      : null
  const renal = data.quiz.renal_conditions ?? []
  const hepatic = data.quiz.hepatic_conditions ?? []
  const sexLabel =
    data.quiz.sex === 'mulher' ? 'Mulher' : data.quiz.sex === 'homem' ? 'Homem' : '—'

  const legacyYearsLabel = data.quiz.allergies?.startsWith('idade:')
    ? `Não informado (idade: ${data.quiz.allergies.replace('idade:', '')} anos)`
    : (data.quiz.years_diagnosed ?? '—')

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        <View style={styles.header}>
          <Text style={styles.title}>Desafio Diabetes</Text>
          <Text style={styles.subtitle}>Prescrição Médica — Protocolo de Suplementação</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados do Paciente</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome:</Text>
            <Text style={styles.value}>{data.patient.full_name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Código do cliente:</Text>
            <Text style={styles.value}>{data.patient.client_code}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Diagnóstico:</Text>
            <Text style={styles.value}>{DIAGNOSIS_LABELS[data.quiz.diagnosis_type] ?? data.quiz.diagnosis_type}</Text>
          </View>
          {isLegacyQuiz ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Tempo de diagnóstico:</Text>
                <Text style={styles.value}>{legacyYearsLabel}</Text>
              </View>
              {data.quiz.hba1c_range ? (
                <View style={styles.row}>
                  <Text style={styles.label}>HbA1c:</Text>
                  <Text style={styles.value}>{data.quiz.hba1c_range}</Text>
                </View>
              ) : null}
              {data.quiz.allergies &&
              data.quiz.allergies !== 'nao' &&
              data.quiz.allergies !== 'nao_sei' &&
              !data.quiz.allergies.startsWith('idade:') ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Alergias:</Text>
                  <Text style={styles.value}>{data.quiz.allergies}</Text>
                </View>
              ) : null}
              {data.quiz.medications?.length > 0 &&
              !data.quiz.allergies?.startsWith('idade:') ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Medicamentos em uso:</Text>
                  <Text style={styles.value}>{data.quiz.medications.join(', ')}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Idade:</Text>
                <Text style={styles.value}>{age != null ? `${age} anos` : '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Sexo:</Text>
                <Text style={styles.value}>{sexLabel}</Text>
              </View>
              {data.quiz.sex === 'mulher' ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Gravidez/amamentação:</Text>
                  <Text style={styles.value}>
                    {data.quiz.is_pregnant_or_breastfeeding ? 'Sim' : 'Não'}
                  </Text>
                </View>
              ) : null}
              {renal.length > 0 ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Condições renais:</Text>
                  <Text style={styles.value}>
                    {renal.map((c) => RENAL_LABELS[c] ?? c).join(', ')}
                  </Text>
                </View>
              ) : null}
              {hepatic.length > 0 ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Condições hepáticas:</Text>
                  <Text style={styles.value}>
                    {hepatic.map((c) => HEPATIC_LABELS[c] ?? c).join(', ')}
                  </Text>
                </View>
              ) : null}
              {data.quiz.medications?.length > 0 ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Medicamentos em uso:</Text>
                  <Text style={styles.value}>{data.quiz.medications.join(', ')}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Protocolo Prescrito</Text>
          {data.items.map((item, index) => (
            <View key={index} style={styles.productItem}>
              <Text style={styles.productName}>
                {item.name}{item.is_required ? ' (Tratamento principal)' : ' (Complementar)'}
              </Text>
              <Text style={styles.productDesc}>{item.activation_reason}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Data de emissão:</Text>
            <Text style={styles.value}>
              {new Date(data.protocol.signed_at).toLocaleDateString('pt-BR')}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Número do protocolo:</Text>
            <Text style={styles.value}>{data.protocol.id}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureText}>{data.professional.full_name}</Text>
            <Text style={styles.signatureText}>
              CRM {data.professional.crm}/{data.professional.crm_state}
            </Text>
            <Text style={styles.signatureText}>{data.professional.specialty}</Text>
          </View>
          <View style={styles.stamp}>
            <Text>Documento gerado digitalmente</Text>
            <Text>Desafio Diabetes — CNPJ 63.862.444/0001-56</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
