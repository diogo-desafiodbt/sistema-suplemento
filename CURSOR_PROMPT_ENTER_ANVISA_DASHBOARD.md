# Três mudanças no sistema-suplemento

Trate como três tarefas independentes, uma de cada vez, cada uma com seu próprio commit.

## PARTE 1 — Enter avança o quiz

Arquivo: `src/app/(public)/quiz/page.tsx`
Componente: `QuestionWrapper` (por volta da linha 246-310)

Hoje o botão "Continuar" é `<button type="button" onClick={onContinue}>` dentro de uma `<div>`, sem `<form>`. Por isso Enter não faz nada nos passos com `<input>` de texto (ex: "nome", "idade").

**Mudança**: envolver o conteúdo de `QuestionWrapper` (children + botões) num `<form onSubmit={...}>`, e trocar o botão de Continuar pra `type="submit"`.

- No `onSubmit` do form: `e.preventDefault(); if (!continueDisabled && !loading) onContinue?.()`
- O botão "Voltar" continua `type="button"` (não deve disparar submit).
- Não precisa de keydown manual em lugar nenhum — é o comportamento nativo do `<form>`: Enter dentro de um `<input>` de texto já dispara submit automaticamente.
- Não mexer nos passos que usam OptionButton/CheckOption sem `showContinue` (ex: "sexo", "gestacao") — esses já avançam sozinhos no clique (`setTimeout(goNext, 120)`), Enter não se aplica a eles.
- Para os passos com `showContinue` que usam só CheckOption (ex: "renal"), o form também resolve: se o foco cair num campo de texto ou fora de um botão, Enter agora funciona. Focando um CheckOption em si, Enter continua só selecionando aquele item (comportamento nativo de `<button type="button">` dentro de form — não dispara submit) — isso é esperado, não é bug.

**Testar depois**: passo "nome" e "idade" (digitar + Enter deve avançar quando válido), e confirmar que nenhum passo de múltipla escolha passou a avançar sozinho sem clique.

---

## PARTE 2 — Trocar "farmácia credenciada ANVISA" pela nova frase

Nova frase de referência: "formulações produzidas pelas maiores farmácias de manipulação do Brasil, com estrutura de insumo internacional e presença no Brasil inteiro" — adaptar o comprimento/gramática pra cada contexto abaixo, mantendo o sentido. **NÃO tocar em `src/lib/terms/content.ts`** (Termos de Uso) — ali "registrada na ANVISA" é conteúdo legal, fica de fora até o Diogo confirmar separadamente.

1. `src/app/suplementos/page.tsx:10-11` (objeto `benefits`, primeiro item)
   - `title: 'Farmácia autorizada pela Anvisa'` → `'Maiores farmácias de manipulação do Brasil'`
   - `detail: 'Elaborados e vendidos por farmácias de manipulação credenciadas.'` → `'Elaborados pelas maiores farmácias de manipulação do Brasil, com estrutura de insumo internacional e presença no Brasil inteiro.'`

2. `src/app/suplementos/page.tsx:433` (bullet da lista comparativa)
   - `'Farmácia credenciada pela Anvisa'` → `'Produzido pelas maiores farmácias de manipulação do Brasil'`

3. `src/app/suplementos/[slug]/page.tsx:188` (badge curto ao lado de ícone)
   - `<span>Farmácia credenciada ANVISA</span>` → `<span>Maiores farmácias de manipulação do Brasil</span>`

4. `src/app/(public)/checkout/page.tsx:1117` (bullet de confiança no checkout)
   - `'Farmácias credenciadas pela ANVISA'` → `'Formulações das maiores farmácias de manipulação do Brasil'`

5. `src/app/(public)/recomendacoes/page.tsx:60` (resposta de FAQ)
   - `'Farmácias de manipulação credenciadas pela Anvisa, de forma individualizada, conforme a prescrição do seu protocolo.'` → `'Formulações produzidas pelas maiores farmácias de manipulação do Brasil, com estrutura de insumo internacional e presença no Brasil inteiro, de forma individualizada, conforme a prescrição do seu protocolo.'`

6. `src/app/(public)/recomendacoes/page.tsx:613-614` (parágrafo de rodapé)
   - `'— Os suplementos são manipulados e dispensados por farmácias credenciadas pela Anvisa.'` → `'— Os suplementos são manipulados e dispensados pelas maiores farmácias de manipulação do Brasil, com estrutura de insumo internacional e presença no Brasil inteiro.'`

7. `src/app/institucional/page.tsx:130` (desc de card)
   - `'Fórmulas com base em evidências científicas, manipuladas por farmácias parceiras autorizadas pela ANVISA.'` → `'Fórmulas com base em evidências científicas, manipuladas pelas maiores farmácias de manipulação do Brasil, com estrutura de insumo internacional.'`

8. `src/app/institucional/page.tsx:559` (bullet da lista comparativa)
   - `'Farmácia credenciada ANVISA'` → `'Produzido pelas maiores farmácias de manipulação do Brasil'`

9. `src/app/institucional/page.tsx:862-889` (seção dedicada — ver contexto completo no arquivo antes de editar)
   - Comentário `{/* ── ANVISA ── */}` → pode renomear pra `{/* ── Farmácias parceiras ── */}` (só organização, não é conteúdo)
   - h3 "Farmácias credenciadas ANVISA" → "Formulações produzidas em todo o Brasil"
   - parágrafo "O Desafio Diabetes não é uma farmácia. Todos os suplementos são manipulados por farmácias credenciadas de acordo com as normas da ANVISA." → "O Desafio Diabetes não é uma farmácia. Todas as formulações são produzidas pelas maiores farmácias de manipulação do Brasil, com estrutura de insumo internacional e presença em todo o país."
   - **NÃO mexer** no botão "Cadastre-se como farmácia credenciada Desafio Diabetes →" (linha ~895) — é recrutamento de farmácia parceira B2B, função diferente do claim de confiança pro paciente.

10. `src/components/Footer.tsx:121-122` (linha de rodapé do site inteiro)
    - `'O Desafio Diabetes não é uma farmácia. Suplementos manipulados por farmácias credenciadas pela ANVISA.'` → `'O Desafio Diabetes não é uma farmácia. Formulações produzidas pelas maiores farmácias de manipulação do Brasil, com estrutura de insumo internacional e presença no Brasil inteiro.'`

Rodar `grep -rn "ANVISA\|Anvisa" src` no final pra confirmar que só sobrou o que está em `src/lib/terms/content.ts`.

---

## PARTE 3 — Simplificar a área do paciente pra histórico + entrega

A timeline de rastreio no estilo Mercado Livre **já existe e já funciona**: `src/app/(patient)/dashboard/pedidos/[id]/page.tsx` linhas 309-346 — renderiza os eventos reais de `eventos.descricao`/`local`/`cidade`/`datahora` vindos de `orders.shipping_json` (populado pelo webhook de rastreamento da Envie Agora). Não precisa recriar isso, só limpar o resto ao redor.

1. Remover as rotas (deletar as pastas inteiras):
   - `src/app/(patient)/dashboard/dieta/`
   - `src/app/(patient)/dashboard/guia/`
   - `src/app/(patient)/dashboard/semana/`
   - `src/app/(patient)/dashboard/assinatura/`
   - `src/app/(patient)/dashboard/perfil/`
   - `src/app/(patient)/dashboard/protocolo/`

   Confirmar antes que nada em `src/app/api/assinatura/cancelar` ou `src/components/patient/AssinaturaClient.tsx` / `ProfileForm.tsx` é importado só por essas páginas — se for, também remover; se algo mais importar, avisar em vez de apagar.

2. `src/app/(patient)/dashboard/page.tsx` — hoje mostra "Meu Protocolo". Trocar por um redirect direto pra `/dashboard/pedidos` (mesmo padrão de redirect que já existe ali pra `role === 'professional'`/`'admin'`, linha ~38-39: `if (profile?.role === 'professional') redirect(...)`).

3. `src/components/patient/DashboardNav.tsx` — hoje tem 6 abas. Reduzir o array `tabs` pra só:
   ```
   { label: 'Meus Pedidos', href: '/dashboard/pedidos' }
   ```
   Com só uma aba, avaliar se faz sentido manter o componente de nav (talvez vire só o header, sem tabs — decisão de vocês, não é obrigatório manter `<nav>` pra uma opção só).

4. `src/app/(patient)/dashboard/pedidos/[id]/page.tsx` — adicionar linha de "última atualização" perto do badge de status (por volta da linha 201-206, ao lado de `<span className={...}>{statusMessage}</span>`). Derivar do último evento: `eventos[eventos.length - 1]?.datahora` (a lista já vem ordenada ascendente por data, linha 123-127). Formato sugerido: "Atualizado em DD/MM às HH:mm" — `toLocaleString('pt-BR')` truncado, ou `toLocaleDateString` + `toLocaleTimeString` separados. Se `eventos.length === 0`, não mostrar a linha.

5. `src/app/(patient)/dashboard/pedidos/page.tsx` — mesma lógica de "última atualização" pode entrar em cada card da lista (opcional, avaliar se fica poluído com muitos pedidos na lista vs. só no detalhe).

**ATENÇÃO — confirmar com o Diogo antes de aplicar este item 3**: remover `perfil/` e `assinatura/` tira do paciente qualquer forma de editar dados cadastrais ou cancelar assinatura pelo próprio app. Se não houver outro canal pronto pra isso (suporte por e-mail/WhatsApp), perguntar antes de apagar essas duas pastas especificamente — o resto (dieta/guia/semana/protocolo) pode seguir sem ressalva.
