import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function DietaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: entitlement } = await admin
    .from('user_entitlements')
    .select('id, expires_at')
    .eq('user_id', user.id)
    .eq('product_key', 'diet')
    .eq('status', 'active')
    .maybeSingle()

  if (!entitlement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-semibold">Dieta de Reversão</h1>
          <p className="text-gray-500">Este conteúdo está disponível no plano anual ou como compra avulsa.</p>
          <Link href="/recomendacoes">
            <Button>Ver planos</Button>
          </Link>
          <Link href="/dashboard" className="block text-sm text-gray-400 hover:text-gray-600">Voltar ao dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
        <h1 className="font-semibold">Dieta de Reversão</h1>
      </header>
      <main className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          Conteúdo da Dieta de Reversão — será preenchido com o material real.
        </div>
      </main>
    </div>
  )
}
