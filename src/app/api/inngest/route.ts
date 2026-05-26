import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { rfmRecalc } from '@/lib/inngest/functions/rfm-recalc'
import { sundayDispatch } from '@/lib/inngest/functions/sunday-dispatch'
import { pdfGeneration } from '@/lib/inngest/functions/pdf-generation'
import { pharmacyOrder } from '@/lib/inngest/functions/pharmacy-order'
import { paymentRetry } from '@/lib/inngest/functions/payment-retry'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    rfmRecalc,
    sundayDispatch,
    pdfGeneration,
    pharmacyOrder,
    paymentRetry,
  ],
})
