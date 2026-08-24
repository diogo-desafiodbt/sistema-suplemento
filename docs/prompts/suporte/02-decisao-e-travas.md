# Prompt — Suporte com IA, entrega 2: a decisão e as travas

> Referencie no Cursor com `@02-decisao-e-travas.md`.
> Branch: `reestrutura-suplementos`.
> Fonte: `CURSOR_PROMPT_SUPORTE_AGENTE_IA.md`, partes 4, 5, 6, 7 e 8.
> A entrega 1 está no ar e testada (19 de 22 testes, 24/08/2026).

Esta entrega faz a IA **investigar, decidir e redigir**. Ela ainda **NÃO
envia**: o único caminho de envio continua sendo o botão do Pedro. A chave
geral e o painel são a entrega 3.

Ao terminar cada parte, pare e avise. Não emende as partes.

---

## O que a entrega 1 já deixou pronto (não refaça)

- `identify.ts` — identifica **só pelo remetente**. Testado contra um estranho
  alegando ser conta real: não vinculou.
- `triage.ts` — a IA em quarentena, sem ferramenta nenhuma. Devolve
  `{categoria, tom, urgencia, pergunta_resumida, referencia_citada}`.
- `tools.ts` — as oito ferramentas, com `userId` preso por closure. **Nenhum
  arquivo do sistema as importa ainda. Esta entrega é quem liga.**
- `mailer.ts` — rodapé jurídico colado no ponto de envio, cabeçalhos
  `Auto-Submitted` e `X-Auto-Response-Suppress`.
- `support_access_log` — tabela só-inserção, hoje em zero.
- `buscar_aula(pergunta, minimo)` no banco `conteudo` — 80 vídeos, 2.583
  trechos, devolve título, link e segundo. **Nunca o texto da transcrição.**

---

## Parte A — a migração

```sql
ALTER TABLE public.support_threads
  ADD COLUMN decisao_ia jsonb,
  ADD COLUMN enviado_automaticamente boolean NOT NULL DEFAULT false;
```

`triagem_ia` já existe, não recrie.

Depois de criar, **revogue amplo e conceda estreito**, como no resto do
sistema:

```sql
REVOKE ALL ON public.support_threads FROM app_web;
GRANT SELECT, INSERT, UPDATE ON public.support_threads TO app_web;
```

Confira rodando `SET LOCAL ROLE app_web` dentro de uma transação e tentando
`DELETE` — tem que ser negado. Depois `ROLLBACK`.

---

## Parte B — a investigação

Criar `src/lib/support/investigate.ts`.

**Recebe a ficha da triagem, nunca o texto do e-mail.** É o ponto inteiro da
divisão. Se você passar `threadText` aqui por conveniência, o desenho inteiro
perde o sentido e o trabalho da entrega 1 vai junto.

```ts
const finalMessage = await client.beta.messages.toolRunner({
  model: MODELO_SUPORTE,
  max_tokens: 8000,
  output_config: { effort: 'medium' },
  tools: criarFerramentas(userId),
  max_iterations: 8,
  messages: [{ role: 'user', content: montarPromptDeInvestigacao(triagem) }],
})
```

O prompt instrui, com estas palavras: *"Investigue o necessário usando as
ferramentas. Não invente nenhum dado — se uma informação não veio de uma
ferramenta, ela não existe."*

`userId` vem do `thread.user_id` resolvido no servidor. **Nunca de parâmetro
de ferramenta, nunca do texto.**

---

## Parte C — a decisão tipada

Segunda chamada, com saída estruturada:

```ts
const Decisao = z.object({
  pode_resolver_sozinho: z.boolean(),
  motivo_escalonamento: z.string().nullable(),
  resposta: z.string(),
  dados_usados: z.array(z.string()),
  video_sugerido: z.object({ titulo: z.string(), url: z.string() }).nullable(),
})
```

`dados_usados` lista o que foi consultado. Serve para auditoria e para checar
se a resposta veio de fato real.

**Diga o limite de cada campo de texto dentro do próprio prompt, e trate a
recusa de validação com uma segunda tentativa.** Em 24/08 a triagem morreu em
silêncio porque o esquema limitava `pergunta_resumida` a 200 caracteres e o
modelo nunca soube disso: conversa com duas mensagens estourava, a validação
recusava tudo, e o job se registrava como concluído. Não repita esse caminho
aqui, onde o texto é muito maior.

---

## Parte D — as sete travas

**A decisão da IA não é final.** É condição necessária, não suficiente. O
envio automático só pode acontecer se **todas** forem verdadeiras, checadas em
código, uma por uma, com o motivo da reprovação registrado:

1. `decisao.pode_resolver_sozinho === true`
2. `triagem.categoria` está na lista liberada:
   `['guia','pedido','financeiro','assinatura','produto','conta','institucional']`
3. `thread.user_id` não é nulo
4. `decisao.dados_usados.length > 0`
5. **Nenhum humano respondeu ainda nesta conversa** — ver abaixo
6. `triagem.tom !== 'hostil'`
7. Passou na verificação de saída (Parte F)

Falhou qualquer uma → `aguardando_revisao`, com o rascunho pronto na tela e o
motivo escrito.

### A trava 5 mudou — leia com atenção

A especificação de 13/08 dizia *"é a primeira resposta da thread"*. **O Diogo
trocou isso em 24/08** e a regra nova é:

> A IA responde **enquanto nenhum humano tiver respondido** naquela conversa.

O que importa não é o número da mensagem, é se houve julgamento humano. Uma
vez que o Pedro escreveu, a conversa é dele até o encerramento.

Freio adicional, também dele: **duas respostas da IA e a pessoa voltando uma
terceira vez → escala.** Se ela não resolveu em duas, não vai resolver na
terceira.

Implemente as duas condições. `respostas_automaticas_ia` já existe na tabela.

### Nunca envia texto redigido pela IA, sem exceção

- `prescricao` — sempre Pedro
- `tom: 'hostil'` — sempre Pedro
- cliente não identificado — sempre Pedro
- cancelamento, reembolso, estorno — sempre Pedro

---

## Parte E — pergunta técnica: modelo fixo, a IA não redige

Quando `triagem.categoria === 'tecnico'`, o fluxo é **outro** e não passa pela
Parte C.

Decisão do Diogo (13/08): a equipe, em hipótese alguma, responde pergunta
técnica. A orientação é única — **responder com um link**. Vale para a IA e
para o Pedro igualmente. Escalar não faz sentido: o humano daria a mesma
resposta.

Chamar `buscar_conteudo` e preencher um **modelo fixo em código**:

```
Bom dia, {primeiro_nome}!

O Dr. Turí falou sobre isso nesta aula:
{titulo}
{url}

Equipe Desafio Diabetes
```

Sem resultado na busca → variante que aponta o canal em geral, sem escolher
aula. **Nunca invente um link.**

Isto pode ser enviado automaticamente. A IA não escreve texto nenhum aqui,
então não existe caminho para uma frase de orientação de saúde aparecer. É
forma, não verificação.

**Medido e importante:** a nota da busca **não** protege contra pergunta fora
do acervo. "quando meu pedido chega" pontua 0,295 e "metformina dá efeito
colateral" pontua 0,274 — não existe limiar que separe os dois. **Quem protege
é a categoria da triagem.** Está escrito dentro da própria função no banco.

---

## Parte F — a verificação de saída

Antes de qualquer envio de texto redigido pela IA (não se aplica à Parte E),
uma última leitura **sobre a resposta pronta**, não sobre o e-mail do cliente.

Bloqueia se o texto promete efeito terapêutico, cita medicamento, sugere ou
altera dose, afirma algo sobre condição de saúde, ou interpreta exame.

Bloqueou → `aguardando_revisao`, mesmo com categoria liberada e IA confiante.

---

## Parte G — nada verde sem trabalho feito

Regra desta casa, e a lição mais cara de 24/08: **três defeitos se esconderam
atrás de job registrando `completed` num caminho de desistência.** O poll de
suporte rodou de cinco em cinco minutos por dias sem ler um único e-mail, e
nada apitou.

Em toda saída antecipada que você escrever nesta entrega — falta de
credencial, validação recusada, trava reprovada, ferramenta que falhou —
registre o motivo no payload do job. O vigia já tem a regra 8 que transforma
isso em alerta.

**Nunca registre sucesso num caminho que não fez o trabalho.**

---

## O que NÃO fazer

- **Não envie nada automaticamente.** Mesmo com as sete travas passando, esta
  entrega grava a decisão e o rascunho, e para. A chave geral é a entrega 3.
- Não passe o texto do e-mail para a investigação.
- Não deixe `userId` virar parâmetro de ferramenta.
- Não toque em `protocols`, `protocol_items`, `quiz_responses`,
  `health_records` nem em `users.cpf`.
- Não mexa em `pharmacy_reconciliation` — o Diogo pediu para deixar quieto.
- Não crie serviço novo na AWS. Custo novo precisa da aprovação dele antes.

---

## Critério de pronto

1. A migração aplicada e o `DELETE` negado sob `SET LOCAL ROLE app_web`.
2. Uma conversa de teste percorre triagem → investigação → decisão, e a
   decisão fica gravada em `decisao_ia`.
3. `support_access_log` **deixa de estar em zero**: toda ferramenta chamada
   grava linha com quais campos foram lidos. Este é o teste 20, que ficou
   pendente na entrega 1.
4. Uma conversa de categoria `prescricao` termina em `aguardando_revisao`,
   por mais confiante que a IA esteja.
5. Uma conversa `tecnico` produz o modelo fixo com link real do acervo, sem
   uma frase escrita pela IA.
6. `enviado_automaticamente` continua `false` em **todas** as conversas ao
   fim dos testes.
7. `grep -rn "sendSupportEmail" src/` continua apontando **um único** chamador:
   a rota do botão do Pedro.
