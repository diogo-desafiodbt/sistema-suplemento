import { type NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSql } from '@/lib/db'
import { upsertClienteNoOmie } from '@/lib/omie/clientes'

/**
 * Manda um cliente para o Omie na hora.
 *
 * A sincronização acontece sozinha na compra confirmada. Esta rota existe para
 * os dois casos em que isso não basta: conferir que a integração está de pé, e
 * recuperar um cliente cujo envio falhou — porque o Omie estava fora, ou
 * porque o cadastro estava sem CPF na hora e foi completado depois.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  await exigirAdmin()
  const { id } = await context.params
  const sql = getSql()

  try {
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
      }[]
    >`
      SELECT u.id, u.full_name, u.email, u.cpf, u.phone,
             a.zip_code AS cep, a.street AS logradouro, a.number AS numero,
             a.complement AS complemento, a.neighborhood AS bairro,
             a.city AS cidade, a.state AS uf
      FROM users u
      LEFT JOIN LATERAL (
        SELECT * FROM addresses WHERE user_id = u.id
        ORDER BY is_default DESC, id LIMIT 1
      ) a ON true
      WHERE u.id = ${id}::uuid
    `

    if (!dados) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }
    if (!dados.cpf || !dados.email || !dados.full_name) {
      return NextResponse.json(
        {
          error:
            'Cadastro incompleto: o Omie precisa de nome, e-mail e CPF. Complete a ficha e tente de novo.',
        },
        { status: 400 },
      )
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
      VALUES (${id}::uuid, ${codigo})
      ON CONFLICT (user_id) DO UPDATE
      SET codigo_cliente = EXCLUDED.codigo_cliente, sincronizado_em = now()
    `

    return NextResponse.json({ ok: true, codigo_cliente: codigo })
  } catch (erro) {
    // A resposta do Omie vai inteira para a tela: erro de integração sem o
    // texto do outro lado obriga a abrir log para descobrir o óbvio.
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    console.error('sincronizar-omie:', mensagem)
    return NextResponse.json({ error: mensagem }, { status: 502 })
  }
}
