import { PharmacyOrder } from '@/types/pharmacy'

export async function sendToPharmacy(json: PharmacyOrder): Promise<void> {
  const url = process.env.PHARMACY_API_URL

  if (!url) {
    console.log('[pharmacy-order] JSON gerado:', JSON.stringify(json, null, 2))
    return
  }

  const apiKey = process.env.PHARMACY_API_KEY ?? ''
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify(json),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Farmácia API respondeu ${response.status}: ${body}`)
  }
}
