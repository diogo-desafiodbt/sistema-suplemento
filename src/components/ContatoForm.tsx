'use client'

import { useState } from 'react'

const ASSUNTOS = [
  { value: 'meu-pedido', label: 'Meu pedido' },
  { value: 'minha-assinatura', label: 'Minha assinatura' },
  { value: 'duvida-sobre-produto', label: 'Dúvida sobre produto' },
  { value: 'outro', label: 'Outro assunto' },
] as const

type Estado = 'parado' | 'enviando' | 'enviado' | 'erro'

const campo =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[#13244f] ' +
  'placeholder:text-[#13244f]/35 outline-none transition ' +
  'focus:border-[#13244f] focus:ring-2 focus:ring-[#13244f]/10'

const rotulo = 'block text-sm font-medium text-[#13244f] mb-1.5'

export function ContatoForm() {
  const [estado, setEstado] = useState<Estado>('parado')
  const [erro, setErro] = useState('')

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEstado('enviando')
    setErro('')

    const dados = Object.fromEntries(new FormData(event.currentTarget))

    try {
      const res = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })

      if (!res.ok) {
        const corpo = await res.json().catch(() => null)
        setErro(corpo?.error ?? 'Não conseguimos enviar agora.')
        setEstado('erro')
        return
      }

      setEstado('enviado')
    } catch {
      setErro('Sem conexão. Tente de novo em instantes.')
      setEstado('erro')
    }
  }

  if (estado === 'enviado') {
    return (
      <div className="rounded-2xl border border-[#13244f]/10 bg-[#13244f]/[0.03] px-6 py-10 text-center">
        <p className="font-display text-2xl text-[#13244f] mb-2">
          Mensagem enviada
        </p>
        <p className="text-[#13244f]/70 leading-relaxed">
          Respondemos no e-mail que você informou, em até 1 dia útil. Se for
          urgente, chame no WhatsApp — ali é mais rápido.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {/* Isca para robô: fora da tela, sem foco pelo teclado, ignorada por leitor de tela. */}
      <input
        type="text"
        name="site"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="nome" className={rotulo}>
            Seu nome
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            placeholder="Como podemos te chamar"
            className={campo}
          />
        </div>

        <div>
          <label htmlFor="email" className={rotulo}>
            Seu e-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={160}
            autoComplete="email"
            placeholder="onde devemos responder"
            className={campo}
          />
        </div>
      </div>

      <div>
        <label htmlFor="assunto" className={rotulo}>
          Sobre o que você quer falar
        </label>
        <select id="assunto" name="assunto" required className={campo}>
          {ASSUNTOS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="mensagem" className={rotulo}>
          Sua mensagem
        </label>
        <textarea
          id="mensagem"
          name="mensagem"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          placeholder="Conte com detalhes o que está acontecendo. Quanto mais claro, mais rápido a gente resolve."
          className={`${campo} resize-y`}
        />
        <p className="mt-2 text-xs text-[#13244f]/50 leading-relaxed">
          Não escreva senha, número de cartão ou dados de pagamento. Nunca
          pedimos isso por e-mail.
        </p>
      </div>

      {estado === 'erro' && (
        <p
          role="alert"
          className="rounded-xl bg-[#f4001e]/5 border border-[#f4001e]/20 px-4 py-3 text-sm text-[#f4001e]"
        >
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={estado === 'enviando'}
        className="w-full rounded-xl bg-[#f4001e] px-6 py-4 font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {estado === 'enviando' ? 'Enviando…' : 'Enviar mensagem'}
      </button>
    </form>
  )
}
