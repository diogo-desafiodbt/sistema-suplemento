'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { criarLink } from './actions'

function Botao() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="admin-btn admin-btn--primario" disabled={pending}>
      {pending ? 'Criando…' : 'Criar link'}
    </button>
  )
}

export function FormularioLink() {
  const [erro, agir] = useActionState(criarLink, null)

  return (
    <form action={agir}>
      <div className="admin-campos">
        <label>
          <span className="admin-campo-rotulo">Apelido</span>
          <input
            name="apelido"
            required
            placeholder="yt-aula-07"
            className="admin-input"
          />
        </label>
        <label>
          <span className="admin-campo-rotulo">Destino</span>
          <input
            name="destino"
            required
            defaultValue="/"
            placeholder="/suplementos/quiz"
            className="admin-input"
          />
        </label>
        <label>
          <span className="admin-campo-rotulo">Onde vai ficar</span>
          <input
            name="descricao"
            placeholder="descrição da Aula 7 no YouTube"
            className="admin-input"
          />
        </label>
      </div>

      {erro && <p className="admin-aviso" style={{ marginTop: 12 }}>{erro}</p>}

      <div style={{ marginTop: 16 }}>
        <Botao />
      </div>
    </form>
  )
}
