# Prompt para o Cursor — Suporte com IA autônoma (tool use + structured output)

Objetivo: a IA analisa o e-mail do cliente, **consulta o banco por conta
própria** decidindo o que buscar, resolve sozinha o que tiver capacidade de
resolver, e escala para humano o que não tiver.

Isso é uma evolução do que já existe em `src/lib/support/` — não é
reescrita. O `identify.ts`, o `mailer.ts`, o `message-id.ts`, as tabelas
`support_threads`/`support_messages` e a tela `/admin/suporte` continuam.

============================================================
O QUE MUDA CONCEITUALMENTE
============================================================

**Hoje**: `facts.ts` consulta o banco por caminhos fixos por categoria
(frete → busca pedido; pagamento → busca assinatura). A IA recebe um JSON
pronto. Ela não escolhe o que olhar, e tudo que não é frete/pagamento vira
`fora_de_escopo` sem nenhuma consulta.

**Alvo**: a IA recebe **ferramentas** e decide quais chamar, em que ordem e
quantas vezes. Depois devolve um **objeto tipado** com a decisão de resolver
ou escalar.

============================================================
PARTE 0 — Trocar o modelo (obrigatório, e tem armadilha)
============================================================

`src/lib/support/ai.ts` linha 4 usa `claude-sonnet-4-20250514`, que está
**depreciado e se aposenta em 15/06/2026**. Trocar por `claude-opus-5`.

**Armadilha crítica** — no `claude-opus-5` o *thinking* vem **ligado por
padrão** (diferente dos modelos anteriores), e `max_tokens` limita
**thinking + texto da resposta juntos**. O código atual usa
`max_tokens: 64` na classificação: nesse modelo isso **trunca antes de
produzir qualquer saída**.

Sizing novo:
- Investigação com ferramentas: `max_tokens: 8000`
- Decisão + redação: `max_tokens: 4000`

Não usar `budget_tokens` (removido, retorna 400). Não usar `temperature`,
`top_p` nem `top_k` (removidos, retornam 400). Para controlar profundidade,
usar `output_config: { effort: 'medium' }` — suficiente para suporte, e
mais barato que o default `high`.

============================================================
PARTE 1 — Ferramentas de consulta ao banco
============================================================

Criar `src/lib/support/tools.ts` com ferramentas usando `betaZodTool` de
`@anthropic-ai/sdk/helpers/beta/zod` (o SDK 0.115 já instalado tem isso;
o Zod 4.4 também já está no projeto).

Todas as ferramentas são **somente leitura** e recebem o `user_id` já
identificado por `identify.ts` — a IA **nunca** escolhe de qual cliente
buscar dados. O `user_id` entra por closure, não como parâmetro da tool.
Isso é essencial: impede que um e-mail malicioso peça dados de outro
cliente.

Ferramentas a criar:

| Ferramenta | O que retorna |
|---|---|
| `buscar_pedidos` | pedidos do cliente: id, status, valor, data, código de rastreio |
| `buscar_rastreamento` | eventos de entrega de um pedido (`orders.shipping_json.eventos`) |
| `buscar_assinatura` | plano, status, próxima cobrança, expiração |
| `buscar_pagamentos` | histórico: valor, status, data |
| `buscar_status_protocolo` | **apenas** o status (`pending_signature`/`signed`) e a data — **nunca** o conteúdo clínico, itens do protocolo ou respostas do quiz |

A última linha é regra dura: dado clínico não entra no contexto da IA de
suporte. Se a pergunta é clínica, o caminho é escalar para humano, não
buscar o dado.

Descrever cada ferramenta dizendo **quando chamá-la**, não só o que ela
faz — isso melhora bastante a taxa de acerto. Ex.: *"Use quando o cliente
perguntar onde está o pedido, se já foi enviado, ou reclamar de atraso."*

============================================================
PARTE 2 — Fase de investigação (tool runner)
============================================================

Criar `src/lib/support/investigate.ts`. Usa o tool runner do SDK, que roda
o laço agêntico sozinho — chama a API, executa as ferramentas, devolve os
resultados pra IA, repete até ela parar de pedir ferramenta:

```ts
import Anthropic from '@anthropic-ai/sdk'

const finalMessage = await client.beta.messages.toolRunner({
  model: 'claude-opus-5',
  max_tokens: 8000,
  output_config: { effort: 'medium' },
  tools: criarFerramentas(userId),   // closure com o user_id
  messages: [{ role: 'user', content: promptDeInvestigacao }],
})
```

O prompt de investigação instrui: *"Investigue o que for necessário para
responder. Use as ferramentas disponíveis. Não invente nenhum dado — se
uma informação não vier de uma ferramenta, ela não existe."*

Limitar o laço com `max_iterations: 8` para não rodar indefinidamente.

============================================================
PARTE 3 — Fase de decisão (structured output)
============================================================

Segunda chamada, agora com saída tipada. Usar `client.messages.parse()`
com `zodOutputFormat` de `@anthropic-ai/sdk/helpers/zod`:

```ts
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

const DecisaoSuporte = z.object({
  categoria: z.enum([
    'frete', 'pagamento', 'assinatura', 'produto',
    'clinico', 'reclamacao', 'cancelamento', 'outro',
  ]),
  pode_resolver_sozinho: z.boolean(),
  motivo_escalonamento: z.string().nullable(),
  resposta: z.string(),
  dados_usados: z.array(z.string()),
})

const res = await client.messages.parse({
  model: 'claude-opus-5',
  max_tokens: 4000,
  output_config: { format: zodOutputFormat(DecisaoSuporte) },
  messages: [...],
})
const decisao = res.parsed_output   // pode ser null — checar antes de usar
```

`dados_usados` é a lista do que ela consultou — serve pra auditoria e pra
você conferir depois se ela respondeu com base em fato.

============================================================
PARTE 4 — Guardrails (a parte mais importante)
============================================================

**A decisão da IA sobre enviar sozinha NÃO é final.** Ela é uma condição
necessária, não suficiente. O envio automático só acontece se **todas**
estas condições forem verdadeiras, checadas em código:

1. `decisao.pode_resolver_sozinho === true`
2. `decisao.categoria` está na allowlist: `['frete', 'pagamento', 'assinatura']`
3. O cliente foi identificado (`thread.user_id` não é nulo)
4. `decisao.dados_usados.length > 0` — respondeu com base em dado real
5. É a **primeira** resposta da thread (se já houve troca, vai pra humano)

Se qualquer uma falhar → status `aguardando_revisao`, com o rascunho
pronto na tela, exatamente como funciona hoje.

**Nunca envia sozinha, sem exceção:**
- `clinico` — qualquer coisa sobre sintoma, dosagem, contraindicação,
  interação medicamentosa, ou "posso tomar com meu remédio"
- `reclamacao` — cliente insatisfeito, ameaça de Procon, tom hostil
- `cancelamento` — cancelar assinatura, pedir reembolso, estorno
- Cliente não identificado

Estas categorias vão sempre para revisão humana, mesmo que a IA se declare
capaz.

Adicionar coluna na migration para registrar a decisão:

```sql
alter table public.support_threads
  add column decisao_ia jsonb,
  add column enviado_automaticamente boolean not null default false;
```

============================================================
PARTE 5 — Fluxo e tela
============================================================

5.1 — Em `src/lib/inngest/functions/support-analyze.ts`: substituir a
  chamada de `classifySupportThread` + `getDbFacts` + `draftSupportReply`
  pelo novo fluxo (investigar → decidir → aplicar guardrails).

5.2 — Se passar em todos os guardrails: enviar por `sendSupportEmail`,
  marcar `status: 'respondido'` e `enviado_automaticamente: true`.

5.3 — Se não passar: `status: 'aguardando_revisao'` com o rascunho, como
  hoje.

5.4 — Na tela `/admin/suporte`: mostrar em cada card o que a IA decidiu —
  categoria, se resolveu sozinha, e o motivo do escalonamento quando
  houver. Adicionar um filtro/aba para ver as respondidas automaticamente,
  pra você auditar as primeiras semanas.

============================================================
PARTE 6 — Ligar gradualmente (não ligar tudo de uma vez)
============================================================

Adicionar `SUPORTE_ENVIO_AUTOMATICO` no `.env.example`, com três modos:

- `off` (padrão) — nunca envia sozinha, sempre rascunho. **Começar aqui.**
- `shadow` — decide e registra em `decisao_ia`, mas não envia. Permite
  comparar por algumas semanas o que a IA teria enviado com o que o humano
  enviou, sem risco.
- `on` — envia de verdade quando passar nos guardrails.

O modo `shadow` é o que dá confiança pra ligar o `on` depois com dado, não
com fé.

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Modelo antigo (`claude-sonnet-4-20250514`) se aposenta em 15/06/2026 —
  a troca é obrigatória de qualquer forma.
- `ANTHROPIC_API_KEY` já está no `.env.local` e na Vercel.
- Começar em `off`, depois `shadow` por algumas semanas, só então `on`.
- O módulo tem **zero tickets** hoje. Antes de avaliar a IA, precisa
  chegar e-mail em `suporte@desafiodiabetes.com`.
