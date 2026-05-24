import { inngest } from '../client'

export const rfmRecalc = inngest.createFunction(
  { id: 'rfm-recalc', name: 'Recalcular scores RFM', triggers: [{ cron: '0 * * * *' }] },
  async () => {
    // TODO: implementar
    return { recalculated: 0 }
  }
)
