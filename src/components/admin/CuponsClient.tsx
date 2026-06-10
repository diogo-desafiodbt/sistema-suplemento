'use client'

import { useState } from 'react'
import { toast } from 'sonner'

type Coupon = {
  id: string
  code: string
  type: 'percentage' | 'fixed'
  value: number
  expires_at: string | null
  max_uses: number | null
  used_count: number
  is_active: boolean
}

type Props = { coupons: Coupon[] }

export function CuponsClient({ coupons: initialCoupons }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage')
  const [value, setValue] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxUses, setMaxUses] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/cupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.toUpperCase(),
          type,
          value: parseFloat(value),
          expires_at: expiresAt || null,
          max_uses: maxUses ? parseInt(maxUses) : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erro ao criar')
      }
      const { coupon } = await res.json()
      setCoupons(prev => [coupon, ...prev])
      setCode('')
      setValue('')
      setExpiresAt('')
      setMaxUses('')
      setShowForm(false)
      toast.success('Cupom criado com sucesso.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar cupom.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(id: string, current: boolean) {
    setToggling(id)
    try {
      const res = await fetch(`/api/admin/cupons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      })
      if (!res.ok) throw new Error()
      setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c))
      toast.success(!current ? 'Cupom ativado.' : 'Cupom desativado.')
    } catch {
      toast.error('Erro ao atualizar cupom.')
    } finally {
      setToggling(null)
    }
  }

  function formatValue(coupon: Coupon) {
    if (coupon.type === 'percentage') return `${coupon.value}%`
    return `R$ ${coupon.value.toFixed(2).replace('.', ',')}`
  }

  const inputClass = 'border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#13244f] focus:outline-none focus:ring-2 focus:ring-[#13244f]/20 bg-white'
  const labelClass = 'block text-xs font-semibold text-[#13244f]/60 uppercase tracking-wide mb-1'

  return (
    <div className="space-y-4">

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="bg-[#f4001e] text-white font-bold px-5 py-2.5 rounded-full text-sm hover:bg-[#a30000] transition"
        >
          + Novo cupom
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Novo cupom</p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className={labelClass}>Código</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="EX: DESCONTO10"
                className={inputClass + ' w-full uppercase'}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Tipo</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as 'percentage' | 'fixed')}
                className={inputClass + ' w-full'}
              >
                <option value="percentage">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{type === 'percentage' ? 'Valor (%)' : 'Valor (R$)'}</label>
              <input
                type="number"
                value={value}
                onChange={e => setValue(e.target.value)}
                min="0"
                max={type === 'percentage' ? 100 : undefined}
                step="0.01"
                placeholder={type === 'percentage' ? '10' : '20.00'}
                className={inputClass + ' w-full'}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Máx. de usos</label>
              <input
                type="number"
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
                min="1"
                placeholder="Ilimitado"
                className={inputClass + ' w-full'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className={labelClass}>Validade</label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className={inputClass + ' w-full'}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#f4001e] text-white font-bold px-6 py-2.5 rounded-full text-sm hover:bg-[#a30000] transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Criar cupom'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="border border-gray-200 text-[#13244f] px-6 py-2.5 rounded-full text-sm hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Código</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Tipo</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Valor</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Usos</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Validade</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">
                  Nenhum cupom cadastrado.
                </td>
              </tr>
            )}
            {coupons.map(coupon => (
              <tr key={coupon.id} className="border-b border-gray-50 hover:bg-[#f5f0eb]/50 transition-colors">
                <td className="px-5 py-4 font-mono font-bold text-[#13244f]">{coupon.code}</td>
                <td className="px-5 py-4 text-gray-500">
                  {coupon.type === 'percentage' ? 'Percentual' : 'Valor fixo'}
                </td>
                <td className="px-5 py-4 font-semibold text-[#13244f]">{formatValue(coupon)}</td>
                <td className="px-5 py-4 text-gray-500">
                  {coupon.used_count} / {coupon.max_uses ?? '∞'}
                </td>
                <td className="px-5 py-4 text-gray-400 text-xs">
                  {coupon.expires_at
                    ? new Date(coupon.expires_at).toLocaleDateString('pt-BR')
                    : 'Sem limite'}
                </td>
                <td className="px-5 py-4">
                  <button
                    onClick={() => handleToggle(coupon.id, coupon.is_active)}
                    disabled={toggling === coupon.id}
                    className={`text-xs font-bold px-3 py-1 rounded-full transition disabled:opacity-50 ${
                      coupon.is_active
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {toggling === coupon.id ? '...' : coupon.is_active ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
