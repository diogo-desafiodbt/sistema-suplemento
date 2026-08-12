# Padronizar os nomes de exibição dos 4 produtos em todo o app

Nomes finais decididos (nome de EXIBIÇÃO ao paciente/staff — não é o nome real do produto no banco):

| Nome interno (banco / `products.name`) | Nome de exibição novo |
|---|---|
| `Berberine Complex` | **Glicose Control** |
| `R-Alpha Lipoic Complex` | **Resistência à Insulina Complex** |
| `Neuro Complex` | **Neuropatia Support** |
| `Metabolic Multivit` | **Polivitamínico Glicemic** |

Trate como uma tarefa só, um commit — é uma mudança centralizada com vários pontos de aplicação, não faz sentido dividir.

---

## 1. Criar o módulo central de nomes de exibição

Novo arquivo `src/lib/product-display-names.ts`:

```ts
/**
 * Nome de EXIBIÇÃO dos produtos — não é o nome real (`products.name` no banco,
 * usado em PRODUCT_NAME_BY_KEY, checkout, farmácia, prescrição em PDF).
 * Nunca usar esse mapa em lugar que precise casar nome com o banco/farmácia —
 * só pra texto visível ao paciente/staff.
 */
export const PRODUCT_DISPLAY: Record<
  string,
  { name: string; ingredients?: string }
> = {
  'Berberine Complex': {
    name: 'Glicose Control',
    ingredients: 'Berberina + Gymnema + Picolinato de Cromo',
  },
  'R-Alpha Lipoic Complex': {
    name: 'Resistência à Insulina Complex',
    ingredients: 'Ácido R-Alfa Lipóico + Canela + Melão de São Caetano',
  },
  'Neuro Complex': {
    name: 'Neuropatia Support',
    ingredients:
      'Benfotiamina (B1) + Ácido Alfa Lipóico + Acetil-L-Carnitina + Piridoxina (B6)',
  },
  'Metabolic Multivit': {
    name: 'Polivitamínico Glicemic',
    ingredients:
      'Magnésio + D3 + K2 + Metilcobalamina (B12) + Metilfolato (B9) + Zinco',
  },
}

/** Retorna o nome de exibição; cai pro nome original se não estiver mapeado (ex. Ômega 3). */
export function getProductDisplayName(name: string): string {
  return PRODUCT_DISPLAY[name]?.name ?? name
}
```

## 2. `src/app/(public)/recomendacoes/page.tsx`

Já existe um `RECOMENDACOES_DISPLAY` local (criado numa tarefa anterior) com essa mesma forma `{ name, ingredients }`, só que com os nomes antigos (Neuropatia Complex, Glicose Complex, etc — já trocados pra Complex genérico numa rodada anterior). **Remover esse const local** e importar `PRODUCT_DISPLAY` de `@/lib/product-display-names` no lugar, ajustando as duas referências (`RECOMENDACOES_DISPLAY[item.product_name]?.name` e `.ingredients`) pra `PRODUCT_DISPLAY[item.product_name]?.name` / `.ingredients`.

## 3. `src/app/(public)/checkout/page.tsx`

Linha ~1179-1181, no resumo da compra:
```tsx
<p className="text-sm md:text-base font-medium text-[#13244f] truncate">
  {(item.quantity ?? 1) > 1 ? `${item.quantity}× ` : ''}
  {item.product_name}
</p>
```
Importar `getProductDisplayName` de `@/lib/product-display-names` e trocar `{item.product_name}` por `{getProductDisplayName(item.product_name)}`.

## 4. `src/app/suplementos/[slug]/page.tsx`

- Linhas 109, 122, 125: trocar `content.name` por `getProductDisplayName(content.name)` nos três lugares (alt da imagem, kicker, H1). **Não mexer** em `content.headline`/`content.description`/`content.composition` — só o nome.
- Linhas 361, 368 (grid "Você também pode gostar"): trocar `item.name` por `getProductDisplayName(item.name)` nos dois lugares.
- Importar `getProductDisplayName` de `@/lib/product-display-names`.

## 5. `src/components/CategoryCarousel.tsx`

Linha 128 (`matchProduct(products, supplement.name)`) — **não mexer**, precisa continuar usando o nome real pra casar com o produto do banco.

Linhas 142 e 149 (`alt={supplement.name}` e o `<span>{supplement.name}</span>` visível sobre a imagem) — trocar as duas por `getProductDisplayName(supplement.name)`. Importar de `@/lib/product-display-names`.

## 6. `src/app/(patient)/dashboard/pedidos/page.tsx` e `src/app/(patient)/dashboard/pedidos/[id]/page.tsx`

Em ambos os arquivos existe:
```ts
const name = item.products?.name ?? 'Produto'
const image = findSupplementImageByProductName(name)
```
**Não mexer nessas duas linhas** — `findSupplementImageByProductName` precisa do nome real pra casar a imagem.

Logo abaixo, adicionar `const displayName = getProductDisplayName(name)` e trocar o `{name}` que aparece como texto visível (linha 158 em `pedidos/page.tsx`, linha 291 em `pedidos/[id]/page.tsx`) por `{displayName}`. Pode trocar o `alt={name}` também por `alt={displayName}` nos dois lugares (texto alternativo deveria bater com o nome visível). Importar `getProductDisplayName` de `@/lib/product-display-names` nos dois arquivos.

## 7. `src/app/(admin)/admin/clientes/[id]/page.tsx` (Cliente 360 — uso interno da equipe)

Linha 721, dentro do `.map` de `protocol.protocol_items`:
```tsx
{item.products?.name ?? '—'}
```

Aqui é tela de staff, não de paciente — a equipe precisa continuar reconhecendo o nome real do produto/SKU pra falar com a farmácia. **Não trocar só pelo nome de exibição.** Mostrar os dois, nome de exibição em destaque e o nome real pequeno/discreto do lado:

```tsx
<span
  className={
    item.removed_by_patient ? 'line-through text-gray-400' : ''
  }
>
  {item.products?.name
    ? getProductDisplayName(item.products.name)
    : '—'}
  {item.products?.name && (
    <span className="text-gray-400 font-normal">
      {' '}
      ({item.products.name})
    </span>
  )}
</span>
```
Importar `getProductDisplayName` de `@/lib/product-display-names`.

## 8. `src/lib/protocol/triage.ts`

Linhas 134, 146, 154, 165, 176 — frases de `activation_reason` que citam o nome do produto direto no texto (essas frases viram texto visível ao paciente em `item.activation_reason` na tela de recomendações). Trocar o nome citado pelo nome de exibição novo (é troca de string literal, não de lookup):

- `'Entre 14 e 17 anos, liberamos apenas o Metabolic Multivit.'` → `'Entre 14 e 17 anos, liberamos apenas o Polivitamínico Glicemic.'`
- `'Gravidez ou amamentação: por segurança, liberamos apenas o Metabolic Multivit.'` → `'Gravidez ou amamentação: por segurança, liberamos apenas o Polivitamínico Glicemic.'`
- `'Condição renal informada: por segurança, liberamos apenas o Metabolic Multivit.'` → `'Condição renal informada: por segurança, liberamos apenas o Polivitamínico Glicemic.'`
- `'Condição hepática informada: por segurança, liberamos apenas o Metabolic Multivit.'` → `'Condição hepática informada: por segurança, liberamos apenas o Polivitamínico Glicemic.'`
- `'Para esse perfil, liberamos Neuro Complex e Metabolic Multivit.'` → `'Para esse perfil, liberamos Neuropatia Support e Polivitamínico Glicemic.'`

**Não mexer** em `PRODUCT_NAME_BY_KEY` (linhas 35-40) nem em `ProductKey`/`ALL_PRODUCT_KEYS` — isso é o nome real usado pra casar produto com o banco em toda a lógica de triagem/protocolo.

## Fora de escopo — não tocar

- `src/lib/supplements-content.ts` — o campo `name` de cada produto é a fonte real, usada por `matchProduct`/`findSupplementImageByProductName` pra casar produto. Continua com o nome antigo.
- `src/lib/protocol/triage.ts` — `PRODUCT_NAME_BY_KEY` (mapa em si, só as 5 frases de `activation_reason` citadas acima).
- `src/lib/pdf/generator.ts` e `src/lib/pdf/prescription-template.tsx` — prescrição assinada é documento legal/farmácia, usa o nome real do produto, não o de exibição.
- Qualquer coisa em `src/app/api/**` (checkout, farmácia, webhooks) — todos continuam usando `product_name`/`products.name` real pra fechar pedido e falar com a farmácia.

## Depois de aplicar

`npm run build` (ou `tsc --noEmit`) pra garantir que compilou. Rodar `grep -rn "Berberine Complex\|Neuro Complex\|R-Alpha Lipoic Complex\|Metabolic Multivit" src/` no final — só deve sobrar `supplements-content.ts` e `triage.ts` (a definição de `PRODUCT_NAME_BY_KEY`, não mais as frases). Testar visualmente: `/suplementos/berberina` (ou slug equivalente), o carrossel de categorias, o fluxo quiz→recomendações→checkout, `/dashboard/pedidos` do paciente, e a página de cliente no admin.
