'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import imgLogoAzul from '@/../public/logo-azul.png'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // Quando o Cognito pede o segundo fator, a senha já foi aceita e o que falta
  // é o código. Guardamos a sessão do desafio, que vale poucos minutos e não dá
  // acesso a nada sozinha.
  const [desafio, setDesafio] = useState<{
    sessao: string
    usuario: string
  } | null>(null)
  const [codigo, setCodigo] = useState('')

  async function seguirDepoisDeEntrar() {
    await fetch('/api/auth/login-event', { method: 'POST' })

    const profileRes = await fetch('/api/auth/profile')
    const { profile } = await profileRes.json()

    if (profile?.role === 'professional') {
      router.push('/suplementos/profissional/fila')
    } else if (profile?.role === 'admin') {
      router.push('/suplementos/admin')
    } else {
      router.push('/suplementos/dashboard')
    }
  }

  async function handleCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (!desafio) return
    setLoading(true)

    const res = await fetch('/api/auth/mfa/codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...desafio, codigo }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: null }))
      toast.error(error ?? 'Código incorreto')
      setCodigo('')
      setLoading(false)
      return
    }

    await seguirDepoisDeEntrar()
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const res = await fetch('/api/auth/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      toast.error('Email ou senha incorretos')
      setLoading(false)
      return
    }

    const dados = await res.json().catch(() => ({}))
    if (dados.mfa) {
      setDesafio({ sessao: dados.sessao, usuario: dados.usuario })
      setLoading(false)
      if (dados.mfa === 'cadastrar') {
        toast.error(
          'Este acesso exige autenticador e ele ainda não foi cadastrado. Fale com o administrador.',
        )
      }
      return
    }

    await fetch('/api/auth/login-event', { method: 'POST' })

    const profileRes = await fetch('/api/auth/profile')
    const { profile } = await profileRes.json()

    if (profile?.role === 'professional') {
      router.push('/suplementos/profissional/fila')
    } else if (profile?.role === 'admin') {
      router.push('/suplementos/admin')
    } else {
      router.push('/suplementos/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb] flex flex-col">
      <header className="bg-[#f5f0eb] px-6 pt-5 pb-4 border-b border-[#13244f]/10">
        <div className="max-w-md mx-auto">
          <Link href="/">
            <Image
              src={imgLogoAzul}
              alt="Desafio Diabetes"
              width={455}
              height={355}
              className="h-7 w-auto"
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
              Acesso
            </p>
            <h1 className="text-2xl font-bold text-[#13244f]">
              Entrar na sua conta
            </h1>
            <p className="text-sm text-gray-500">
              Acompanhe seu protocolo e pedidos
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            {desafio ? (
              <form onSubmit={handleCodigo} className="space-y-3">
                <p className="text-sm text-[#13244f]">
                  Digite o código de seis dígitos do seu aplicativo
                  autenticador.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) =>
                    setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  required
                  // biome-ignore lint/a11y/noAutofocus: o campo é a única coisa na tela neste passo
                  autoFocus
                  className="w-full h-12 rounded-xl border border-gray-200 px-4 text-center text-xl tracking-[0.4em] font-semibold text-[#13244f] outline-none focus:border-[#13244f]"
                />
                <button
                  type="submit"
                  disabled={loading || codigo.length !== 6}
                  className="w-full h-12 rounded-xl bg-[#f4001e] text-white font-bold disabled:opacity-50"
                >
                  {loading ? 'Conferindo…' : 'Entrar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDesafio(null)
                    setCodigo('')
                  }}
                  className="w-full text-sm text-gray-500"
                >
                  Voltar
                </button>
              </form>
            ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
              />
              <input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            )}

            <div className="text-center pt-1">
              <Link
                href="/suplementos/recuperar-senha"
                className="text-sm text-[#f4001e] font-semibold hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>
          </div>

          <p className="text-center text-sm text-gray-400">
            Ainda não tem conta?{' '}
            <Link
              href="/suplementos/quiz"
              className="text-[#13244f] font-semibold hover:underline"
            >
              Faça o quiz e comece seu protocolo
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
