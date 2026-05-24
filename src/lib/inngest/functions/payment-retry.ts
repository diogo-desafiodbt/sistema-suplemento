import { inngest } from '../client'

export const paymentRetry = inngest.createFunction(
  { id: 'payment-retry', name: 'Retentar cobrança', triggers: [{ event: 'pagamento/falhou' }] },
  async () => {
    // TODO: implementar
    return { retried: false }
  }
)
