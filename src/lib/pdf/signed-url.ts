import type { SupabaseClient } from '@supabase/supabase-js'

/** Validade da URL assinada do PDF, em segundos. */
export const PDF_URL_TTL_SEGUNDOS = 2 * 60 * 60 // 2 horas

const PRESCRIPTION_BUCKET = 'prescricoes'

export async function createPrescriptionPdfSignedUrl(
  admin: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  const objectPath = path?.trim()
  if (!objectPath) return null

  const { data, error } = await admin.storage
    .from(PRESCRIPTION_BUCKET)
    .createSignedUrl(objectPath, PDF_URL_TTL_SEGUNDOS)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export function injectPrescriptionPdfUrl(
  pharmacyJson: unknown,
  signedUrl: string | null,
): unknown {
  if (
    !pharmacyJson ||
    typeof pharmacyJson !== 'object' ||
    Array.isArray(pharmacyJson)
  ) {
    return pharmacyJson
  }

  return {
    ...pharmacyJson,
    Observacoes: signedUrl ?? '',
  }
}
