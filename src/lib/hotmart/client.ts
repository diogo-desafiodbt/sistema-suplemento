type TokenCache = {
  token: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

type HotmartTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

export type HotmartSaleItem = {
  product?: {
    name?: string
    id?: number
  }
  buyer?: {
    name?: string
    ucode?: string
    email?: string
  }
  purchase?: {
    transaction?: string
    order_date?: number
    approved_date?: number
    status?: string
    recurrency_number?: number
    is_subscription?: boolean
    commission_as?: string
    price?: {
      value?: number
      currency_code?: string
    }
    payment?: {
      method?: string
      installments_number?: number
      type?: string
    }
  }
}

type HotmartSalesHistoryResponse = {
  items?: HotmartSaleItem[]
  page_info?: {
    next_page_token?: string
    results_per_page?: number
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} ausente`)
  }
  return value
}

/** OAuth2 client_credentials — cache em memória até perto do expires_in. */
export async function getHotmartAccessToken(): Promise<string> {
  const now = Date.now()
  // Renovar 60s antes do vencimento.
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token
  }

  const clientId = requireEnv('HOTMART_CLIENT_ID')
  const clientSecret = requireEnv('HOTMART_CLIENT_SECRET')
  const basicToken = requireEnv('HOTMART_BASIC_TOKEN')

  const url = new URL(
    'https://api-sec-vlc.hotmart.com/security/oauth/token',
  )
  url.searchParams.set('grant_type', 'client_credentials')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: basicToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* keep raw */
  }

  if (!res.ok) {
    const detail =
      typeof parsed === 'object' && parsed !== null
        ? JSON.stringify(parsed)
        : String(parsed)
    throw new Error(`Hotmart OAuth → ${res.status}: ${detail}`)
  }

  const data = parsed as HotmartTokenResponse
  if (!data.access_token) {
    throw new Error('Hotmart OAuth: access_token ausente na resposta')
  }

  const expiresInMs = (data.expires_in ?? 86400) * 1000
  tokenCache = {
    token: data.access_token,
    expiresAt: now + expiresInMs,
  }

  return data.access_token
}

export type FetchSalesHistoryParams = {
  productId: string
  startDateMs: number
  endDateMs: number
  maxResults?: number
}

export type HotmartConta = 1 | 2

const tokenCaches: Partial<Record<HotmartConta, TokenCache>> = {}

function hotmartEnvPrefix(conta: HotmartConta): string {
  return conta === 2 ? 'HOTMART2' : 'HOTMART'
}

export function parseHotmartConta(value: unknown): HotmartConta {
  const conta = Number(value)
  if (conta !== 1 && conta !== 2) {
    throw new Error('conta deve ser 1 ou 2')
  }
  return conta
}

export function hotmartProductIdForConta(conta: HotmartConta): string {
  return requireEnv(`${hotmartEnvPrefix(conta)}_PRODUCT_ID`)
}

/** OAuth por conta — backfill usa HOTMART2_* na conta 2. */
export async function getHotmartAccessTokenForConta(
  conta: HotmartConta,
): Promise<string> {
  const now = Date.now()
  const cached = tokenCaches[conta]
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token
  }

  const prefix = hotmartEnvPrefix(conta)
  const clientId = requireEnv(`${prefix}_CLIENT_ID`)
  const clientSecret = requireEnv(`${prefix}_CLIENT_SECRET`)
  const basicToken = requireEnv(`${prefix}_BASIC_TOKEN`)

  const url = new URL(
    'https://api-sec-vlc.hotmart.com/security/oauth/token',
  )
  url.searchParams.set('grant_type', 'client_credentials')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: basicToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* keep raw */
  }

  if (!res.ok) {
    const detail =
      typeof parsed === 'object' && parsed !== null
        ? JSON.stringify(parsed)
        : String(parsed)
    throw new Error(`Hotmart OAuth (conta ${conta}) → ${res.status}: ${detail}`)
  }

  const data = parsed as HotmartTokenResponse
  if (!data.access_token) {
    throw new Error(`Hotmart OAuth (conta ${conta}): access_token ausente`)
  }

  const expiresInMs = (data.expires_in ?? 86400) * 1000
  tokenCaches[conta] = {
    token: data.access_token,
    expiresAt: now + expiresInMs,
  }
  return data.access_token
}

async function fetchAllSalesHistoryWithToken(
  accessToken: string,
  params: FetchSalesHistoryParams,
): Promise<HotmartSaleItem[]> {
  const maxResults = params.maxResults ?? 50
  const all: HotmartSaleItem[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(
      'https://developers.hotmart.com/payments/api/v1/sales/history',
    )
    url.searchParams.set('product_id', params.productId)
    url.searchParams.set('start_date', String(params.startDateMs))
    url.searchParams.set('end_date', String(params.endDateMs))
    url.searchParams.set('max_results', String(maxResults))
    if (pageToken) {
      url.searchParams.set('page_token', pageToken)
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      /* keep raw */
    }

    if (!res.ok) {
      const detail =
        typeof parsed === 'object' && parsed !== null
          ? JSON.stringify(parsed)
          : String(parsed)
      throw new Error(`Hotmart sales/history → ${res.status}: ${detail}`)
    }

    const data = parsed as HotmartSalesHistoryResponse
    if (Array.isArray(data.items)) {
      all.push(...data.items)
    }
    pageToken = data.page_info?.next_page_token || undefined
  } while (pageToken)

  return all
}

/** Lista vendas com paginação por cursor (page_token). */
export async function fetchAllSalesHistory(
  params: FetchSalesHistoryParams,
): Promise<HotmartSaleItem[]> {
  return fetchAllSalesHistoryWithToken(await getHotmartAccessToken(), params)
}

export async function fetchAllSalesHistoryForConta(
  conta: HotmartConta,
  params: Omit<FetchSalesHistoryParams, 'productId'> & { productId?: string },
): Promise<HotmartSaleItem[]> {
  const productId = params.productId ?? hotmartProductIdForConta(conta)
  return fetchAllSalesHistoryWithToken(
    await getHotmartAccessTokenForConta(conta),
    { ...params, productId },
  )
}

export function epochMsToIso(ms: number | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}
