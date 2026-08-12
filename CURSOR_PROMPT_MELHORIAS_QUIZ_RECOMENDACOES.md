# 8 melhorias de texto/UX — landing, quiz, recomendações, carregando, checkout

Trate como oito tarefas independentes, uma de cada vez, cada uma com seu próprio commit.

---

## PARTE 1 — Copy da landing (`src/app/suplementos/page.tsx`)

Linha 157, dentro de `howItWorks`, primeiro item (`step: 1`, `title: 'Questionário'`):

- Trocar `detail: 'Responde a triagem clínica, sem ver produto antes.'` por:
  `detail: 'Responde a triagem clínica para selecionarmos os melhores suplementos para você.'`

---

## PARTE 2 — Quiz: opção "nenhum medicamento" vira a primeira

Arquivo: `src/app/(public)/quiz/page.tsx`, case `'medicamentos'` (por volta da linha 832-868).

Hoje a ordem de renderização é: `MEDICATION_OPTIONS.map(...)` primeiro, depois o `CheckOption` de "Não utilizo nenhum medicamento" por último.

**Mudança**: só reordenar o JSX — mover o bloco do `CheckOption` "Não utilizo nenhum medicamento" (linhas 855-866) pra **antes** do `{MEDICATION_OPTIONS.map((opt) => (...))}` (linha 847). Não mexer em `toggleMedication`, em `MEDICATION_OPTIONS`, nem em nenhuma lógica de estado — é só a ordem visual dos itens dentro do `QuestionWrapper`.

---

## PARTE 3 — Quiz: redesenhar a pergunta de alergias

Arquivo: `src/app/(public)/quiz/page.tsx`, case `'alergias'` (por volta da linha 870-949).

### 3.1 — Título e subtítulo
- `title="Você tem alergia a algum ingrediente?"` → `title="Você tem alergia a algum suplemento?"`
- `subtitle="Confira a composição de cada fórmula e marque as que têm algum ingrediente ao qual você é alérgico. Opcional — deixe tudo desmarcado se não tiver alergias."` → `subtitle="Confira abaixo os compostos que poderão fazer parte da sua suplementação e informe caso tenha alergia a algum deles."`

### 3.2 — Nova opção "Não tenho alergia a suplementos" como primeiro item
Antes do `.map` sobre `ALLERGY_SUPPLEMENTS` (linha 883), adicionar um card no mesmo estilo visual dos existentes (mesmo componente/classe do botão que already existe pra cada fórmula, não precisa reinventar), com:
- Texto: "Não tenho alergia a suplementos"
- `selected` = `form.allergic_supplement_slugs.length === 0` (não precisa de campo novo no `TriageForm` — a ausência de qualquer slug selecionado já significa "sem alergia", que é o comportamento atual por padrão)
- `onClick`: `setForm((prev) => ({ ...prev, allergic_supplement_slugs: [] }))` — limpa qualquer seleção anterior de composto

### 3.3 — Renomear "Fórmula N" para "COMPOSTOS A/B/C/D" e remover mg/forma de manipulação
**Importante**: isso é só a tela de alergia do quiz. **Não mexer** em `src/lib/supplements-content.ts` (composição real com mg, usada nas páginas de produto/prescrição) — os nomes simplificados abaixo são exclusivos dessa tela, pra não expor dosagem/forma de manipulação ao paciente antes da avaliação profissional.

Criar um mapeamento local no topo do arquivo (perto de `ALLERGY_SUPPLEMENTS`, linha ~43-49), associando cada `slug` a uma letra e a uma lista de nomes simplificados de ingrediente (sem dose, sem "HCl"/"padronizado"/etc — só o nome do princípio ativo em linguagem simples):

```ts
const ALLERGY_COMPOSTOS: Record<
  string,
  { letter: string; ingredients: string[] }
> = {
  neuropatia: {
    letter: 'A',
    ingredients: [
      'Vitamina B1',
      'Ácido Alfa Lipóico',
      'Acetil-L-Carnitina',
      'Vitamina B6',
    ],
  },
  'resistencia-insulina': {
    letter: 'B',
    ingredients: ['Ácido R-Alfa Lipóico', 'Melão de São Caetano', 'Canela'],
  },
  berberina: {
    letter: 'C',
    ingredients: ['Berberina', 'Gymnema sylvestre', 'Cromo'],
  },
  polivitaminico: {
    letter: 'D',
    ingredients: [
      'Vitamina B12',
      'Vitamina B9',
      'Zinco',
      'Magnésio',
      'Vitamina D3',
      'Vitamina K2',
    ],
  },
}
```

No `.map` sobre `ALLERGY_SUPPLEMENTS` (linha 883 em diante):
- Trocar o label `Fórmula {idx + 1} — tenho alergia a algum ingrediente` (linha 930) por `` `COMPOSTOS ${ALLERGY_COMPOSTOS[supp.slug]?.letter} — Marque se tiver alergia a algum destes componentes` ``
- Trocar o `<ul>` que hoje itera `supp.composition` mostrando `{c.ativo}{c.dose ? ' — ' + c.dose : ''}` (linhas 933-943) por uma lista iterando `ALLERGY_COMPOSTOS[supp.slug]?.ingredients ?? []` — só o nome, sem dose.
- O resto da estrutura (card clicável, checkbox visual, `toggleAllergicSupplement`) continua igual, é só o texto/label e a fonte dos ingredientes que mudam.

**Conferir no final**: nenhuma dose ("mg", "mcg", "UI") aparece mais nessa tela.

---

## PARTE 4 — Recomendações: nomes de exibição e ingredientes-resumo

Arquivo: `src/app/(public)/recomendacoes/page.tsx`.

**Escopo importante**: isso é uma troca **só de exibição nessa tela**. `item.product_name` vem do banco (`products.name`, o mesmo nome usado em `PRODUCT_NAME_BY_KEY` em `src/lib/protocol/triage.ts`, no checkout, na prescrição e na integração com a farmácia). **Não renomear o produto no banco nem em `PRODUCT_NAME_BY_KEY`** — isso quebraria o casamento de nome usado em várias partes do sistema. Em vez disso, criar um mapeamento local nessa página.

Perto do topo do arquivo, um `const`:

```ts
const RECOMENDACOES_DISPLAY: Record<
  string,
  { name: string; ingredients: string }
> = {
  'Neuro Complex': {
    name: 'Neuropatia Complex',
    ingredients:
      'Benfotiamina (B1) + Ácido Alfa Lipóico + Acetil-L-Carnitina + Piridoxina (B6)',
  },
  'R-Alpha Lipoic Complex': {
    name: 'Resistência à Insulina Complex',
    ingredients: 'Ácido R-Alfa Lipóico + Canela + Melão de São Caetano',
  },
  'Berberine Complex': {
    name: 'Glicose Complex',
    ingredients: 'Berberina + Gymnema + Picolinato de Cromo',
  },
  'Metabolic Multivit': {
    name: 'Multivitamínico Complex',
    ingredients:
      'Magnésio + D3 + K2 + Metilcobalamina (B12) + Metilfolato (B9) + Zinco',
  },
}
```

No card de cada item (por volta da linha 356-370), onde hoje renderiza `{item.product_name}` (linha 360) sozinho:
- Trocar por `RECOMENDACOES_DISPLAY[item.product_name]?.name ?? item.product_name` (fallback pro nome original se não estiver no mapa, ex. Ômega 3)
- Logo abaixo do parágrafo de `item.activation_reason` (linha 368-370), adicionar uma linha nova, menor/mais discreta (ex. `text-xs text-[#13244f]/60`), mostrando `RECOMENDACOES_DISPLAY[item.product_name]?.ingredients`, só se existir no mapa.

---

## PARTE 5 — Recomendações: copy "já selecionamos"

Arquivo: `src/app/(public)/recomendacoes/page.tsx`, linhas 297-301.

Trocar todo o bloco:
```tsx
<p className="text-[#13244f]/70 text-sm mt-3">
  {activeItems.length === 1
    ? 'Já selecionamos o suplemento para seu perfil.'
    : `Já selecionamos os ${activeItems.length} suplementos para seu perfil.`}
</p>
```
por:
```tsx
<p className="text-[#13244f]/70 text-sm mt-3">
  Selecionamos o mais recomendado para seu perfil, mas você pode adicionar outros se quiser.
</p>
```
(mesmo texto independente da quantidade de itens — não precisa mais do condicional singular/plural)

---

## PARTE 6 — Recomendações: permitir mais de 1 unidade do mesmo produto

Arquivo: `src/app/(public)/recomendacoes/page.tsx`.

O campo `quantity` já existe em `LocalProtocolItem`, o preço já multiplica por `qty` (`getPrice`, linha 158-163), o nome já mostra `{qty}×` quando `qty > 1` (linha 359), e o back-end (`src/lib/checkout/price.ts`, `computeServerCheckoutTotal`) já valida e recalcula tudo certo para `quantity` de 1 a 20, inclusive dimensão/peso do pacote de frete. **Falta só a UI pra alterar a quantidade** — hoje não existe nenhum jeito do usuário mudar esse número.

1. Adicionar uma função `setQuantity(productId: string, delta: number)` perto de `toggleItem` (linha 148-156):
   ```ts
   function setQuantity(productId: string, delta: number) {
     setItems((prev) =>
       prev.map((item) =>
         item.product_id === productId
           ? {
               ...item,
               quantity: Math.min(20, Math.max(1, (item.quantity ?? 1) + delta)),
             }
           : item,
       ),
     )
   }
   ```
2. No card de cada item (por volta da linha 343-395), adicionar um stepper "−  N  +" ao lado do preço (ou abaixo do nome, decisão de vocês pro layout) — só visível quando `isChecked` (item não removido). Botões `type="button"` com `onClick={(e) => { e.preventDefault(); setQuantity(item.product_id, +1 ou -1) }}` — o `preventDefault`/`stopPropagation` é necessário porque o card inteiro é um `<label>` que já tem `onChange` no checkbox; sem isso, clicar no stepper também vai togglear o checkbox.
   - Desabilitar o botão "−" quando `quantity <= 1`.
   - Desabilitar o botão "+" quando `quantity >= 20`.

**Não precisa mexer** em `checkout/page.tsx` nem em nenhuma rota de API — ambos já leem `item.quantity` de `sessionStorage`/payload corretamente.

---

## PARTE 7 — Tela de carregamento: texto institucional mais curto

Arquivo: `src/app/(public)/recomendacoes/carregando/page.tsx`, linha 16-17.

Trocar `INSTITUTIONAL_TEXT` de:
```
'Desenvolvido por Dr. Turí Souza, o Desafio Diabetes dispõe de formulações exclusivas, pensadas para a saúde do diabético. Toda nossa produção é feita por uma das maiores farmácias de manipulação do Brasil, com estrutura internacional de insumos e produção de alta capacidade.'
```
para:
```
'Desenvolvido por Dr. Turí Souza, com as maiores farmácias de manipulação do Brasil.'
```

---

## PARTE 8 — Checkout: texto do rodapé conforme o plano escolhido

Arquivo: `src/app/(public)/checkout/page.tsx`, linhas 1247-1249.

Hoje:
```tsx
<div className="bg-[#13244f]/5 rounded-xl px-4 py-3 text-xs text-[#13244f] leading-relaxed">
  Planos flexíveis — cancele, pause ou adie quando quiser
</div>
```

O estado `plan` (`PurchasePlanType`, já usado no componente — ver linha 100) tem dois valores: `'1mes'` (compra única) e `'assinatura_mensal'` (assinatura).

**Mudança**: mostrar essa caixa só quando `plan === 'assinatura_mensal'`, com o texto trocado:
```tsx
{plan === 'assinatura_mensal' && (
  <div className="bg-[#13244f]/5 rounded-xl px-4 py-3 text-xs text-[#13244f] leading-relaxed">
    Assinatura mensal — cancele quando quiser
  </div>
)}
```
Quando `plan === '1mes'`, a caixa inteira some (não mostrar nenhum texto no lugar).

---

## Depois de aplicar

Rodar `npm run build` (ou `npx tsc --noEmit` + `npx biome check .`, o que for mais rápido) pra garantir que nada quebrou. Testar manualmente: fluxo completo landing → quiz (medicamentos + alergias) → carregando → recomendações (nomes, ingredientes, quantidade, copy) → checkout (compra única esconde o texto, assinatura mostra o texto novo).
