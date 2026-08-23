type PostgrestError = { message: string }

function configuracao() {
  const baseUrl = process.env.CONTEUDO_POSTGREST_URL
  const apiKey = process.env.CONTEUDO_POSTGREST_SERVICE_KEY
  if (!baseUrl || !apiKey) {
    throw new Error(
      'CONTEUDO_POSTGREST_URL e CONTEUDO_POSTGREST_SERVICE_KEY ausentes',
    )
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

function headers(apiKey: string, prefer?: string) {
  const h: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  }
  if (prefer) h.Prefer = prefer
  return h
}

/** Cliente PostgREST do banco de conteúdo (YouTube, Omie, Hotmart). */
export function createConteudoClient() {
  const { baseUrl, apiKey } = configuracao()

  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            async gte(
              column: string,
              value: string,
            ): Promise<{ data: Record<string, unknown>[] | null; error: PostgrestError | null }> {
              const params = new URLSearchParams()
              params.set('select', columns)
              params.set(column, `gte.${value}`)

              const res = await fetch(
                `${baseUrl}/rest/v1/${table}?${params.toString()}`,
                { headers: headers(apiKey) },
              )

              if (!res.ok) {
                return {
                  data: null,
                  error: { message: await res.text() },
                }
              }

              const data = (await res.json()) as Record<string, unknown>[]
              return { data, error: null }
            },
          }
        },

        async upsert(
          rows: Record<string, unknown>[],
          opts: { onConflict: string; count?: 'exact' },
        ): Promise<{
          error: PostgrestError | null
          count: number | null
        }> {
          if (rows.length === 0) return { error: null, count: 0 }

          const prefer =
            opts.count === 'exact'
              ? 'resolution=merge-duplicates,return=minimal,count=exact'
              : 'resolution=merge-duplicates,return=minimal'

          const res = await fetch(
            `${baseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(opts.onConflict)}`,
            {
              method: 'POST',
              headers: {
                ...headers(apiKey, prefer),
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(rows),
            },
          )

          if (!res.ok) {
            return { error: { message: await res.text() }, count: null }
          }

          let count: number | null = rows.length
          if (opts.count === 'exact') {
            const range = res.headers.get('content-range')
            const match = range?.match(/\/(\d+)$/)
            count = match ? Number(match[1]) : rows.length
          }

          return { error: null, count }
        },
      }
    },
  }
}
