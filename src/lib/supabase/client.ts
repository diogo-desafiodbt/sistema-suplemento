import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log('SUPABASE URL disponível:', !!url)
  console.log('SUPABASE KEY disponível:', !!key)

  if (!url || !key) {
    throw new Error(`Supabase env vars missing: URL=${url}, KEY=${!!key}`)
  }

  return createBrowserClient(url, key)
}
