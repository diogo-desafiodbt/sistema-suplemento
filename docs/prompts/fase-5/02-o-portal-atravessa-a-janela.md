# Prompt — Fase 5, passo 2: o portal atravessa a janela

> Referencie no Cursor com `@02-o-portal-atravessa-a-janela.md`.
> Branch: `reestrutura-suplementos`. Contrato: `docs/contratos/portal-do-paciente.md`.
> **Pré-requisito: as rotas do passo 1 já estão em produção.** Se não
> estiverem, pare — as telas vão chamar rota que ainda não existe.

No passo 1 abrimos a janela. Agora o portal passa por ela e **larga a
credencial de banco**.

## O que muda de verdade

Hoje `dashboard/perfil/page.tsx` faz `SELECT ... FROM users` direto no RDS. Se
alguém tomar o processo do portal, leva a tabela inteira de clientes — nome,
CPF, endereço de todo mundo. Depois desta mudança o portal **não tem
credencial**, então o mesmo ataque leva **uma conta**: a de quem estava logado.

O portal continua com a sessão do Supabase Auth. O que ele perde é o banco.

## 1. Uma rota nova no contrato: `meu-papel`

Descobri escrevendo este prompt que faltava uma. `dashboard/page.tsx` usa
`getUserProfile` para decidir se manda o visitante para o portal, para a fila
do profissional ou para o admin — e isso lê `users.role` no banco.

Crie `POST /api/contrato/paciente/meu-papel`, no mesmo padrão das outras nove.
Devolve **só** `{ role, full_name, client_code }`. Nada mais — não é uma porta
lateral para o perfil.

## 2. O carteiro: `src/lib/contrato/nucleo.ts`

Um único lugar que fala com o núcleo. Ninguém mais faz `fetch` para lá.

```ts
export class NucleoIndisponivel extends Error {}

export async function perguntarAoNucleo<T>(
  pergunta: string,
  corpo?: unknown,
): Promise<T | null>
```

- URL: `${process.env.NUCLEO_URL ?? getAppBaseUrl()}/api/contrato/paciente/${pergunta}`
- Repassa os cookies da requisição (`cookies()` de `next/headers`) — é assim
  que o núcleo sabe quem está perguntando. **O portal não manda user id.**
- `cache: 'no-store'`. Dado de cliente não se guarda em cache compartilhado.
- **401 ou 404 → devolve `null`.** A tela trata: 401 manda para o login, 404 é
  `notFound()`.
- **5xx ou rede caída → lança `NucleoIndisponivel`.**

### Por que 5xx não pode virar `null`

Se o núcleo cair e o carteiro devolver `null`, a tela de pedidos mostra
*"você ainda não tem pedidos"* — e o cliente que comprou ontem acha que o
pedido sumiu. Isso é pior que um erro: é uma mentira plausível.

Toda tela precisa dizer coisas diferentes para **"não tem"** e para **"não
consegui saber agora"**. Use `error.tsx` no diretório do dashboard, com um
texto do tipo *"Não conseguimos carregar seus dados agora. Tente de novo em
alguns minutos."*

## 3. As telas

Trocar `getSql()` por `perguntarAoNucleo()`. **Só a origem do dado muda** — o
JSX, o texto e o visual ficam exatamente como estão.

| Arquivo | Passa a perguntar |
|---|---|
| `dashboard/page.tsx` | `meu-papel` |
| `dashboard/perfil/page.tsx` | `meu-perfil` + `meu-endereco` |
| `dashboard/assinatura/page.tsx` | `minha-assinatura` + `meus-pagamentos` |
| `dashboard/pedidos/page.tsx` | `meus-pedidos` |
| `dashboard/pedidos/[id]/page.tsx` | `meu-pedido` |

Em `pedidos/[id]`, `null` vira `notFound()` — o mesmo 404 que o contrato
devolve para pedido de outro dono. O cliente curioso vê a tela de "não
encontrado", igualzinha à de um id que nunca existiu.

## 4. Os dois formulários

- `ProfileForm.tsx`: `/api/perfil/atualizar` → **duas** chamadas,
  `/api/contrato/paciente/atualizar-perfil` e `.../salvar-endereco`.
- `AssinaturaClient.tsx`: `/api/assinatura/cancelar` →
  `/api/contrato/paciente/cancelar-assinatura`.

São chamadas do navegador para a mesma origem — o ALB entrega no núcleo, os
cookies vão junto. Não precisa de proxy no portal.

A consulta de CEP no ViaCEP continua como está.

## 5. Apagar o que ficou para trás

Depois que os formulários estiverem repontados:

- `src/app/api/perfil/atualizar/route.ts`
- `src/app/api/assinatura/cancelar/route.ts`

São os únicos arquivos nesses dois diretórios. Rota que ninguém chama mas
continua aceitando requisição é superfície de ataque de graça.

## O que NÃO fazer

- **Não mexa no admin nem no profissional.** Eles continuam lendo o banco
  direto — é o lugar deles, ficam no núcleo.
- **Não mexa no `middleware.ts`.** Ele só chama `getUserProfile` em caminho de
  admin/profissional, e o portal não serve esses caminhos. Conferi.
- **Não crie serviço no ECS, regra de ALB nem task definition.** Meu.
- **Não invente rota de contrato fora das dez.** Faltando dado, **pare e me
  avise** — foi assim que a `meu-papel` apareceu.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. **`grep -rn "@/lib/db\|getSql" "src/app/suplementos/(patient)"` não devolve
   nada.** É este o critério que importa: é ele que permite tirar a credencial.
3. `/api/perfil/atualizar` e `/api/assinatura/cancelar` não existem mais, e
   `grep -rn "api/perfil/atualizar\|api/assinatura/cancelar" src/` está vazio.
4. Existe `error.tsx` no dashboard, e núcleo fora do ar mostra "não consegui
   carregar" — **nunca** "você não tem pedidos".
5. As cinco telas continuam com o mesmo visual e o mesmo texto de antes.

Quando terminar, me chame. Eu subo o portal como serviço próprio, **sem
`DATABASE_URL` nenhuma** — e é aí que a mudança vira real: se sobrar um
`getSql` esquecido, aquela tela quebra na hora, em vez de continuar lendo a
base inteira em silêncio.
