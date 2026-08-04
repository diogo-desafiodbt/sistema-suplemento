# Prompt para o Cursor — Correções do /code-review (9 achados)

Lote de correções apontadas pelo code-review em cima das 4 últimas tarefas
(triagem clínica, comunicação de compra, notificação de frete, suporte por
e-mail). Nenhuma mudança de comportamento nova, só fechar os buracos.

============================================================
PARTE 1 — Profissional/PDF não mostram os dados novos da triagem
============================================================

Hoje `/profissional/protocolo/[id]/page.tsx` e a prescrição em PDF
(`src/lib/pdf/prescription-template.tsx`, gerada em
`src/app/api/prescricao/assinar/route.ts`) só leem os campos antigos do
quiz (`years_diagnosed`, `hba1c_range`, `conditions_serious`,
`allergies`) — que a nova triagem não preenche mais. O médico assina sem
ver renal/hepática/sexo/gravidez, que é justamente o que embasou o
bloqueio de produto.

1.1 — Em `src/app/(professional)/profissional/protocolo/[id]/page.tsx`:
trocar o `select` de `quiz_responses` pra trazer `birth_date, sex,
is_pregnant_or_breastfeeding, renal_conditions, hepatic_conditions,
diagnosis_type, medications` (tirar os campos obsoletos do select). Exibir:
- Idade calculada a partir de `birth_date` (não usar mais `users.birth_date`,
  que nunca foi preenchido em produção — usar o da triagem).
- Sexo, e se marcou gravidez/amamentação.
- Rótulo de `diagnosis_type` incluindo os 2 valores novos (`type1` →
  "Diabetes Tipo 1", `lada_avancado` → "LADA avançado") além dos 3
  existentes.
- Um banner de alerta (visual, cor de atenção) quando
  `renal_conditions.length > 0` ou `hepatic_conditions.length > 0` ou
  `is_pregnant_or_breastfeeding`, listando quais condições foram
  marcadas — é a mesma informação que gerou o bloqueio de produto em
  `triage.ts`, só que exibida aqui pro profissional.

1.2 — Em `src/app/api/prescricao/assinar/route.ts` (linha ~39 e ~75):
mesma troca de campos no select de `quiz_responses`, repassando os novos
campos pro `PrescriptionDocument`.

1.3 — Em `src/lib/pdf/prescription-template.tsx`: atualizar o tipo
`PrescriptionData['quiz']` pra receber `birth_date, sex,
is_pregnant_or_breastfeeding, renal_conditions, hepatic_conditions`.
Remover de vez o hack `data.quiz.allergies?.startsWith('idade:')` (linhas
154-160) — isso era do mini-triagem antigo, não existe mais. Substituir
"Tempo de diagnóstico" por idade calculada + as condições renais/hepáticas
(se houver), no mesmo padrão de seção que já existe. Atualizar
`diagnosisLabel` (linha ~121) com `type1` e `lada_avancado`.

============================================================
PARTE 2 — Suporte pode achar o cliente errado (ILIKE sem escape)
============================================================

Em `src/lib/support/identify.ts`, a busca por e-mail usa
`.ilike('email', email)` sem escapar `%`/`_`, que são coringas válidos em
e-mail real (`joao_silva@gmail.com` pode casar com `joaoxsilva@gmail.com`).
Trocar por comparação exata case-insensitive — normalizar os dois lados
pra minúsculo e usar `.eq('email', email.toLowerCase())` (a coluna
`users.email` já deve estar salva em minúsculo; se não estiver
garantido, aplicar `lower()` nos dois lados via `.eq()` ou uma coluna
computada — não usar `ilike` com o valor bruto do jeito que está).

============================================================
PARTE 3 — Duplicidade em pharmacy-order (corrida cartão + webhook)
============================================================

Desde que `checkout/create/route.ts` passou a emitir
`pagamento/confirmado` também no cartão (além do webhook do Pagar.me),
existe janela real pra `pharmacy-order.ts` criar 2 pedidos pro mesmo
pagamento — o `priorOrder` (linha ~175) não impede isso, só alimenta o
campo `clienteExistente`.

3.1 — Migration nova, tabela de idempotência (mesmo padrão já usado em
`shipping_notification_logs`):
```sql
CREATE TABLE public.pharmacy_order_dispatch_logs (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id),
  order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pharmacy_order_dispatch_logs TO service_role;
```

3.2 — Em `pharmacy-order.ts`: antes de criar o pedido, buscar o `payments`
mais recente da `subscription_id` (`order by created_at desc limit 1`,
mesmo padrão já usado em `purchase-confirmed.ts`) e tentar inserir
`{ payment_id: payment.id }` em `pharmacy_order_dispatch_logs` **antes**
de criar o `order`. Se der erro de constraint única (já existe), essa
invocação **para aqui, não cria pedido novo** (idempotente — já foi
processado por outra invocação). Se o insert funcionar, segue criando o
pedido normalmente e, depois, faz um `update` no log gravando o
`order_id` criado.

============================================================
PARTE 4 — Auto-ack do suporte pode sair duplicado
============================================================

Em `support-analyze.ts`, o guard de "só manda uma vez" lê
`auto_ack_sent_at`, decide mandar, e só depois escreve — não é atômico.
Trocar por uma claim atômica via `UPDATE ... WHERE auto_ack_sent_at IS
NULL RETURNING id`:
```ts
const { data: claimed } = await admin
  .from('support_threads')
  .update({ auto_ack_sent_at: new Date().toISOString() })
  .eq('id', threadId)
  .is('auto_ack_sent_at', null)
  .select('id')
  .maybeSingle()

if (claimed) {
  // só quem ganhou a claim manda o e-mail
  await sendGenericAck(...)
}
```
Se `claimed` vier vazio, outra invocação já reivindicou — não manda de
novo.

============================================================
PARTE 5 — E-mail de compra confirmada: mesma corrida + falso positivo
============================================================

Em `purchase-confirmed.ts`, a checagem de duplicidade por janela de 15
min (`user_id` + `type` + `gte(created_at, ...)`) tem dois problemas: não
é atômica (mesma corrida cartão+webhook pode passar pelos dois lados
antes de qualquer um gravar), e engole por engano uma segunda compra
legítima feita em menos de 15 minutos. Trocar pelo mesmo padrão da Parte
3, ligado ao pagamento específico em vez de janela de tempo:

5.1 — Migration:
```sql
CREATE TABLE public.purchase_confirmation_logs (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.purchase_confirmation_logs TO service_role;
```

5.2 — Em `purchase-confirmed.ts`: em vez do `SELECT` de `notification_logs`
por janela de 15 min, tentar inserir `{ payment_id: payment.id }` (o
mesmo `payment` já buscado nesse arquivo) em
`purchase_confirmation_logs` antes de enviar. Erro de constraint única =
já enviado pra esse pagamento específico, não manda de novo. Isso resolve
duplicidade **e** para de bloquear uma segunda compra real dentro de 15
minutos (cada pagamento tem seu próprio e-mail, correto).

============================================================
PARTE 6 — Bug de string vazia + lógica de casamento de produto triplicada
============================================================

Em `src/lib/protocol/triage.ts`, `productKeyFromName` tem um fallback
`label.includes(needle.split(' ')[0])` — se `needle` for vazio,
`''.split(' ')[0]` é `''`, e `qualquerString.includes('')` é sempre
`true` em JS, retornando o primeiro `ProductKey` (`'berberina'`) por
engano em vez de `null`. Corrigir: se `needle.trim() === ''`, retornar
`null` direto, antes de tentar qualquer match.

Além disso, essa mesma lógica de casar nome de produto está
reimplementada de novo em `src/app/(public)/quiz/page.tsx` (~linha 401) e
em `src/lib/protocol/create-from-checkout.ts` (~linha 154). Trocar as
duas por import de `productKeyFromName` (exportar de `triage.ts` se ainda
não estiver exportado) — elimina a duplicação e garante que o fix acima
vale nos 3 lugares de uma vez.

============================================================
PARTE 7 — Mensagem de bloqueio contraditória
============================================================

Em `triage.ts`, `blockReasonForProduct` hoje junta **todos** os motivos
de gates acionados, mesmo os que não restringem aquele produto
específico — gerando texto tipo "liberamos Neuropatia..." na mesma frase
que bloqueia Neuropatia (quando renal + Tipo 1 se cruzam, por exemplo).
Corrigir pra incluir só os motivos dos gates cujo conjunto liberado **não
contém** o produto em questão (ou seja, só os motivos que de fato causam
aquele bloqueio específico).

============================================================
PARTE 8 — Painel de suporte perde pendência antiga da tela
============================================================

Em `src/app/(admin)/admin/suporte/page.tsx`, o `.limit(100)` ordenado por
`last_message_at desc` corta uma conversa antiga ainda pendente
(`aguardando_revisao`/`aguardando_dados`) da tela, mas o lembrete de 12h
continua contando ela sem limite. Separar a query em duas: pendentes
(`status IN ('aguardando_revisao', 'aguardando_dados')`) **sem limite**
(ou um limite bem mais alto, tipo 500), e um histórico de `'respondido'`
separado, esse sim paginado/limitado a 100.

============================================================
PARTE 9 — Evento de rastreio sem id nunca notifica o cliente
============================================================

`src/lib/shipping/notify.ts` ignora (não considera "novo") qualquer
evento de rastreio sem `id`, enquanto `mergeTrackingEvents` (em
`src/lib/shipping/create-label.ts`) ainda mescla esse mesmo evento no
histórico salvo (usando fallback de `JSON.stringify` como chave). Isso
faz o evento aparecer no painel/dashboard mas nunca gerar e-mail.
Alinhar os dois: se `evento.id` vier ausente, usar a mesma chave de
fallback (`JSON.stringify(evento)`) tanto pra decidir "é novo" quanto pra
mesclar — tratando os dois lugares de forma consistente.

============================================================
NOTAS
============================================================

- Rodar `npm run build`/typecheck no final, igual sempre.
- As 2 tabelas novas (`pharmacy_order_dispatch_logs`,
  `purchase_confirmation_logs`) seguem exatamente o padrão de
  `shipping_notification_logs` que já existe — mesmo `service_role` grant,
  mesma ideia de "insere primeiro, só manda se o insert não colidir".
- Depois de aplicado, ainda falta eu rodar as migrations novas no
  Supabase.
