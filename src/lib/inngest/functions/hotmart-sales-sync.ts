import {
  epochMsToIso,
  fetchAllSalesHistory,
  type HotmartSaleItem,
} from '@/lib/hotmart/client'
import { getSql } from '@/lib/db'
import { getSqlConteudo, upsertConteudo } from '@/lib/conteudo/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

const SP_OFFSET = '-03:00'

/**
 * Garante que cada comprador da Hotmart exista como cliente.
 *
 * Casa por e-mail, que é a única chave que temos para quem comprou antes de
 * 25/08/2026 — a Hotmart não guardava CPF até então. Quem já é cliente não é
 * tocado: `DO NOTHING`, nunca `DO UPDATE`. Uma venda não corrige o cadastro
 * de ninguém.
 */
async function garantirClientesDaHotmart(
  rows: { buyer_email: string | null; buyer_name: string | null }[],
): Promise<number> {
  const porEmail = new Map<string, string | null>()
  for (const r of rows) {
    const email = r.buyer_email?.trim().toLowerCase()
    if (email) porEmail.set(email, r.buyer_name?.trim() || null)
  }
  if (porEmail.size === 0) return 0

  const sql = getSql()
  let criados = 0
  for (const [email, nome] of porEmail) {
    const feito = await sql<{ id: string }[]>`
      INSERT INTO users (id, email, full_name, client_code)
      VALUES (
        gen_random_uuid(),
        ${email},
        ${nome},
        'DD-' || lpad(nextval('public.client_code_seq')::text, 6, '0')
      )
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `
    if (feito[0]) criados++
  }
  return criados
}

/**
 * A origem que a Hotmart devolve na venda.
 *
 * `src` é o parâmetro que a gente coloca no link do checkout; `source_sck` é
 * o que a Hotmart preenche sozinha quando a venda nasce dentro dela (página
 * do produto, vendedor). Preferimos o nosso: quando os dois existem, é porque
 * a pessoa veio pelo nosso link e passou pela loja deles no caminho.
 *
 * Hoje `src` volta vazio em todas as vendas — o parâmetro nunca foi
 * configurado nos links. É por isso que "configurar a Hotmart" está na lista
 * do Diogo: sem esse passo, esta função devolve sempre a origem da Hotmart.
 */
function origemDaVenda(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null
  const compra = (item as Record<string, unknown>).purchase
  if (!compra || typeof compra !== 'object') return null
  const rastreio = (compra as Record<string, unknown>).tracking
  if (!rastreio || typeof rastreio !== 'object') return null

  const r = rastreio as Record<string, unknown>
  for (const chave of ['src', 'source_sck', 'sck']) {
    const v = r[chave]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 60)
  }
  return null
}

/**
 * Registra a compra no Rastro, para quem já tem cadastro.
 *
 * O identificador de navegador vem da costura feita no login, quando existe.
 * Quando não existe — comprador que nunca entrou no site, só clicou no link
 * da Hotmart — grava com um identificador derivado da transação. É honesto:
 * a compra aparece na ficha da pessoa, mas não é atribuída a uma jornada de
 * navegação que nunca houve.
 */
async function registrarComprasNoRastro(
  vendas: { buyer_email: string | null; transaction_code: string; origem: string | null }[],
): Promise<void> {
  const sql = getSql()
  for (const venda of vendas) {
    const email = venda.buyer_email?.trim().toLowerCase()
    if (!email) continue
    try {
      const [pessoa] = await sql<{ id: string; anonimo_id: string | null }[]>`
        SELECT u.id, l.anonimo_id
        FROM users u
        LEFT JOIN rastro_ligacoes l ON l.pessoa_id = u.id
        WHERE lower(u.email) = ${email}
        ORDER BY l.ligado_em
        LIMIT 1
      `
      if (!pessoa) continue

      // Idempotente pela transação: a sincronização relê a janela de dois dias
      // toda madrugada, e sem isto a mesma compra viraria um evento por dia.
      const anonimo = pessoa.anonimo_id ?? `hotmart:${venda.transaction_code}`
      const [jaTem] = await sql<{ existe: boolean }[]>`
        SELECT true AS existe FROM rastro_eventos
        WHERE anonimo_id = ${anonimo} AND evento = 'compra_concluida'
        LIMIT 1
      `
      if (jaTem) continue

      await sql`
        SELECT rastro_registrar(
          ${anonimo}, 'compra_concluida', ${venda.origem}, ${pessoa.id}::uuid
        )
      `
    } catch (erro) {
      console.error('rastro: compra da Hotmart não entrou', {
        transacao: venda.transaction_code,
        erro,
      })
    }
  }
}

/**
 * CPF do comprador, quando a Hotmart manda.
 *
 * O Diogo ligou a exigência de CPF no checkout em 25/08/2026. O campo não
 * aparecia no retorno até então, e a documentação da Hotmart não deixa claro
 * com que nome ele vem — pode ser `document`, `cpf` ou `documentNumber`,
 * dependendo da versão da API. Em vez de apostar num nome e descobrir daqui a
 * um mês que ficou tudo nulo, procuramos os três.
 *
 * Guarda só dígitos: o CPF do sistema vem sem pontuação, e casar
 * "529.982.247-25" com "52998224725" falharia em silêncio.
 */
function documentoDoComprador(buyer: unknown): string | null {
  if (!buyer || typeof buyer !== 'object') return null
  const b = buyer as Record<string, unknown>
  for (const chave of ['document', 'cpf', 'documentNumber', 'document_number']) {
    const v = b[chave]
    if (typeof v === 'string' && v.trim()) {
      const digitos = v.replace(/\D/g, '')
      if (digitos.length >= 11) return digitos
    }
  }
  return null
}

/** Janela dos últimos 2 dias corridos em America/Sao_Paulo (início do dia D-2 → agora). */
function lastTwoCalendarDaysWindow(now: Date): {
  startMs: number
  endMs: number
  windowStart: string
  windowEnd: string
} {
  const spMs = now.getTime() - 3 * 60 * 60 * 1000
  const startDay = new Date(spMs)
  startDay.setUTCDate(startDay.getUTCDate() - 2)
  const startStr = startDay.toISOString().slice(0, 10)
  const start = new Date(`${startStr}T00:00:00${SP_OFFSET}`)
  return {
    startMs: start.getTime(),
    endMs: now.getTime(),
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
  }
}

function mapSaleRow(item: HotmartSaleItem) {
  const purchase = item.purchase
  const transaction = purchase?.transaction
  if (!transaction) return null

  const productId = item.product?.id
  if (productId == null) return null

  const status = purchase?.status
  if (!status) return null

  return {
    transaction_code: transaction,
    product_id: productId,
    product_name: item.product?.name ?? null,
    buyer_name: item.buyer?.name ?? null,
    buyer_email: item.buyer?.email ?? null,
    buyer_ucode: item.buyer?.ucode ?? null,
    buyer_document: documentoDoComprador(item.buyer),
    status,
    order_date: epochMsToIso(purchase?.order_date),
    approved_date: epochMsToIso(purchase?.approved_date),
    price_value: purchase?.price?.value ?? null,
    price_currency: purchase?.price?.currency_code ?? null,
    payment_method: purchase?.payment?.method ?? null,
    is_subscription: purchase?.is_subscription ?? null,
    recurrency_number: purchase?.recurrency_number ?? null,
    commission_as: purchase?.commission_as ?? null,
    raw_payload: item,
    synced_at: new Date().toISOString(),
  }
}

export const hotmartSalesSync = inngest.createFunction(
  {
    id: 'hotmart-sales-sync',
    name: 'Sync diário de vendas Hotmart (Guia Primeiro Passo)',
    // Além do horário, um gatilho manual: serve para forçar a sincronização
    // depois de uma mudança na Hotmart, sem esperar o dia seguinte.
    triggers: [
      { cron: 'TZ=America/Sao_Paulo 0 7 * * *' },
      { event: 'hotmart/sincronizar' },
    ],
  },
  async ({ step }) => {
    const result = await step.run('sync-hotmart-sales', async () => {
      const sql = getSqlConteudo()
      const now = new Date()
      const window = lastTwoCalendarDaysWindow(now)
      const jobId = await registrarInicio('hotmart_sales_sync')

      const fail = async (error: unknown, extra?: Record<string, unknown>) => {
        const message =
          error instanceof Error ? error.message : String(error)
        await registrarFim(jobId, {
          status: 'failed',
          payload: {
            totalFetched: 0,
            totalUpserted: 0,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            error: message,
            ...extra,
          },
        })
      }

      const productId = process.env.HOTMART_PRODUCT_ID
      if (!productId) {
        await fail(new Error('HOTMART_PRODUCT_ID ausente'))
        throw new Error('HOTMART_PRODUCT_ID ausente')
      }

      let items: HotmartSaleItem[]
      try {
        items = await fetchAllSalesHistory({
          productId,
          startDateMs: window.startMs,
          endDateMs: window.endMs,
        })
      } catch (error) {
        await fail(error)
        throw error
      }

      const rows = items
        .map(mapSaleRow)
        .filter((row): row is NonNullable<typeof row> => row !== null)

      let totalUpserted = 0
      if (rows.length > 0) {
        try {
          totalUpserted = await upsertConteudo(sql, 'hotmart_sales', rows)
        } catch (error) {
          await fail(error, { totalFetched: items.length })
          throw new Error(
            `Erro ao upsert hotmart_sales: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      // Quem compra o guia vira CLIENTE, não só uma linha de venda. Sem isto,
      // o comprador é invisível para o suporte (que identifica pela tabela de
      // clientes) e não aparece na aba de clientes. Foi assim que 1.050
      // pessoas ficaram fora do sistema sem ninguém perceber.
      //
      // Não sobrescreve ninguém: quem já é cliente fica como está. O papel vem
      // do padrão da coluna — a permissão do banco impede que uma venda
      // escolha papel ou grave CPF.
      let clientesNovos = 0
      try {
        clientesNovos = await garantirClientesDaHotmart(rows)
      } catch (error) {
        // Não derruba a sincronização: a venda já está salva, e o cliente
        // entra na próxima rodada. Mas registra, porque silêncio aqui
        // significaria comprador invisível para sempre.
        console.error('Falha ao criar clientes da Hotmart:', error)
      }

      // A compra fecha a jornada: é o último passo, e é ele que dá sentido a
      // todos os anteriores no relatório de origem.
      try {
        await registrarComprasNoRastro(
          items.map((item) => ({
            buyer_email:
              (item as { buyer?: { email?: string } }).buyer?.email ?? null,
            transaction_code:
              (item as { purchase?: { transaction?: string } }).purchase
                ?.transaction ?? '',
            origem: origemDaVenda(item),
          })).filter((v) => v.transaction_code),
        )
      } catch (error) {
        console.error('Falha ao registrar compras no Rastro:', error)
      }

      const payload = {
        totalFetched: items.length,
        totalUpserted,
        clientesNovos,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
      }

      await registrarFim(jobId, {
        status: 'completed',
        payload,
        affectedRows: totalUpserted,
      })

      return payload
    })

    return result
  },
)
