# Catálogo novo: nomes, fórmulas, preços — e o risco de matching por nome

## Contexto

O banco (`products`) já foi atualizado direto via Supabase — não precisa mexer em migration:

| Produto antigo | Nome novo | Preço mensal novo |
|---|---|---|
| Berberina | **Berberine Complex** | R$ 257,76 |
| Neuropatia | **Neuro Complex** | R$ 305,88 |
| Polivitamínico | **Metabolic Multivit** | R$ 81,96 |
| Resistência à Insulina | **R-Alpha Lipoic Complex** | R$ 231,12 |
| Ômega 3 | (sem mudança de nome/preço, mas ver Parte 3 — sai da lógica) | — |

**Risco técnico real, não é só cosmético**: o sistema casa produto do quiz → carrinho → checkout por **nome**, em vários lugares (`productKeyFromName` em `triage.ts`, `matchSupplementImage` em `recomendacoes/page.tsx` e `checkout/page.tsx`, `matchProduct` em `CategoryCarousel.tsx`). Os nomes novos ("Berberine Complex", "R-Alpha Lipoic Complex", "Metabolic Multivit") não têm nenhuma palavra em comum com os nomes antigos que esse matching usa hoje — o casamento vai falhar silenciosamente (preço errado, imagem errada, ou erro de "produto sem match no catálogo").

**A correção segura**: manter os nomes **idênticos, caractere por caractere** (a comparação já ignora maiúscula/minúscula, mas o resto tem que bater) em 3 lugares:
1. `products.name` no banco — já atualizado.
2. `PRODUCT_NAME_BY_KEY` em `src/lib/protocol/triage.ts`.
3. `name` de cada item em `src/lib/supplements-content.ts`.

Fazendo isso, o primeiro branch de cada função de matching (comparação exata) sempre resolve, e o fallback fuzzy (que quebraria com os nomes novos) nunca precisa ser usado.

## Parte 1 — `src/lib/protocol/triage.ts`

Atualizar `PRODUCT_NAME_BY_KEY` (as *keys* internas — `berberina`, `neuropatia`, `polivitaminico`, `resistencia_insulina` — continuam as mesmas, só o valor/label muda):

```ts
export const PRODUCT_NAME_BY_KEY: Record<ProductKey, string> = {
  berberina: 'Berberine Complex',
  neuropatia: 'Neuro Complex',
  omega3: 'Ômega 3',
  polivitaminico: 'Metabolic Multivit',
  resistencia_insulina: 'R-Alpha Lipoic Complex',
}
```

Não mexer em `ProductKey`, `ALL_PRODUCT_KEYS` (exceto o ajuste da Parte 3) nem na lógica de `computeTriage`/`blockReasonForProduct` — só o label muda.

## Parte 2 — `src/lib/supplements-content.ts`

Atualizar os 4 itens correspondentes (mantendo `slug` como está, só troca `name`, `description`/`headline`, `composition` e `usage`; preço não fica nesse arquivo, vem do banco):

**Berberine Complex** (era Berberina):
- Descrição/headline: "Suporte ao equilíbrio da glicemia e do metabolismo da glicose."
- Composição:
  - Berberina HCl (mín. 97%) — 250 mg
  - Gymnema sylvestre extrato seco padronizado — 150 mg
  - Picolinato de Cromo — 200 mcg
- Modo de uso: "1 dose 2x ao dia. 60 doses."

**R-Alpha Lipoic Complex** (era Resistência à Insulina):
- Descrição/headline: "Suporte à sensibilidade à insulina e ao metabolismo energético."
- Composição:
  - R-Ácido Alfa Lipóico estabilizado (R-ALA / Bio-enhanced R-Lipoic Acid) — 50 mg
  - Melão de São Caetano (Momordica charantia) extrato seco padronizado — 300 mg
  - Canela (Cinnamomum verum ou cassia) extrato seco padronizado — 300 mg
- Modo de uso: "1 dose 2x ao dia. 60 doses."

**Neuro Complex** (era Neuropatia):
- Descrição/headline: "Suporte nutricional à saúde dos nervos."
- Composição:
  - Benfotiamina — 50 mg
  - Ácido Alfa Lipóico — 100 mg
  - Acetil-L-Carnitina HCl — 100 mg
  - Piridoxina (Vitamina B6) — 10 mg
- Modo de uso: "1 dose 2x ao dia. 60 doses."

**Metabolic Multivit** (era Polivitamínico):
- Descrição/headline: "Vitaminas e minerais essenciais para o metabolismo saudável."
- Composição:
  - Vitamina B12 — Metilcobalamina (forma ativa) — 1000 mcg
  - Vitamina B9 — Metilfolato de cálcio — 500 mcg
  - Zinco Bisglicinato Quelado — 10 mg de zinco elementar
  - Magnésio Bisglicinato tamponado — 100 mg de magnésio elementar
  - Vitamina D3 — Colecalciferol microencapsulado — 4000 UI
  - Vitamina K2 — MK-7 — 120 mcg
- Modo de uso: "1 dose ao dia, junto à principal refeição contendo gordura. 30 doses."

O campo `warningNote` do Ômega 3 (aviso de anticoagulante) — remover completamente (ver Parte 4, decisão já tomada apesar do risco clínico real que sinalizei).

## Parte 3 — Ômega 3 sai da lógica (com cuidado — já causou um bug em produção)

**Atenção**: eu (Claude) já tentei desativar o Ômega 3 direto no banco (`is_active = false`) e isso quebrou o quiz inteiro na hora, porque `ALL_PRODUCT_KEYS` em `triage.ts` ainda inclui `'omega3'`, e o loop em `quiz/page.tsx` (~linha 442) lança erro se algum key do `ALL_PRODUCT_KEYS` não tiver produto ativo correspondente:

```ts
for (const key of ALL_PRODUCT_KEYS) {
  const product = productByKey.get(key)
  if (!product) {
    throw new Error(`Produto sem match no catálogo: ${key} (...)`)
  }
  ...
}
```

Já revertido (`is_active = true` de novo) pra não deixar em produção quebrado. **A correção correta é no código, não só no banco**:

1. Remover `'omega3'` de `ALL_PRODUCT_KEYS` em `triage.ts` (a key `omega3` no `ProductKey`/`PRODUCT_NAME_BY_KEY` pode continuar existindo — só não entra mais no array usado pra montar o protocolo).
2. Checar `defaultSuggestion`/`cheapestSuggestion` e qualquer outro lugar que itere `ALL_PRODUCT_KEYS` ou referencie `'omega3'` diretamente (`blockReasonForProduct`, regras de bloqueio) — garantir que nada mais depende de omega3 estar presente.
3. Só depois de validar com `tsc`/`build` que o quiz não quebra mais, eu (Claude) desativo `is_active = false` do Ômega 3 no banco de novo.

**Não apagar o produto nem os dados do Ômega 3** — só sair da lógica ativa. Pode ficar disponível de novo no futuro.

## Parte 4 — Regra de menores (14 a 17 anos)

Confirmado com o Diogo: nessa faixa etária, só **Metabolic Multivit** fica disponível (não mais "polivitamínico + ômega 3" como cogitado antes — já que ômega 3 saiu da lógica pra todo mundo). Isso deve ser implementado em `computeTriage`/`blockReasonForProduct` (`triage.ts`): se `answers.age >= 14 && answers.age < 18`, bloquear todos os produtos exceto `polivitaminico` (key interna, agora rotulado "Metabolic Multivit"). Abaixo de 14, mantém o bloqueio total que já existe (`age < 18` hoje bloqueia tudo — isso muda pra `age < 14` bloquear tudo, e `14 <= age < 18` liberar só o multivitamínico).

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Testar o quiz do início ao fim pra idade adulta (todos os 4 produtos ativos aparecendo com nome/preço/composição corretos) e pra idade 15 (só Metabolic Multivit liberado).
- Me avisar quando terminar — eu desativo o Ômega 3 no banco depois de conferir que o build/teste passou.
