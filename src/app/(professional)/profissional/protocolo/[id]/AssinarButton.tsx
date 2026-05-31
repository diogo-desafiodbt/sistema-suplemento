'use client'

import { useState } from 'react'
import { toast } from 'sonner'

export function AssinarButton({ protocolId }: { protocolId: string }) {
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function handleAssinar() {
    if (!confirmed) {
      setConfirmed(true)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/prescricao/assinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol_id: protocolId }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Erro ao assinar')
        return
      }

      toast.success('Prescrição assinada com sucesso')
      await new Promise(resolve => setTimeout(resolve, 500))
      window.location.href = '/profissional/fila'
      return
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {confirmed && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          <strong>Confirmação:</strong> Ao assinar, você atesta que revisou o perfil clínico do paciente e que o protocolo prescrito é adequado para o caso. Esta ação é registrada de forma imutável.
        </div>
      )}
      <button
        type="button"
        onClick={handleAssinar}
        disabled={loading}
        className={`w-full py-4 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-50 ${
          confirmed
            ? 'bg-[#f4001e] hover:bg-[#a30000] text-white'
            : 'border-2 border-[#13244f] text-[#13244f] hover:bg-[#13244f]/5'
        }`}
      >
        {loading
          ? 'Assinando...'
          : confirmed
          ? 'Confirmar assinatura'
          : 'Assinar prescrição'}
      </button>
      {confirmed && (
        <button
          type="button"
          onClick={() => setConfirmed(false)}
          className="w-full text-sm text-gray-400 hover:text-gray-600"
        >
          Cancelar
        </button>
      )}
    </div>
  )
}
