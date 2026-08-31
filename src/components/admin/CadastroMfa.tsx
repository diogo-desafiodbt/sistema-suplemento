'use client'

import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Cadastro do autenticador.
 *
 * Esta tela existe porque a alternativa era pedir para a pessoa colar um
 * `fetch` no console do navegador — que é exatamente o padrão de ataque contra
 * o qual o próprio Chrome avisa. Ferramenta de administrador é tela, não
 * instrução de console.
 *
 * Sem QR Code de propósito. Gerar um correto exigiria escrever a
 * especificação inteira à mão, e usar um serviço externo significaria mandar o
 * segredo do segundo fator para um terceiro. Digitar a chave leva vinte
 * segundos e funciona em todos os aplicativos.
 */
export function CadastroMfa({ email }: { email: string }) {
  const [etapa, setEtapa] = useState<'inicio' | 'cadastrando' | 'pronto'>(
    'inicio',
  )
  const [segredo, setSegredo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function comecar() {
    setOcupado(true)
    try {
      const res = await fetch('/api/auth/mfa/cadastrar')
      const dados = await res.json()
      if (!res.ok) {
        toast.error(dados.error ?? 'Não foi possível começar o cadastro.')
        return
      }
      setSegredo(dados.segredo)
      setEtapa('cadastrando')
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    try {
      const res = await fetch('/api/auth/mfa/cadastrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const dados = await res.json()
      if (!res.ok) {
        toast.error(dados.error ?? 'Código incorreto.')
        setCodigo('')
        return
      }
      setEtapa('pronto')
      toast.success('Verificação em duas etapas ligada.')
    } finally {
      setOcupado(false)
    }
  }

  if (etapa === 'pronto') {
    return (
      <div>
        <p className="admin-nome" style={{ marginBottom: 6 }}>
          Ligada nesta conta.
        </p>
        <p className="admin-vazio-texto" style={{ margin: 0, maxWidth: '62ch' }}>
          O próximo login vai pedir o código de seis dígitos do aplicativo.
          Guarde o acesso ao aplicativo: sem ele e sem a senha, recuperar a
          conta depende de outro administrador.
        </p>
      </div>
    )
  }

  if (etapa === 'inicio') {
    return (
      <button
        type="button"
        className="admin-btn admin-btn--primario"
        onClick={comecar}
        disabled={ocupado}
      >
        {ocupado ? 'Preparando…' : 'Cadastrar aplicativo autenticador'}
      </button>
    )
  }

  return (
    <div className="mfa-passos">
      <div>
        <p className="admin-campo-rotulo" style={{ marginBottom: 10 }}>
          1. Guarde esta chave no aplicativo autenticador
        </p>
        <p className="admin-sub" style={{ marginBottom: 10, maxWidth: '46ch' }}>
          No Google Authenticator: “Adicionar código” e depois “Inserir chave de
          configuração”. No 1Password ou Authy, a opção de inserir chave manual.
        </p>
        <code
          className="admin-mono"
          style={{
            display: 'block',
            marginTop: 8,
            padding: '10px 12px',
            background: 'var(--admin-papel-2)',
            border: '1px solid var(--admin-borda-fraca)',
            borderRadius: 'var(--admin-raio)',
            wordBreak: 'break-all',
            fontSize: 12,
          }}
        >
          {segredo}
        </code>
        <p className="admin-sub" style={{ marginTop: 6 }}>
          Conta: {email}
        </p>
      </div>

      <form onSubmit={confirmar}>
        <p className="admin-campo-rotulo" style={{ marginBottom: 10 }}>
          2. Digite o código que ele mostrar
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={codigo}
          onChange={(e) =>
            setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          className="admin-input"
          style={{
            width: 180,
            height: 44,
            fontSize: 20,
            textAlign: 'center',
            letterSpacing: '0.3em',
          }}
        />
        <div style={{ marginTop: 14 }}>
          <button
            type="submit"
            className="admin-btn admin-btn--primario"
            disabled={ocupado || codigo.length !== 6}
          >
            {ocupado ? 'Conferindo…' : 'Confirmar e ligar'}
          </button>
        </div>
        <p className="admin-sub" style={{ marginTop: 12, maxWidth: '42ch' }}>
          O código troca a cada trinta segundos. Se der erro, espere o próximo
          e tente de novo.
        </p>
      </form>
    </div>
  )
}
