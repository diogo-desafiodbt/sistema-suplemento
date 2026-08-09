# Ajustes em recomendações, quiz e checkout

## Parte 1 — `src/app/(public)/recomendacoes/page.tsx`

**1a. Reverter a seleção "2 mais baratos" pra usar a triagem clínica real.** A função `markTwoCheapest` (marca os 2 produtos de menor preço como obrigatórios) substitui a determinação clínica de `is_required`/`activation_reason` que vem da triagem. Remover `markTwoCheapest` e o recálculo equivalente em `handleContinue` — usar direto o `is_required`/`activation_reason` que já vem em `protocol_items` (que reflete a avaliação real da triagem em `quiz/page.tsx`). O checkbox de toggle continua existindo pros itens complementares (não obrigatórios), igual era antes de `markTwoCheapest` ser introduzido.

**1b. Trocar "protocolo" por "suplemento" no texto da tela.** Ex.: "Este é o protocolo prescrito para você" → algo como "Estes são os suplementos indicados para você"; "Seu protocolo" no header/breadcrumb → "Seus suplementos". Não precisa mudar nomes de variáveis/campos internos (`protocol_items`, `protocolId` etc.) — só o texto visível.

**1c. Trocar o texto de avaliação.** De:
```
Avaliado por um profissional habilitado do Desafio Diabetes.
```
Para:
```
De acordo com suas respostas, selecionamos os seguintes suplementos*.
```
(O `*` sugere uma nota de rodapé — se fizer sentido no layout, adicionar uma nota pequena tipo "* A composição final passa por avaliação de um profissional habilitado antes da liberação." Se não couber bem, tudo bem deixar só a frase principal — mas a avaliação profissional em si continua acontecendo no fluxo, só não aparece mais essa frase específica aqui.)

**1d. Botão**: "Garantir meu protocolo" → "Garantir meus suplementos".

**1e. Frase que varia com a quantidade.** Hoje (ou variação próxima) tem algo como "Já selecionamos os suplementos para seu perfil" fixo — trocar pra variar com `activeItems.length`:
- 1 item: "Já selecionamos o suplemento para seu perfil."
- 2+ itens: "Já selecionamos os N suplementos para seu perfil." (N = quantidade)

**1f. "Cancele quando quiser"** — não mexer, é verdade de novo com a assinatura recorrente voltando (ver `CURSOR_PROMPT_PLANOS_ASSINATURA.md`).

## Parte 2 — `src/app/(public)/quiz/page.tsx`

**2a. Bug real — etapa de medicamentos sem opção "nenhum".** A etapa `case 'medicamentos'` exige `form.medications.length > 0` pra habilitar o botão continuar (`continueDisabled={form.medications.length === 0}`), mas não tem nenhuma opção de "não uso nenhum medicamento" — isso trava completamente quem não usa medicação, sem conseguir nem terminar o quiz. Seguir o mesmo padrão já usado em `renal`/`hepatica` (que já têm "Nenhuma das anteriores" funcionando): adicionar um estado `medications_none: boolean` no `TriageForm`, um `CheckOption` "Não utilizo nenhum medicamento" que seta `medications_none: true` e limpa `form.medications`, e trocar `continueDisabled` pra `!form.medications_none && form.medications.length === 0`.

**2b. Pergunta de alergias, mostrando os ingredientes de cada suplemento.** Adicionar uma nova etapa no quiz (`'alergias'`) perguntando sobre alergias, listando todos os ativos/composição dos 4 suplementos do catálogo (usar os dados de `supplements-content.ts`, já atualizado no prompt de catálogo) pra pessoa conferir se tem alergia a algum. Formato sugerido: lista expansível por suplemento (nome do suplemento + lista de ativos), com um campo de texto livre "Tem alergia a algum desses ingredientes ou a outra substância? Descreva aqui" (opcional, sem bloquear o "continuar" — a resposta é informativa, vai pro campo `allergies` que já existe no schema de `quiz_responses`/na geração do PDF de prescrição, só nunca foi coletado por uma pergunta de fato). Posicionar essa etapa perto do fim, junto com medicamentos (dados de mesma natureza — "o que você usa/tem contato").

## Parte 3 — `src/app/(public)/checkout/page.tsx`

**3a. Remover o card "Atenção, [nome]."** — o bloco `{step >= 4 && (<aside className="rounded-2xl bg-[#13244f] ...">...)}` que tem a foto do Dr. Turí, badge "Antes de pagar", título "Atenção, [nome]." e os parágrafos sobre a formulação/"atelier farmacêutico"/reversão. Remover o bloco inteiro (do `{step >= 4 && (` até o `)}` correspondente, incluindo a linha de badges "Farmácia credenciada ANVISA"/"Preparado lote a lote" no final dele).

**3b. Remover "Entrega discreta direto na sua porta"** da lista de selos de confiança (perto do botão de pagamento, array junto com "Cancele quando quiser" — essa frase fica, só a de entrega sai).

## Não mexer

- Lógica de pagamento/parcelamento em si (`checkout/create/route.ts`) — isso é o `CURSOR_PROMPT_PLANOS_ASSINATURA.md`, prompt separado.
- Catálogo de produtos (`supplements-content.ts`, `triage.ts`) — isso é o `CURSOR_PROMPT_CATALOGO_PRODUTOS.md`, prompt separado. Se os dois forem aplicados na mesma sessão do Cursor, aplicar o de catálogo primeiro.

## Depois de aplicar

- `npx tsc --noEmit`
- `npm run build`
- Testar o quiz completo pra alguém sem nenhum medicamento (confirmar que não trava mais), e a nova pergunta de alergias aparecendo com os ingredientes certos.
- Testar recomendações com 1 item e com vários, conferindo a frase variando.
