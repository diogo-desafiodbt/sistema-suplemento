import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { createShippingLabelForOrder } from '@/lib/shipping/create-label'
import { inngest } from '../client'

export const createShippingLabel = inngest.createFunction(
  {
    id: 'create-shipping-label',
    name: 'Criar etiqueta Envie Agora (assim que o pedido existe)',
    // Escuta o pedido, não o pagamento. As duas coisas nascem do mesmo evento
    // e em paralelo — esperar o pagamento significaria procurar um pedido que
    // ainda não foi gravado.
    //
    // O atraso de D+2 para a coleta é configurado na conta da Envie Agora
    // (confirmado com eles em 27/08/2026). Antes disso o sistema produzia esse
    // intervalo dormindo dois dias antes de chamar a API, o que deixava a
    // etiqueta invisível e sem cobrança durante todo esse tempo.
    triggers: [{ event: 'pedido/criado' }],
  },
  async ({ event, step }) => {
    const jobId = await step.run('registrar-inicio', () =>
      registrarInicio('create_shipping_label'),
    )
    try {
      const { order_id, subscription_id } = event.data as {
        order_id: string
        subscription_id?: string
      }

      if (!order_id) {
        throw new Error('Evento pedido/criado sem order_id')
      }

      const result = await step.run('criar-etiqueta', () =>
        createShippingLabelForOrder(order_id),
      )

      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 1,
        payload: { order_id, subscription_id, ok: true },
      })
      return { ok: true, order_id, ...result }
    } catch (error) {
      console.error('[create-shipping-label] falhou:', error)
      await registrarFim(jobId, {
        status: 'failed',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  },
)
