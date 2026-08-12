# 10 melhorias visuais no funil (landing → quiz → carregamento → recomendações → checkout)

## Regra de ouro em TODAS as partes — performance

Baseline antes dessa mudança: `.next/static/chunks` = 1.6M, `framer-motion` **não** é dependência hoje.

- Animar sempre `transform`/`opacity` — nunca `width`, `top`, `left`, `box-shadow` direto num loop de animação (força recálculo de layout, trava). Se precisar animar tamanho, usar `transform: scale()`.
- Qualquer animação orientada por JS (scroll, mouse) usa `requestAnimationFrame`, nunca listener direto sem controle de frequência (mesmo padrão já usado em `recomendacoes/carregando/page.tsx` — reaproveitar esse padrão em vez de inventar outro).
- Respeitar `prefers-reduced-motion` em toda animação decorativa (reduzir ou remover), igual já feito na tela de carregamento.
- `framer-motion` só entra como dependência se for realmente necessário (Parte 6). Se der pra fazer só com CSS, preferir CSS — menos peso, menos possibilidade de jank.
- No fim, rodar `npm run build` e `du -sh .next/static/chunks` de novo pra comparar com o baseline acima.

## Parte 1 — Bento grid no "Como funciona" e nos benefícios (`suplementos/page.tsx`)

Trocar o grid uniforme (`grid-cols-4` com cards do mesmo tamanho) por um bento — variar `col-span`/`row-span` pra criar hierarquia (ex: primeiro card maior, ocupando 2 colunas). Só CSS Grid, sem biblioteca.

## Parte 2 — View Transitions API entre quiz → carregando → recomendações

Ativar `viewTransition` (Next.js já suporta via `next.config.ts` / API experimental — checar a versão instalada e usar o mecanismo disponível) nas navegações entre essas 3 rotas. Se o navegador não suportar, cai no comportamento padrão sem erro (a API já é projetada pra isso — checar `document.startViewTransition` existe antes de usar, senão só navega normal).

## Parte 3 — Ícones com profundidade 3D em CSS puro (`suplementos/page.tsx`, "Como funciona")

Aplicar `transform: perspective(600px) rotateX()/rotateY()` sutil nos ícones circulares dos cards (hover ou entrada), mesma linguagem visual já usada nas cenas 3D do Remotion (consistência entre vídeo e site). Sem imagem nova, sem lib.

## Parte 4 — Skeleton/shimmer nos estados de carregamento

Trocar texto solto ("Carregando...") por um skeleton com efeito de brilho (`@keyframes shimmer` com `background-position` animado via `transform`, ou gradiente se movendo) em:
- `recomendacoes/page.tsx` (enquanto busca produtos)
- `checkout/page.tsx` (enquanto busca frete)

## Parte 5 — Parallax sutil no hero (`suplementos/page.tsx`)

O círculo desfocado vermelho do hero (`bg-[#ff6666]/40 blur-3xl`) se move a uma velocidade diferente do texto ao rolar. Implementar com CSS (`transform` atualizado via scroll, `requestAnimationFrame`) — nada de biblioteca de parallax pesada.

## Parte 6 — Ícones/curva de glicose animada + número que conta (usa `framer-motion`)

Essa é a única parte que introduz dependência nova. Instalar `framer-motion`.

- **Curva de glicose**: no hero de `suplementos/page.tsx` ou como separador de seção, um SVG de linha (mesmo path do conceito "Curva" que já te mostrei) que se desenha com `stroke-dasharray`/`stroke-dashoffset` ao entrar na viewport (`useInView` do framer-motion, anima uma vez só, não repete).
- **Número que conta**: em `recomendacoes/page.tsx`, quando o `selectedPlan` muda, o valor total e o valor da parcela contam de forma animada em vez de trocar seco (usar `animate`/`useMotionValue` do framer-motion, ou um hook simples de interpolação com `requestAnimationFrame` se quiser evitar a dependência pra esse caso específico — decisão de vocês).

## Parte 7 — Botão com atração magnética no cursor (`recomendacoes/page.tsx`, `checkout/page.tsx` — CTA principal)

Só em desktop (`@media (hover: hover) and (pointer: fine)` — não faz sentido em touch). Listener de `mousemove` na área do botão, desloca o botão sutilmente na direção do cursor via `transform: translate()`, usando `requestAnimationFrame` pra não disparar a cada pixel do mouse. Volta ao normal (`transform: translate(0,0)`) no `mouseleave`.

## Parte 8 — Check animado ao responder cada pergunta do quiz (`quiz/page.tsx`)

Quando uma resposta é confirmada (ex: `OptionButton`/`CheckOption` selecionado), mostrar um ícone de check que se desenha via `stroke-dasharray`/`stroke-dashoffset` (CSS `@keyframes`, sem lib). Só decorativo, não interfere na lógica de avanço já existente.

## Parte 9 — Prova social ao vivo antes do quiz (`suplementos/page.tsx`)

Um contador discreto tipo "X pessoas fizeram a triagem essa semana" perto do CTA do hero ou da seção "Como funciona". Buscar esse número de `funnel_events` (já existe a tabela, usada pra métricas de funil) — contar eventos `quiz_started` dos últimos 7 dias. Não é preciso ser em tempo real via websocket — um fetch no carregamento da página já resolve, sem custo de performance relevante.

## Não mexer

- Lógica de negócio de nenhuma tela (triagem, preços, planos, checkout) — isso é só camada visual/interação por cima do que já existe.
- `recomendacoes/carregando/page.tsx` — já está no padrão certo de animação, serve de referência pras outras partes, não precisa mudar.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- `du -sh .next/static/chunks` — me reportar o número pra eu comparar com o baseline (1.6M).
- Testar com `prefers-reduced-motion` ativado no sistema (System Settings → Accessibility, no Mac) — confirmar que as animações decorativas reduzem/somem, igual já acontece na tela de carregamento.
