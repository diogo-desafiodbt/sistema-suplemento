'use client'

import { useState } from 'react'
import { toast } from 'sonner'

type ConfigRow = {
  key: string
  value: string
  description: string | null
}

type Props = { configs: ConfigRow[] }

export function ConfigClient({ configs: initialConfigs }: Props) {
  const [configs, setConfigs] = useState<ConfigRow[]>(initialConfigs)
  const [saving, setSaving] = useState<string | null>(null)

  function handleChange(key: string, newValue: string) {
    setConfigs(prev => prev.map(c => c.key === key ? { ...c, value: newValue } : c))
  }

  async function handleSave(key: string, value: string) {
    setSaving(key)
    try {
      const res = await fetch(`/api/admin/config/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuração salva.')
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(null)
    }
  }

  if (configs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-400">Nenhuma configuração encontrada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {configs.map(config => (
        <div
          key={config.key}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3"
        >
          <div>
            <p className="font-mono text-xs font-bold text-[#13244f]/50 uppercase tracking-widest">
              {config.key}
            </p>
            {config.description && (
              <p className="text-sm text-gray-400 mt-0.5">{config.description}</p>
            )}
          </div>

          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={config.value}
              onChange={e => handleChange(config.key, e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#13244f] font-mono focus:outline-none focus:ring-2 focus:ring-[#13244f]/20 bg-white"
            />
            <button
              onClick={() => handleSave(config.key, config.value)}
              disabled={saving === config.key}
              className="bg-[#f4001e] text-white font-bold px-5 py-2.5 rounded-full text-sm hover:bg-[#a30000] transition disabled:opacity-50 whitespace-nowrap"
            >
              {saving === config.key ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
