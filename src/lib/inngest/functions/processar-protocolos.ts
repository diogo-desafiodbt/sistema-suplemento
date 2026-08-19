import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { ensureProtocolAfterPayment } from '@/lib/protocol/create-from-checkout'
import { inngest } from '../client'

export const processarProtocolos = inngest.createFunction(
  {
    id: 'processar-protocolos',
    name: 'Criar protocolo após pagamento confirmado',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event }) => {
    const jobId = await registrarInicio('processar_protocolos')
    try {
      const { subscription_id, user_id } = event.data as {
        subscription_id?: string
        user_id?: string
      }

      if (!subscription_id || !user_id) {
        throw new Error(
          'Evento pagamento/confirmado sem subscription_id ou user_id',
        )
      }

      await ensureProtocolAfterPayment(subscription_id, user_id)

      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 1,
        payload: { subscription_id },
      })
      return { ok: true, subscription_id }
    } catch (error) {
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
