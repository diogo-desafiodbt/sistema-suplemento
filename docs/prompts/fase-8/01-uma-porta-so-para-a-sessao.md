# Prompt — Fase 8, passo 1: uma porta só para a sessão

> Referencie no Cursor com `@01-uma-porta-so-para-a-sessao.md`.
> Branch: `reestrutura-suplementos`.

Este passo **não troca nada de autenticação**. Ele junta num lugar só o que
hoje está espalhado — para que a troca, no passo seguinte, seja um arquivo em
vez de trinta e dois.

## O que eu medi

O plano falava em "42 pontos de chamada". Medindo, o desenho é outro:

```
32×  auth.getUser()              ← a MESMA pergunta: quem está logado?
 1×  auth.signInWithPassword()
 1×  auth.signOut()
 1×  auth.signUp()
 1×  auth.resetPasswordForEmail()
```

Não são 36 problemas. É **um** repetido 32 vezes, mais **quatro** fluxos de
verdade. Este passo resolve o repetido.

## A porta

Crie **`src/lib/auth/sessao.ts`**:

```ts
export type Sessao = { userId: string; email: string | null }

/** Quem está logado nesta requisição, ou null. */
export async function sessaoAtual(): Promise<Sessao | null>
```

**Hoje ela chama o Supabase por dentro** — exatamente o que os 32 lugares já
fazem. Nada muda de comportamento. No passo 2, o corpo dela vira Cognito e o
resto do sistema não fica sabendo.

Documente isso no topo do arquivo, em duas linhas: quem abrir daqui a um mês
precisa entender que este é o ponto de troca, não um utilitário qualquer.

## A substituição

Nos 32 lugares, troque:

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/suplementos/login')
```

por:

```ts
const sessao = await sessaoAtual()
if (!sessao) redirect('/suplementos/login')
```

E `user.id` vira `sessao.userId`.

**Mecânico de propósito.** Se em algum lugar você precisar de mais que `id` e
`email`, **pare e me avise** — é sinal de que aquele ponto usa algo do Supabase
que o Cognito não tem igual, e eu quero saber agora, não no passo 2.

## Duas exceções, e o motivo

**`src/middleware.ts` fica como está.** Ele não só lê a sessão: ele **renova o
cookie** do Supabase a cada requisição, com a dança de `getAll`/`setAll` do
`@supabase/ssr`. Isso é específico do fornecedor e morre no passo 2 inteiro.
Envolver agora só criaria uma casca para jogar fora.

**Os quatro fluxos ficam como estão.** Entrar, sair, cadastrar e recuperar
senha são reescritos no passo 2. Não os toque aqui.

## O que NÃO fazer

- **Não mude comportamento.** Se alguma tela hoje redireciona para o login e
  outra devolve 401, mantenha cada uma como está. Uniformizar é tentador e
  esconde regressão no meio de uma mudança mecânica.
- **Não instale nada do Cognito**, não crie cliente da AWS, não mexa em
  variável de ambiente.
- **Não mexa nos satélites.** Eles verificam o cookie que o núcleo carimba, não
  o Supabase — e por isso atravessam a Fase 8 sem alteração nenhuma.
- **Não apague `src/lib/supabase/`.** Ainda é usado pela porta, pelo middleware
  e pelos quatro fluxos.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `grep -rn "auth.getUser" src/` mostra **só** `lib/auth/sessao.ts` e
   `middleware.ts`.
3. `grep -rln "@/lib/supabase" src/app` mostra só os quatro fluxos
   (login, checkout, recuperar-senha, signout).
4. Nenhuma tela mudou de comportamento: quem redirecionava, redireciona; quem
   devolvia 401, devolve 401.
5. Os satélites não foram tocados.

Quando terminar, me chame antes de mexer em outra coisa. Eu confiro a contagem,
subo, e testo entrar e navegar — e só então a gente troca o motor.
