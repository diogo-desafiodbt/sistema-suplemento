import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let client: S3Client | null = null

function getRegion(): string {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
  if (!region) {
    throw new Error(
      'AWS_REGION (ou AWS_DEFAULT_REGION) precisa estar definida.',
    )
  }
  return region
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET_PRESCRICOES
  if (!bucket) {
    throw new Error('S3_BUCKET_PRESCRICOES precisa estar definida.')
  }
  return bucket
}

function getS3(): S3Client {
  if (!client) {
    client = new S3Client({ region: getRegion() })
  }
  return client
}

export async function enviarPdf(chave: string, corpo: Buffer): Promise<void> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: chave,
      Body: corpo,
      ContentType: 'application/pdf',
    }),
  )
}

export async function baixarPdf(chave: string): Promise<Buffer | null> {
  try {
    const res = await getS3().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: chave,
      }),
    )
    const bytes = await res.Body?.transformToByteArray()
    if (!bytes) return null
    return Buffer.from(bytes)
  } catch {
    return null
  }
}

export async function urlAssinadaPdf(
  chave: string,
  segundos: number,
): Promise<string | null> {
  try {
    return await getSignedUrl(
      getS3(),
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: chave,
      }),
      { expiresIn: segundos },
    )
  } catch {
    return null
  }
}
