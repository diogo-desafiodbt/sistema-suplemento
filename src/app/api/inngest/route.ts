import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { rfmRecalc } from '@/lib/inngest/functions/rfm-recalc'
import { sundayDispatch } from '@/lib/inngest/functions/sunday-dispatch'
import { pharmacyOrder } from '@/lib/inngest/functions/pharmacy-order'
import { paymentRetry } from '@/lib/inngest/functions/payment-retry'
import { avulsoRenewalReminder } from '@/lib/inngest/functions/avulso-renewal-reminder'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    rfmRecalc,
    sundayDispatch,
    pharmacyOrder,
    paymentRetry,
    avulsoRenewalReminder,
  ],
})
