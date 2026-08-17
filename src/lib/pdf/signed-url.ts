import { urlAssinadaPdf } from '@/lib/s3/prescricoes'

/** Validade da URL assinada do PDF, em segundos. */
export const PDF_URL_TTL_SEGUNDOS = 2 * 60 * 60 // 2 horas

export async function createPrescriptionPdfSignedUrl(
  path: string | null | undefined,
): Promise<string | null> {
  const objectPath = path?.trim()
  if (!objectPath) return null
  return urlAssinadaPdf(objectPath, PDF_URL_TTL_SEGUNDOS)
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
