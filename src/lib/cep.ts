export async function fetchAddressByCep(cep: string) {
  const cleaned = cep.replace(/\D/g, '')
  if (cleaned.length !== 8) return null

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.erro) return null
    return {
      zip_code: cleaned,
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf,
    }
  } catch {
    return null
  }
}
