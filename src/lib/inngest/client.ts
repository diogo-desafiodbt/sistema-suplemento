import { Inngest } from 'inngest'

// Para rodar localmente com `inngest-cli dev`, defina INNGEST_DEV=1
// (sem isso, o SDK exige INNGEST_SIGNING_KEY e /api/inngest retorna 500)
//
// ⚠️ Não usar em produção: essa flag desliga a verificação de assinatura HMAC
// das requisições. Em produção (Vercel), use INNGEST_SIGNING_KEY + INNGEST_EVENT_KEY.

export const inngest = new Inngest({
  id: 'desafio-diabetes',
  name: 'Desafio Diabetes',
})
