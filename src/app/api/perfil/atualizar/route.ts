import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  full_name: z.string().min(1),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
  address: z.object({
    zip_code: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string().max(2),
  }),
})

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { full_name, phone, birth_date, address } = parsed.data

    const { error: userError } = await supabase
      .from('users')
      .update({
        full_name,
        phone: phone ?? null,
        birth_date: birth_date ?? null,
      })
      .eq('id', user.id)

    if (userError) {
      console.error('Erro ao atualizar usuário:', userError)
      return NextResponse.json({ error: 'Erro ao salvar dados pessoais' }, { status: 500 })
    }

    const { data: existingAddress } = await supabase
      .from('addresses')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle()

    if (existingAddress) {
      const { error: addrError } = await supabase
        .from('addresses')
        .update({
          zip_code: address.zip_code,
          street: address.street,
          number: address.number,
          complement: address.complement ?? null,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
        })
        .eq('id', existingAddress.id)

      if (addrError) {
        console.error('Erro ao atualizar endereço:', addrError)
        return NextResponse.json({ error: 'Erro ao salvar endereço' }, { status: 500 })
      }
    } else {
      const { error: addrError } = await supabase
        .from('addresses')
        .insert({
          user_id: user.id,
          zip_code: address.zip_code,
          street: address.street,
          number: address.number,
          complement: address.complement ?? null,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
          is_default: true,
        })

      if (addrError) {
        console.error('Erro ao inserir endereço:', addrError)
        return NextResponse.json({ error: 'Erro ao salvar endereço' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Perfil atualizar error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
