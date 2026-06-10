'use client'

import { useState } from 'react'
import { toast } from 'sonner'

type AddressData = {
  zip_code: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
}

type ProfileFormProps = {
  initialData: {
    full_name: string
    email: string
    phone: string
    cpf: string
    birth_date: string
    address: AddressData
  }
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const [fullName, setFullName] = useState(initialData.full_name)
  const [phone, setPhone] = useState(initialData.phone)
  const [birthDate, setBirthDate] = useState(initialData.birth_date)
  const [address, setAddress] = useState<AddressData>(initialData.address)
  const [loading, setLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)

  async function handleCepBlur() {
    const cep = address.zip_code.replace(/\D/g, '')
    if (cep.length !== 8) return

    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setAddress(prev => ({
          ...prev,
          street: data.logradouro ?? prev.street,
          neighborhood: data.bairro ?? prev.neighborhood,
          city: data.localidade ?? prev.city,
          state: data.uf ?? prev.state,
        }))
      }
    } catch {
      // silently ignore viacep errors
    } finally {
      setCepLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/perfil/atualizar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone, birth_date: birthDate, address }),
      })

      if (!res.ok) throw new Error()
      toast.success('Perfil atualizado com sucesso.')
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#13244f] focus:outline-none focus:ring-2 focus:ring-[#13244f]/20 bg-white'
  const readonlyClass = 'w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-gray-50 cursor-not-allowed'
  const labelClass = 'block text-xs font-semibold text-[#13244f]/60 uppercase tracking-wide mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Dados pessoais</p>

        <div>
          <label className={labelClass}>Nome completo</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={initialData.email} readOnly className={readonlyClass} />
          <p className="text-xs text-gray-400 mt-1">O email não pode ser alterado.</p>
        </div>

        <div>
          <label className={labelClass}>Telefone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>CPF</label>
          <input type="text" value={initialData.cpf} readOnly className={readonlyClass} />
          <p className="text-xs text-gray-400 mt-1">O CPF não pode ser alterado.</p>
        </div>

        <div>
          <label className={labelClass}>Data de nascimento</label>
          <input
            type="date"
            value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Endereço de entrega</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelClass}>CEP</label>
            <input
              type="text"
              value={address.zip_code}
              onChange={e => setAddress(prev => ({ ...prev, zip_code: e.target.value }))}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              className={inputClass}
              disabled={cepLoading}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Logradouro</label>
          <input
            type="text"
            value={address.street}
            onChange={e => setAddress(prev => ({ ...prev, street: e.target.value }))}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Número</label>
            <input
              type="text"
              value={address.number}
              onChange={e => setAddress(prev => ({ ...prev, number: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Complemento</label>
            <input
              type="text"
              value={address.complement}
              onChange={e => setAddress(prev => ({ ...prev, complement: e.target.value }))}
              placeholder="Apto, bloco..."
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Bairro</label>
          <input
            type="text"
            value={address.neighborhood}
            onChange={e => setAddress(prev => ({ ...prev, neighborhood: e.target.value }))}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cidade</label>
            <input
              type="text"
              value={address.city}
              onChange={e => setAddress(prev => ({ ...prev, city: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Estado (UF)</label>
            <input
              type="text"
              value={address.state}
              onChange={e => setAddress(prev => ({ ...prev, state: e.target.value }))}
              maxLength={2}
              placeholder="SP"
              className={`${inputClass} uppercase`}
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#f4001e] text-white font-bold py-3 rounded-full text-sm hover:bg-[#a30000] transition disabled:opacity-50"
      >
        {loading ? 'Salvando...' : 'Salvar alterações'}
      </button>
    </form>
  )
}
