# Nova tela de carregamento entre o quiz e as recomendações

## O que é

Hoje o quiz termina e vai direto pra `/recomendacoes`. Adicionar uma tela intermediária, de transição, que fica visível por ~10 segundos, com sensação real de processamento (algo se movendo — barra de progresso, ícones trocando, texto mudando — não uma tela estática com spinner parado), mostrando um texto institucional enquanto isso.

Texto (usar como está — decisão do Diogo, mantendo "Dr." apesar de já termos tirado esse título de outros lugares do site por causa do parecer de compliance; ele decidiu conscientemente manter aqui):

```
Desenvolvido por Dr. Turí Souza, o Desafio Diabetes dispõe de formulações
exclusivas, pensadas para a saúde do diabético. Toda nossa produção é feita
por uma das maiores farmácias de manipulação do Brasil, com estrutura
internacional de insumos e produção de alta capacidade.
```

## Onde entra no fluxo

Entre o fim do `finishTriage()` em `quiz/page.tsx` (depois que `protocol_items`/`triagem_data` são salvos no sessionStorage) e o `router.push('/recomendacoes')`. Pode ser uma rota própria (`/recomendacoes/carregando` ou similar) pra onde o quiz redireciona primeiro, que por sua vez redireciona pra `/recomendacoes` depois do tempo — ou um estado dentro do próprio fluxo do quiz antes do redirect. Escolher o que for mais simples de implementar sem duplicar a lógica de montagem do protocolo.

## Sugestão de implementação (~10s, com movimento)

- Uma barra de progresso que avança de forma não-linear (mais rápido no início, desacelera perto do fim — sensação de "processando de verdade", não uma barra linear de robô).
- 2-3 mensagens de status que trocam ao longo dos 10s (ex.: "Analisando suas respostas..." → "Cruzando com nosso banco de formulações..." → "Montando sua recomendação..."), sincronizadas com o avanço da barra.
- O texto institucional (acima) fica visível o tempo todo, abaixo ou ao lado da barra/mensagens.
- Usar as cores/tipografia já existentes no projeto (`#13244f`, `#f4001e`, `#f5f0eb`, fontes Anton/Poppins já carregadas) — não introduzir paleta nova.
- Respeitar `prefers-reduced-motion` — se o usuário tiver essa preferência ativada no sistema, reduzir/remover a animação (manter só o avanço discreto da barra, sem movimento decorativo extra).

## Não mexer

- A lógica de montagem do `protocolItems`/triagem em `quiz/page.tsx` — só adicionar a tela de transição depois que ela já rodou, não antes.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Testar o fluxo completo: terminar o quiz → ver a tela de carregamento por ~10s com o texto e a animação → cair em `/recomendacoes` normalmente.
