import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { rfmRecalc } from '@/lib/inngest/functions/rfm-recalc'
import { pharmacyOrder } from '@/lib/inngest/functions/pharmacy-order'
import { paymentRetry } from '@/lib/inngest/functions/payment-retry'
import { avulsoRenewalReminder } from '@/lib/inngest/functions/avulso-renewal-reminder'
import { createShippingLabel } from '@/lib/inngest/functions/create-shipping-label'
import { pharmacyReconciliation } from '@/lib/inngest/functions/pharmacy-reconciliation'
import { purchaseConfirmed } from '@/lib/inngest/functions/purchase-confirmed'
import { supportInboxPoll } from '@/lib/inngest/functions/support-inbox-poll'
import { supportAnalyze } from '@/lib/inngest/functions/support-analyze'
import { supportPendingReminder } from '@/lib/inngest/functions/support-pending-reminder'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    rfmRecalc,
    pharmacyOrder,
    paymentRetry,
    avulsoRenewalReminder,
    createShippingLabel,
    pharmacyReconciliation,
    purchaseConfirmed,
    supportInboxPoll,
    supportAnalyze,
    supportPendingReminder,
  ],
})
