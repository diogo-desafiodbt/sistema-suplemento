import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import {
  createPrescriptionPdfSignedUrl,
  injectPrescriptionPdfUrl,
} from '@/lib/pdf/signed-url'
import { isFarmaciaAuthorized, parseDateRange } from '@/lib/pharmacy/pull-api'
import { getPdfEtiqueta } from '@/lib/shipping/envie-agora/etiqueta'

type OrderRow = {
  id: string
  created_at: string
  status: string
  pharmacy_json: unknown
  prescription_pdf_path: string | null
  shipping_label_url: string | null
  shipping_request_id: string | null
}

export async function GET(request: NextRequest) {
  if (!isFarmaciaAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const range = parseDateRange(request.nextUrl.searchParams)
    if (range.invalid) {
      return NextResponse.json({ error: range.invalid }, { status: 400 })
    }

    const sql = getSql()
    const gte = range.gte ?? null
    const lt = range.lt ?? null

    const orders = await sql<OrderRow[]>`
      SELECT o.id, to_jsonb(o.created_at) #>> '{}' AS created_at, o.status, o.pharmacy_json,
             p.prescription_pdf_path, o.shipping_label_url, o.shipping_request_id
      FROM orders o
      JOIN subscriptions s ON s.id = o.subscription_id
      JOIN protocols p ON p.id = s.protocol_id
      WHERE p.status = 'signed'
        AND o.pharmacy_json IS NOT NULL
        -- Só entra na lista o pedido que a farmácia consegue despachar: com a
        -- prescrição assinada E com os dois documentos prontos, o PDF da
        -- receita e a etiqueta. Entregar antes disso é oferecer trabalho que
        -- ela vai separar e não vai conseguir postar — e o pedido volta a
        -- ficar parado, agora com a culpa no lugar errado.
        AND p.prescription_pdf_path IS NOT NULL
        AND o.shipping_label_url IS NOT NULL
        AND (${gte}::timestamptz IS NULL OR o.created_at >= ${gte}::timestamptz)
        AND (${lt}::timestamptz IS NULL OR o.created_at < ${lt}::timestamptz)
      ORDER BY o.created_at ASC
    `

    const result = await Promise.all(
      orders.map(async (o) => {
        const signedUrl = await createPrescriptionPdfSignedUrl(
          o.prescription_pdf_path,
        )
        // A etiqueta é emitida junto com o pedido, então quase sempre já
        // está aqui. Quando não estiver — falha na hora de criar, pedido
        // antigo — busca uma vez e grava, para a próxima leitura não repetir
        // a ida à Envie Agora.
        let etiquetaUrl = o.shipping_label_url
        if (!etiquetaUrl && o.shipping_request_id) {
          try {
            const pdf = await getPdfEtiqueta(o.shipping_request_id)
            if (pdf?.url) {
              etiquetaUrl = pdf.url
              await sql`
                UPDATE orders SET shipping_label_url = ${pdf.url}
                WHERE id = ${o.id}::uuid
              `
            }
          } catch (error) {
            console.error(
              `[farmacia/json] PDF da etiqueta indisponível para ${o.id}:`,
              error,
            )
          }
        }

        return {
          numero_pedido: o.id,
          data_compra: o.created_at,
          status: o.status,
          // Fora do `pedido` de propósito: aquele objeto segue o formato que
          // a farmácia importa, e campo novo dentro dele é risco de quebrar
          // a importação deles. Aqui é o nosso envelope.
          etiqueta_url: etiquetaUrl,
          pedido: injectPrescriptionPdfUrl(o.pharmacy_json, signedUrl),
        }
      }),
    )

    await sql`
      INSERT INTO pharmacy_api_logs (endpoint, query_params, order_ids_returned)
      VALUES (
        'json',
        ${sql.json(range.params)},
        ${sql.json(result.map((r) => r.numero_pedido))}
      )
    `

    return NextResponse.json(result)
  } catch (error) {
    console.error('farmacia/pedidos/json error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
