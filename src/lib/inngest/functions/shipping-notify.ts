import {
  notifyNewTrackingEvents,
  notifyShippingUpdate,
} from '@/lib/shipping/notify'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import type { RastreamentoEvento } from '@/types/shipping'
import { inngest } from '../client'

/**
 * Aviso de despacho / rastreio / entrega ao cliente.
 *
 * Os webhooks da Envie Agora rodam em `app_entrada` (ALB → tg-sistema-entrada)
 * e não têm grant em `shipping_notification_logs`. Por isso o e-mail sai daqui:
 * `/api/inngest*` cai no núcleo como `app_web`.
 */

export const shippingEtiquetaGerada = inngest.createFunction(
  {
    id: 'shipping-etiqueta-gerada',
    name: 'Aviso ao cliente: etiqueta gerada',
    triggers: [{ event: 'envio/etiqueta-gerada' }],
  },
  async ({ event }) => {
    const jobId = await registrarInicio('shipping_etiqueta_gerada')
    try {
      const { order_id, tracking_code } = event.data as {
        order_id: string
        tracking_code?: string | null
      }

      if (!order_id) {
        throw new Error('Evento envio/etiqueta-gerada sem order_id')
      }

      await notifyShippingUpdate({
        orderId: order_id,
        eventId: 'etiqueta',
        kind: 'dispatched',
        trackingCode: tracking_code,
      })

      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 1,
        payload: { order_id, tracking_code: tracking_code ?? null },
      })
      return { ok: true, order_id }
    } catch (error) {
      await registrarFim(jobId, {
        status: 'failed',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  },
)

export const shippingRastreioAtualizado = inngest.createFunction(
  {
    id: 'shipping-rastreio-atualizado',
    name: 'Aviso ao cliente: rastreio atualizado',
    triggers: [{ event: 'envio/rastreio-atualizado' }],
  },
  async ({ event }) => {
    const jobId = await registrarInicio('shipping_rastreio_atualizado')
    try {
      const { order_id, eventos } = event.data as {
        order_id: string
        eventos: RastreamentoEvento[]
      }

      if (!order_id) {
        throw new Error('Evento envio/rastreio-atualizado sem order_id')
      }

      const lista = Array.isArray(eventos) ? eventos : []
      await notifyNewTrackingEvents(order_id, lista)

      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: lista.length,
        payload: { order_id, eventos: lista.length },
      })
      return { ok: true, order_id, eventos: lista.length }
    } catch (error) {
      await registrarFim(jobId, {
        status: 'failed',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  },
)
