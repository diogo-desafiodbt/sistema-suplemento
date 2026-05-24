import { createClient } from './server'
import { createAdminClient } from './admin'

export type UserProfile = {
  full_name: string | null
  role: string
  client_code: string | null
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('users')
    .select('full_name, role, client_code')
    .eq('id', userId)
    .single()

  if (data) return data

  // Fallback: GRANT SELECT para authenticated ainda não aplicado no banco
  if (error?.code === '42501') {
    const { data: adminData } = await createAdminClient()
      .from('users')
      .select('full_name, role, client_code')
      .eq('id', userId)
      .single()
    return adminData
  }

  return null
}
