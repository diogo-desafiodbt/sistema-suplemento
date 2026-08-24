import { z } from 'zod'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { asNumber, getSql } from '@/lib/db'
import { getSqlConteudo } from '@/lib/conteudo/db'

type Ator = 'ia' | 'pedro'

async function emailDoUsuario(userId: string): Promise<string | null> {
  const sql = getSql()
  const rows = await sql<{ email: string | null }[]>`
    SELECT email FROM users WHERE id = ${userId}::uuid LIMIT 1
  `
  return rows[0]?.email?.trim().toLowerCase() ?? null
}

async function registrarLeitura(params: {
  threadId: string
  userId: string | null
  ator: Ator
  ferramenta: string
  campos: string[]
}): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO support_access_log (thread_id, user_id, ator, ferramenta, campos)
    VALUES (
      ${params.threadId}::uuid,
      ${params.userId}::uuid,
      ${params.ator},
      ${params.ferramenta},
      ${sql.array(params.campos)}
    )
  `
}

/**
 * Ferramentas só de leitura. O cliente entra por closure — a IA não escolhe
 * de quem buscar. threadId também vem de fora, para o registro de leitura.
 */
export function criarFerramentas(
  userId: string,
  threadId: string,
  ator: Ator = 'ia',
) {
  const log = (ferramenta: string, campos: string[]) =>
    registrarLeitura({
      threadId,
      userId,
      ator,
      ferramenta,
      campos,
    })

  const buscar_compras_guia = betaZodTool({
    name: 'buscar_compras_guia',
    description:
      'Use quando o cliente falar do guia digital, compra na Hotmart, acesso ao curso, ou e-mail de entrega do guia. Devolve compras: produto, data e status.',
    inputSchema: z.object({}),
    run: async () => {
      const email = await emailDoUsuario(userId)
      if (!email) {
        await log('buscar_compras_guia', [])
        return JSON.stringify({ compras: [], motivo: 'cliente_sem_email' })
      }
      const sql = getSqlConteudo()
      const rows = await sql<
        {
          product_name: string | null
          order_date: string | Date | null
          status: string
        }[]
      >`
        SELECT product_name, order_date, status
        FROM hotmart_sales
        WHERE lower(buyer_email) = ${email}
        ORDER BY order_date DESC NULLS LAST
        LIMIT 20
      `
      const campos = ['product_name', 'order_date', 'status']
      await log('buscar_compras_guia', campos)
      return JSON.stringify({
        compras: rows.map((r) => ({
          produto: r.product_name,
          data: r.order_date ? new Date(r.order_date).toISOString() : null,
          status: r.status,
        })),
      })
    },
  })

  const buscar_pedidos = betaZodTool({
    name: 'buscar_pedidos',
    description:
      'Use quando o cliente perguntar onde está o pedido, se já foi enviado, ou reclamar de atraso. Devolve id, status, valor, data e rastreio.',
    inputSchema: z.object({}),
    run: async () => {
      const sql = getSql()
      const rows = await sql<
        {
          id: string
          status: string
          total_amount: string | number | null
          created_at: string | Date
          tracking_code: string | null
        }[]
      >`
        SELECT id, status, total_amount, created_at, tracking_code
        FROM orders
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT 10
      `
      const campos = [
        'id',
        'status',
        'total_amount',
        'created_at',
        'tracking_code',
      ]
      await log('buscar_pedidos', campos)
      return JSON.stringify({
        pedidos: rows.map((r) => ({
          id: r.id,
          status: r.status,
          valor: r.total_amount == null ? null : asNumber(r.total_amount),
          data: new Date(r.created_at).toISOString(),
          rastreio: r.tracking_code,
        })),
      })
    },
  })

  const buscar_rastreamento = betaZodTool({
    name: 'buscar_rastreamento',
    description:
      'Use quando o cliente pedir o histórico de entrega, eventos da transportadora, ou "o que aconteceu com meu pacote". Informe pedido_id se souber; senão usa o pedido mais recente.',
    inputSchema: z.object({
      pedido_id: z.string().uuid().optional(),
    }),
    run: async ({ pedido_id }) => {
      const sql = getSql()
      const rows = pedido_id
        ? await sql<
            {
              id: string
              tracking_code: string | null
              shipping_json: unknown
            }[]
          >`
            SELECT id, tracking_code, shipping_json
            FROM orders
            WHERE user_id = ${userId}::uuid AND id = ${pedido_id}::uuid
            LIMIT 1
          `
        : await sql<
            {
              id: string
              tracking_code: string | null
              shipping_json: unknown
            }[]
          >`
            SELECT id, tracking_code, shipping_json
            FROM orders
            WHERE user_id = ${userId}::uuid
            ORDER BY created_at DESC
            LIMIT 1
          `
      const order = rows[0]
      await log('buscar_rastreamento', [
        'id',
        'tracking_code',
        'shipping_json.eventos',
      ])
      if (!order) {
        return JSON.stringify({ encontrado: false, eventos: [] })
      }
      const shipping = order.shipping_json as {
        eventos?: Array<Record<string, unknown>>
      } | null
      return JSON.stringify({
        encontrado: true,
        pedido_id: order.id,
        rastreio: order.tracking_code,
        eventos: shipping?.eventos ?? [],
      })
    },
  })

  const buscar_financeiro = betaZodTool({
    name: 'buscar_financeiro',
    description:
      'Use quando o cliente perguntar sobre cobrança, valor pago, cartão, Pix, fatura ou cupom. Devolve cobranças: valor, status, data, forma e cupom.',
    inputSchema: z.object({}),
    run: async () => {
      const sql = getSql()
      const rows = await sql<
        {
          amount: string | number | null
          status: string | null
          paid_at: string | Date | null
          created_at: string | Date
          payment_method: string | null
        }[]
      >`
        SELECT p.amount, p.status, p.paid_at, p.created_at, p.payment_method
        FROM payments p
        JOIN subscriptions s ON s.id = p.subscription_id
        WHERE s.user_id = ${userId}::uuid
        ORDER BY p.created_at DESC
        LIMIT 15
      `
      await log('buscar_financeiro', [
        'amount',
        'status',
        'paid_at',
        'created_at',
        'payment_method',
      ])
      return JSON.stringify({
        cobrancas: rows.map((r) => ({
          valor: r.amount == null ? null : asNumber(r.amount),
          status: r.status,
          data: r.paid_at
            ? new Date(r.paid_at).toISOString()
            : new Date(r.created_at).toISOString(),
          forma: r.payment_method,
          cupom: null as string | null,
        })),
      })
    },
  })

  const buscar_assinatura = betaZodTool({
    name: 'buscar_assinatura',
    description:
      'Use quando o cliente perguntar sobre o plano, renovação, próxima cobrança, cancelamento ou se a assinatura está ativa.',
    inputSchema: z.object({}),
    run: async () => {
      const sql = getSql()
      const rows = await sql<
        {
          plan_type: string | null
          status: string | null
          next_billing_at: string | Date | null
          expires_at: string | Date | null
        }[]
      >`
        SELECT plan_type, status, next_billing_at, expires_at
        FROM subscriptions
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `
      await log('buscar_assinatura', [
        'plan_type',
        'status',
        'next_billing_at',
        'expires_at',
      ])
      const sub = rows[0]
      if (!sub) {
        return JSON.stringify({ encontrada: false })
      }
      return JSON.stringify({
        encontrada: true,
        plano: sub.plan_type,
        status: sub.status,
        proxima_cobranca: sub.next_billing_at
          ? new Date(sub.next_billing_at).toISOString()
          : null,
        expiracao: sub.expires_at
          ? new Date(sub.expires_at).toISOString()
          : null,
      })
    },
  })

  const buscar_conta = betaZodTool({
    name: 'buscar_conta',
    description:
      'Use quando o cliente perguntar sobre o próprio cadastro, e-mail da conta, código do cliente ou o que está liberado no acesso. Nunca peça nem devolva documento, data de nascimento ou endereço.',
    inputSchema: z.object({}),
    run: async () => {
      const sql = getSql()
      const userRows = await sql<
        {
          full_name: string | null
          email: string | null
          client_code: string | null
          created_at: string | Date
        }[]
      >`
        SELECT full_name, email, client_code, created_at
        FROM users
        WHERE id = ${userId}::uuid
        LIMIT 1
      `
      const acessos = await sql<
        {
          product_key: string
          status: string
          expires_at: string | Date | null
          is_permanent: boolean
        }[]
      >`
        SELECT product_key, status, expires_at, is_permanent
        FROM user_entitlements
        WHERE user_id = ${userId}::uuid
      `
      await log('buscar_conta', [
        'full_name',
        'email',
        'client_code',
        'created_at',
        'user_entitlements',
      ])
      const u = userRows[0]
      return JSON.stringify({
        nome: u?.full_name ?? null,
        email: u?.email ?? null,
        codigo: u?.client_code ?? null,
        cadastrado_em: u?.created_at
          ? new Date(u.created_at).toISOString()
          : null,
        acessos: acessos.map((a) => ({
          produto: a.product_key,
          status: a.status,
          expira_em: a.expires_at
            ? new Date(a.expires_at).toISOString()
            : null,
          permanente: a.is_permanent,
        })),
      })
    },
  })

  const buscar_catalogo = betaZodTool({
    name: 'buscar_catalogo',
    description:
      'Use quando o cliente perguntar preço, o que tem no catálogo, diferença entre planos ou se um produto existe. Não depende do cliente.',
    inputSchema: z.object({}),
    run: async () => {
      const sql = getSql()
      const rows = await sql<
        {
          name: string
          price_monthly: string | number | null
          price_quarterly: string | number | null
          price_yearly: string | number | null
          is_fixed: boolean
        }[]
      >`
        SELECT name, price_monthly, price_quarterly, price_yearly, is_fixed
        FROM products
        WHERE is_active = true
        ORDER BY is_fixed DESC, name
      `
      await log('buscar_catalogo', [
        'name',
        'price_monthly',
        'price_quarterly',
        'price_yearly',
        'is_fixed',
      ])
      return JSON.stringify({
        produtos: rows.map((r) => ({
          nome: r.name,
          preco_mensal:
            r.price_monthly == null ? null : asNumber(r.price_monthly),
          preco_trimestral:
            r.price_quarterly == null ? null : asNumber(r.price_quarterly),
          preco_anual:
            r.price_yearly == null ? null : asNumber(r.price_yearly),
          fixo: r.is_fixed,
        })),
      })
    },
  })

  const buscar_conteudo = betaZodTool({
    name: 'buscar_conteudo',
    description:
      'Use SOMENTE quando a triagem tiver categoria tecnico — dúvida sobre aula, vídeo do canal, "o Dr. falou sobre". Devolve só título e link com o segundo; nunca o texto da aula.',
    inputSchema: z.object({
      pergunta: z.string().min(1).max(500),
    }),
    run: async ({ pergunta }) => {
      const sql = getSqlConteudo()
      const rows = await sql<
        {
          titulo: string | null
          url: string | null
          inicio_seg: number | null
        }[]
      >`
        SELECT titulo, url, inicio_seg
        FROM buscar_aula(${pergunta})
      `
      await log('buscar_conteudo', ['titulo', 'url', 'inicio_seg'])
      const primeiro = rows[0]
      if (!primeiro?.titulo || !primeiro.url) {
        return JSON.stringify({ titulo: null, url: null })
      }
      const inicio = primeiro.inicio_seg ?? 0
      return JSON.stringify({
        titulo: primeiro.titulo,
        url: `${primeiro.url}&t=${inicio}`,
        inicio_seg: inicio,
      })
    },
  })

  return [
    buscar_compras_guia,
    buscar_pedidos,
    buscar_rastreamento,
    buscar_financeiro,
    buscar_assinatura,
    buscar_conta,
    buscar_catalogo,
    buscar_conteudo,
  ]
}
