# Seção "Como funciona" em `/suplementos`

## O que é

Adicionar uma seção explicando o fluxo, com 4 passos:
1. **Questionário** — responde a triagem clínica, sem ver produto antes.
2. **Avaliação por profissional habilitado** — um profissional do Desafio Diabetes analisa as respostas.
3. **Produção por farmácia de grande porte** — manipulação individualizada, credenciada pela Anvisa.
4. **Entrega na porta de casa** — recebe em casa, sem sair de casa.

## Onde entra

Em `src/app/suplementos/page.tsx`, como uma nova seção — sugiro logo depois do hero (seção 1) e antes de "Por que escolher o Desafio Diabetes" (seção 2), já que explica o processo antes de listar os benefícios. Renumerar os comentários `{/* N — ... */}` das seções seguintes de acordo.

## Sugestão de implementação

Seguir o padrão visual já usado no restante da página (cards brancos com ícone circular navy, títulos `font-display`, fundo alternando `#f5f0eb`/branco entre seções). Layout em grid de 4 colunas (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, igual à seção de benefícios), cada card com:
- Número do passo (1-4) — faz sentido aqui, é uma sequência real que o parecer de compliance exige que fique clara nessa ordem.
- Ícone simples (reaproveitar estilo SVG já usado no array `benefits`).
- Título curto (ex.: "Questionário", "Avaliação profissional", "Produção especializada", "Entrega em casa").
- 1 linha de descrição (usar o texto de cada passo acima).

Uma linha conectando os 4 cards (ex.: borda superior ou um traço horizontal atrás dos números) ajuda a reforçar que é uma sequência, não itens soltos — mas não é obrigatório, só se ficar limpo no layout.

CTA "Descubra sua suplementação ideal" pode ficar no final da seção, reaproveitando o componente `QuizCta` que já existe no arquivo.

## Não mexer

- Seção de depoimentos, hero, comparação glicêmica, CTA final — nenhuma dessas muda nesse prompt.
- `CategoryCarousel`, `Header`, `Footer` — intocados.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
