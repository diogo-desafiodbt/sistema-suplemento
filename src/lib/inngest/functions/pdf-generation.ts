import { inngest } from '../client'

export const pdfGeneration = inngest.createFunction(
  { id: 'pdf-generation', name: 'Gerar PDF da prescrição', triggers: [{ event: 'prescricao/assinar' }] },
  async () => {
    // TODO: implementar
    return { pdfUrl: null }
  }
)
