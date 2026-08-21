import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { avulsoRenewalReminder } from '@/lib/inngest/functions/avulso-renewal-reminder'
import { hotmartSalesSync } from '@/lib/inngest/functions/hotmart-sales-sync'
import { omieFinanceiroSync } from '@/lib/inngest/functions/omie-financeiro-sync'
import { paymentRetry } from '@/lib/inngest/functions/payment-retry'
import { pharmacyOrder } from '@/lib/inngest/functions/pharmacy-order'
import { pharmacyReconciliation } from '@/lib/inngest/functions/pharmacy-reconciliation'
import { processarProtocolos } from '@/lib/inngest/functions/processar-protocolos'
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
    // create-shipping-label SAIU em 21/08/2026: quem trata com a
    // transportadora agora é a farmácia. O job ficava preso em `running`
    // porque a Envie Agora recusava o nome curto do destinatário — falha que
    // não chegava a ninguém. O arquivo continua no repositório para o dia em
    // que a emissão voltar para cá.
    pharmacyReconciliation,
    processarProtocolos,
    omieFinanceiroSync,
    hotmartSalesSync,
    youtubeAnalyticsSync,
    purchaseConfirmed,
    supportInboxPoll,
    supportAnalyze,
    supportPendingReminder,
  ],
})
