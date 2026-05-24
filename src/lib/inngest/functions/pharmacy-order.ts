import { inngest } from '../client'

export const pharmacyOrder = inngest.createFunction(
  { id: 'pharmacy-order', name: 'Enviar pedido para farmácia', triggers: [{ event: 'pagamento/confirmado' }] },
  async () => {
    // TODO: implementar
    return { orderId: null }
  }
)
