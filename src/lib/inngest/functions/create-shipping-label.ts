import { inngest } from '../client'
import { createShippingLabelForOrder } from '@/lib/shipping/create-label'

export const createShippingLabel = inngest.createFunction(
  {
    id: 'create-shipping-label',
    name: 'Criar etiqueta Envie Agora (após SLA farmácia)',
    triggers: [{ event: 'farmacia/pedido-enviado' }],
  },
  async ({ event, step }) => {
    const { order_id } = event.data as { order_id: string }
    if (!order_id) {
      throw new Error('Evento farmacia/pedido-enviado sem order_id')
    }

    await step.sleep('aguardar-sla-farmacia', '24h')

    try {
      const result = await step.run('criar-etiqueta', async () => {
        return createShippingLabelForOrder(order_id)
      })
      return { ok: true, ...result }
    } catch (error) {
      console.error(
        `[create-shipping-label] Falha no pedido ${order_id}:`,
        error
      )
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
)
