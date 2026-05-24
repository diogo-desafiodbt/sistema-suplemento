import { z } from 'zod'

export const quizSchema = z.object({
  diagnosis_type: z.enum(['type2', 'prediabetes', 'undiagnosed']),
  years_diagnosed: z.enum(['<1ano', '1-5anos', '5-10anos', '>10anos']),
  hba1c_range: z.enum(['<7', '7-9', '>9', 'nao_sei']).nullable(),
  fasting_glucose: z.enum(['<100', '100-125', '126-199', '>200', 'nao_sei']).nullable(),
  medications: z.array(z.string()).default([]),
  family_history: z.array(z.string()).default([]),
  symptoms: z.array(z.string()).default([]),
  conditions_mild: z.array(z.string()).default([]),
  conditions_serious: z.array(z.string()).default([]),
  weight_status: z.enum(['saudavel', 'sobrepeso', 'obesidade', 'abaixo']).nullable(),
  exercise_freq: z.enum(['nenhum', '1-2x', '3-4x', '5x+']).nullable(),
  diet_quality: z.enum(['low_carb', 'tenta', 'sem_restricao', 'dificuldade']).nullable(),
  allergies: z.string().nullable(),
  prior_treatment: z.array(z.string()).default([]),
  plan_type: z.enum(['1mes', '3meses', '1ano']).default('1mes'),
})

export type QuizFormData = z.infer<typeof quizSchema>
