# Prompt para o Cursor — Página de Termos de Uso + consentimento com hash no checkout

O texto completo e final dos Termos de Uso já está pronto em
`TERMOS_DE_USO_CONTEUDO.md` na raiz do projeto — use esse conteúdo
integralmente, sem reescrever ou resumir.

============================================================
PARTE 1 — Conteúdo canônico dos termos
============================================================

Criar `src/lib/terms/content.ts`:
```ts
export const TERMS_VERSION = '2026-07-31'
export const TERMS_CONTENT = `<colar aqui o conteúdo INTEGRAL de
TERMOS_DE_USO_CONTEUDO.md, como string>`
```
Esse arquivo é a fonte única de verdade — tanto a página pública quanto o
hash de aceite (Parte 4) usam exatamente esse texto, sem duplicar em outro
lugar.

============================================================
PARTE 2 — Página pública /termos-de-uso
============================================================

Criar `src/app/(public)/termos-de-uso/page.tsx`, renderizando o
`TERMS_CONTENT` de forma legível (títulos, parágrafos, listas), seguindo o
mesmo estilo visual das outras páginas públicas do site (cores, tipografia,
`font-display` para títulos, mesma paleta `#13244f`/`#f4001e`). Pode
converter o markdown pra JSX manualmente ou usar um parser simples — o
importante é a leitura ficar clara num documento longo (usar espaçamento
generoso entre seções).

============================================================
PARTE 3 — Link no menu e no rodapé
============================================================

3.1 — Em `src/components/Header.tsx`, adicionar ao array `menuItems`:
```ts
{ label: 'Termos de Uso', href: '/termos-de-uso' },
```
(antes do item "Entrar", mantendo a ordem dos demais)

3.2 — Em `src/components/Footer.tsx`, adicionar um link "Termos de Uso"
apontando pra `/termos-de-uso` na seção que fizer mais sentido com o que já
existe lá (junto de outros links institucionais/legais, se houver).

============================================================
PARTE 4 — Consentimento obrigatório no checkout + hash
============================================================

4.1 — Nova migration em supabase/migrations/ (timestamp atual):
```sql
create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  subscription_id uuid references public.subscriptions(id),
  terms_version text not null,
  terms_hash text not null,
  ip_address text,
  accepted_at timestamptz not null default now()
);
grant select, insert on public.terms_acceptances to service_role;
```

4.2 — Em `src/app/(public)/checkout/page.tsx`: adicionar um checkbox
obrigatório antes do botão de finalizar compra, algo como "Li e concordo com
os [Termos de Uso](/termos-de-uso)" (link abre em nova aba). O botão de
finalizar (`handlePayment`) só pode ser habilitado/executado se o checkbox
estiver marcado. Incluir `terms_accepted: true` no body enviado pra
`/api/checkout/create`.

4.3 — Em `src/app/api/checkout/create/route.ts`:
  - adicionar `terms_accepted: z.literal(true)` ao `checkoutSchema` (rejeita
    com 400 se não vier true — mensagem tipo "É necessário aceitar os Termos
    de Uso")
  - depois que a `subscription` for criada com sucesso, calcular o hash:
    ```ts
    import { createHash } from 'crypto'
    import { TERMS_VERSION, TERMS_CONTENT } from '@/lib/terms/content'

    const termsHash = createHash('sha256')
      .update(TERMS_CONTENT + TERMS_VERSION)
      .digest('hex')
    ```
  - inserir em `terms_acceptances`: `user_id` (do usuário autenticado),
    `subscription_id` (a assinatura recém-criada), `terms_version`,
    `terms_hash`, `ip_address` (extrair de
    `request.headers.get('x-forwarded-for')`), `accepted_at: new Date()`

NÃO criar nenhuma tela de admin pra visualizar isso ainda — só a gravação no
banco por enquanto. A tela de consulta por cliente vem numa etapa seguinte.
