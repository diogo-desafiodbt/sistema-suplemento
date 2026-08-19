import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { avulsoRenewalReminder } from '@/lib/inngest/functions/avulso-renewal-reminder'
import { createShippingLabel } from '@/lib/inngest/functions/create-shipping-label'
import { hotmartSalesSync } from '@/lib/inngest/functions/hotmart-sales-sync'
import { omieFinanceiroSync } from '@/lib/inngest/functions/omie-financeiro-sync'
import { paymentRetry } from '@/lib/inngest/functions/payment-retry'
import { pharmacyOrder } from '@/lib/inngest/functions/pharmacy-order'
import { pharmacyReconciliation } from '@/lib/inngest/functions/pharmacy-reconciliation'
import { purchaseConfirmed } from '@/lib/inngest/functions/purchase-confirmed'
import { rfmRecalc } from '@/lib/inngest/functions/rfm-recalc'
import { supportAnalyze } from '@/lib/inngest/functions/support-analyze'
import { supportInboxPoll } from '@/lib/inngest/functions/support-inbox-poll'
import { supportPendingReminder } from '@/lib/inngest/functions/support-pending-reminder'
import { youtubeAnalyticsSync } from '@/lib/inngest/functions/youtube-analytics-sync'
import { getAppBaseUrl } from '@/lib/url-base'

/** Cinto de segurança: steps do YouTube (metadata ~3.7k + retenção) precisam >60s. */
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  serveOrigin: getAppBaseUrl(),
  functions: [
    rfmRecalc,
    pharmacyOrder,
    paymentRetry,
    avulsoRenewalReminder,
    createShippingLabel,
    pharmacyReconciliation,
    omieFinanceiroSync,
    hotmartSalesSync,
    youtubeAnalyticsSync,
    purchaseConfirmed,
    supportInboxPoll,
    supportAnalyze,
    supportPendingReminder,
  ],
})
