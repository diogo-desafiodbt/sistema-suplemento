import { inngest } from '../client'

export const sundayDispatch = inngest.createFunction(
  { id: 'sunday-dispatch', name: 'Disparo de domingo por tier', triggers: [{ cron: '0 9 * * 0' }] },
  async () => {
    // TODO: implementar
    return { dispatched: 0 }
  }
)
