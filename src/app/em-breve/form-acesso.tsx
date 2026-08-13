'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Botão discreto que abre o campo de senha. A validação acontece no
 * servidor (`/api/acesso-equipe`) — aqui não existe nenhuma comparação de
 * senha, só o envio. Qualquer verificação feita neste arquivo seria
 * visível para quem abrisse o código-fonte da página.
 */
export function FormAcesso() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(false)
    setEnviando(true)

    const resp = await fetch('/api/acesso-equipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha }),
    })

    if (!resp.ok) {
      setErro(true)
      setEnviando(false)
      setSenha('')
      return
    }

    // O portão substitui o conteúdo sem mudar o endereço, então a barra do
    // navegador ainda tem o destino original (/suplementos, /suplementos/quiz
    // etc.). Recarregar a própria URL devolve a pessoa exatamente para onde
    // ela tentava ir — mandar para a raiz perderia esse destino.
    router.refresh()
    window.location.reload()
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-full border border-[#f5f0eb]/25 px-5 py-2.5 text-[#f5f0eb]/70 text-sm transition-colors hover:border-[#f5f0eb]/50 hover:text-[#f5f0eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0eb]"
      >
        Sou do time
      </button>
    )
  }

  return (
    <form
      onSubmit={entrar}
      className="flex w-[min(88vw,340px)] flex-col items-center gap-2.5"
    >
      <input
        type="password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Senha de acesso"
        // biome-ignore lint/a11y/noAutofocus: o campo só existe após clique explícito do usuário
        autoFocus
        autoComplete="off"
        aria-label="Senha de acesso da equipe"
        aria-invalid={erro}
        className="w-full rounded-lg border border-[#f5f0eb]/25 bg-[#f5f0eb]/5 px-4 py-2.5 text-center text-[#f5f0eb] text-sm placeholder:text-[#f5f0eb]/35 focus:border-[#f5f0eb]/60 focus:outline-none"
      />

      {erro && (
        <p role="alert" className="text-[#f4001e] text-xs">
          Senha incorreta.
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || senha.length === 0}
        className="w-full rounded-lg bg-[#f5f0eb] px-4 py-2.5 font-medium text-[#13244f] text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
