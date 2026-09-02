'use client'

import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Botão de mandar o cliente para o Omie agora.
 *
 * Mostra o código que o Omie devolveu, e não só "deu certo": é o número que
 * permite achar o cadastro lá e conferir que é o mesmo.
 */
export function SincronizarOmie({
  clienteId,
  codigoAtual,
}: {
  clienteId: string
  codigoAtual: number | null
}) {
  const [ocupado, setOcupado] = useState(false)
  const [codigo, setCodigo] = useState<number | null>(codigoAtual)

  async function sincronizar() {
    setOcupado(true)
    try {
      const res = await fetch(
        `/api/admin/clientes/${clienteId}/sincronizar-omie`,
        { method: 'POST' },
      )
      const dados = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(dados.error ?? 'Não foi possível sincronizar.')
        return
      }
      setCodigo(dados.codigo_cliente)
      toast.success(`Cliente no Omie: ${dados.codigo_cliente}`)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="admin-btn"
        onClick={sincronizar}
        disabled={ocupado}
      >
        {ocupado ? 'Enviando…' : 'Sincronizar no Omie'}
      </button>
      {codigo ? (
        <span className="admin-sub">
          código no Omie: <span className="admin-mono">{codigo}</span>
        </span>
      ) : (
        <span className="admin-sub">ainda não está no Omie</span>
      )}
    </div>
  )
}
