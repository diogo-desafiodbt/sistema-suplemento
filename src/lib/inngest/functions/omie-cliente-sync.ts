import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { getSql } from '@/lib/db'
import { upsertClienteNoOmie } from '@/lib/omie/clientes'
import { inngest } from '../client'

/**
 * Leva o comprador para o Omie assim que a compra é confirmada.
 *
 * É o primeiro passo da integração de faturamento: lá, pedido e nota fiscal
 * pendem de um cliente existente. Fazer isso na compra, e não numa varredura
 * noturna, evita que a emissão da nota tropece num cadastro que ainda não
 * existe.
 *
 * Falhar aqui não desfaz a compra. O pedido já está gravado, o cliente já foi
 * avisado, e a próxima compra dele — ou uma execução manual — tenta de novo. O
 * que não pode é o cadastro no Omie derrubar uma venda que já aconteceu.
 */
export const omieClienteSync = inngest.createFunction(
  {
    id: 'omie-cliente-sync',
    name: 'Cadastra o comprador no Omie',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event }) => {
    const jobId = await registrarInicio('omie_cliente_sync')
    try {
      const { user_id } = event.data as { user_id: string }
      if (!user_id) throw new Error('Evento sem user_id')

      const sql = getSql()
      const [dados] = await sql<
        {
          id: string
          full_name: string | null
          email: string | null
          cpf: string | null
          phone: string | null
          cep: string | null
          logradouro: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          uf: string | null
          ja_tem: number | null
        }[]
      >`
        SELECT u.id, u.full_name, u.email, u.cpf, u.phone,
               a.zip_code AS cep, a.street AS logradouro, a.number AS numero,
               a.complement AS complemento, a.neighborhood AS bairro,
               a.city AS cidade, a.state AS uf,
               oc.codigo_cliente AS ja_tem
        FROM users u
        LEFT JOIN LATERAL (
          SELECT * FROM addresses
          WHERE user_id = u.id
          ORDER BY is_default DESC, id
          LIMIT 1
        ) a ON true
        LEFT JOIN omie_clientes oc ON oc.user_id = u.id
        WHERE u.id = ${user_id}::uuid
      `

      if (!dados) throw new Error(`Usuário não encontrado: ${user_id}`)

      // Sem CPF não há cadastro possível no Omie. Não é erro do job: é o
      // cadastro incompleto, e quem conserta é a ficha do cliente.
      if (!dados.cpf || !dados.email || !dados.full_name) {
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { user_id, pulado: 'cadastro-incompleto' },
        })
        return { pulado: 'cadastro-incompleto' }
      }

      const codigo = await upsertClienteNoOmie({
        userId: dados.id,
        nome: dados.full_name,
        email: dados.email,
        cpf: dados.cpf,
        telefone: dados.phone,
        endereco: dados.cep
          ? {
              cep: dados.cep,
              logradouro: dados.logradouro ?? '',
              numero: dados.numero ?? 'S/N',
              complemento: dados.complemento,
              bairro: dados.bairro ?? '',
              cidade: dados.cidade ?? '',
              uf: dados.uf ?? '',
            }
          : null,
      })

      await sql`
        INSERT INTO omie_clientes (user_id, codigo_cliente)
        VALUES (${user_id}::uuid, ${codigo})
        ON CONFLICT (user_id) DO UPDATE
        SET codigo_cliente = EXCLUDED.codigo_cliente,
            sincronizado_em = now()
      `

      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 1,
        payload: { user_id, codigo_cliente: codigo, novo: !dados.ja_tem },
      })
      return { codigo_cliente: codigo }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      await registrarFim(jobId, {
        status: 'failed',
        payload: { erro: mensagem },
      })
      throw erro
    }
  },
)
