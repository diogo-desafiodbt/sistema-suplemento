import { getSql } from '@/lib/db'
import { createShippingLabelForOrder } from '@/lib/shipping/create-label'
import { addBusinessDays } from '@/lib/shipping/estimate'
import { inngest } from '../client'

const PICKUP_DAYS_AFTER_PURCHASE = 2

export const createShippingLabel = inngest.createFunction(
  {
    id: 'create-shipping-label',
    name: 'Criar etiqueta Envie Agora (D+2 úteis da compra)',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event, step }) => {
    const { subscription_id, user_id } = event.data as {
      subscription_id: string
      user_id: string
    }

    if (!subscription_id || !user_id) {
      throw new Error(
        'Evento pagamento/confirmado sem subscription_id ou user_id',
      )
    }

    const pickupDateIso = await step.run('calcular-data-retirada', async () => {
      const sql = getSql()
      const rows = await sql<{ created_at: string | Date }[]>`
        SELECT created_at FROM subscriptions
        WHERE id = ${subscription_id}::uuid AND user_id = ${user_id}::uuid
      `
      const sub = rows[0]
      if (!sub?.created_at) {
        throw new Error(`Assinatura sem created_at: ${subscription_id}`)
      }

      const pickup = addBusinessDays(
        new Date(sub.created_at),
        PICKUP_DAYS_AFTER_PURCHASE,
      )
      return pickup.toISOString()
    })

    await step.sleepUntil('aguardar-data-retirada', new Date(pickupDateIso))

    try {
      const result = await step.run('criar-etiqueta', async () => {
        const sql = getSql()
        const orderRows = await sql<{ id: string }[]>`
          SELECT id FROM orders
          WHERE subscription_id = ${subscription_id}::uuid
          ORDER BY created_at DESC
          LIMIT 1
        `
        const order = orderRows[0] ?? null

        if (!order) {
          throw new Error(
            `Pedido não encontrado para subscription ${subscription_id}`,
          )
        }

        return createShippingLabelForOrder(order.id)
      })

      return { ok: true, pickupDate: pickupDateIso, ...result }
    } catch (error) {
      console.error(
        `[create-shipping-label] Falha na subscription ${subscription_id}:`,
        error,
      )
      return {
        ok: false,
        pickupDate: pickupDateIso,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
)
