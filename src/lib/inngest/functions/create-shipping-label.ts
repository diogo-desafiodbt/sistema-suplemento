import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createShippingLabelForOrder } from '@/lib/shipping/create-label'
import { addBusinessDays } from '@/lib/shipping/estimate'

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
      throw new Error('Evento pagamento/confirmado sem subscription_id ou user_id')
    }

    const pickupDateIso = await step.run('calcular-data-retirada', async () => {
      const admin = createAdminClient()
      const { data: sub, error } = await admin
        .from('subscriptions')
        .select('created_at')
        .eq('id', subscription_id)
        .eq('user_id', user_id)
        .single()

      if (error || !sub?.created_at) {
        throw new Error(
          `Assinatura sem created_at: ${error?.message ?? subscription_id}`
        )
      }

      const pickup = addBusinessDays(
        new Date(sub.created_at),
        PICKUP_DAYS_AFTER_PURCHASE
      )
      return pickup.toISOString()
    })

    await step.sleepUntil('aguardar-data-retirada', new Date(pickupDateIso))

    try {
      const result = await step.run('criar-etiqueta', async () => {
        const admin = createAdminClient()
        const { data: order, error } = await admin
          .from('orders')
          .select('id')
          .eq('subscription_id', subscription_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error || !order) {
          throw new Error(
            `Pedido não encontrado para subscription ${subscription_id}: ${error?.message ?? 'empty'}`
          )
        }

        return createShippingLabelForOrder(order.id)
      })

      return { ok: true, pickupDate: pickupDateIso, ...result }
    } catch (error) {
      console.error(
        `[create-shipping-label] Falha na subscription ${subscription_id}:`,
        error
      )
      return {
        ok: false,
        pickupDate: pickupDateIso,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
)
