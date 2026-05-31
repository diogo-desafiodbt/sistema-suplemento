'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      toast.error('Email ou senha incorretos')
      setLoading(false)
      return
    }

    await fetch('/api/auth/login-event', { method: 'POST' })

    const profileRes = await fetch('/api/auth/profile')
    const { profile } = await profileRes.json()

    if (profile?.role === 'professional') {
      router.push('/profissional/fila')
    } else if (profile?.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">

      <header className="bg-[#f5f0eb] px-6 pt-5 pb-4 border-b border-[#13244f]/10">
        <div className="max-w-md mx-auto">
          <Link href="/">
            <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">

          <div className="text-center space-y-1">
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Acesso</p>
            <h1 className="text-2xl font-bold text-[#13244f]">Entrar na sua conta</h1>
            <p className="text-sm text-gray-500">Acompanhe seu protocolo e pedidos</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
              />
              <input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-3.5 rounded-xl font-bold text-sm uppercase tracking-wide transition active:scale-95 disabled:opacity-50"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <div className="text-center pt-1">
              <Link
                href="/recuperar-senha"
                className="text-sm text-[#f4001e] font-semibold hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>
          </div>

          <p className="text-center text-sm text-gray-400">
            Ainda não tem conta?{' '}
            <Link href="/quiz" className="text-[#13244f] font-semibold hover:underline">
              Faça o quiz e comece seu protocolo
            </Link>
          </p>

        </div>
      </main>
    </div>
  )
}
