# Prompt para o Cursor — Nova triagem clínica única (substitui quiz completo e mini-triagem)

Contexto: hoje existem dois fluxos de entrada diferentes antes do checkout —
`/quiz` (formulário clínico longo, usado quando o carrinho está vazio, que
gera o protocolo sozinho via `generateProtocol()`) e `/checkout/triagem`
(mini formulário de 3 campos, usado quando a pessoa já monta o carrinho em
`/suplementos`, sem nenhum filtro de segurança). Essa tarefa **substitui os
dois por um único formulário de triagem clínica**, usado em ambos os casos
(carrinho vazio ou cheio), com regras reais de bloqueio por segurança
(idade, gravidez, doença renal, doença hepática, tipo de diabetes).

As perguntas antigas do quiz longo (HbA1c, glicemia de jejum, sintomas,
peso, frequência de exercício, qualidade da dieta, histórico familiar,
tempo de diagnóstico) **saem de circulação** — não fazem mais parte de
nenhum formulário. A partir de agora as únicas perguntas clínicas são as
descritas na Parte 3.

============================================================
PARTE 1 — Migration
============================================================

Nova migration em `supabase/migrations/`, timestamp após a última
(`20260731020000_pharmacy_reconciliation_job_type.sql`):

1.1 — O enum `diagnosis_type` hoje só tem `prediabetes`, `type2`,
`undiagnosed`. Adicionar dois valores novos:
```sql
ALTER TYPE diagnosis_type ADD VALUE IF NOT EXISTS 'type1';
ALTER TYPE diagnosis_type ADD VALUE IF NOT EXISTS 'lada_avancado';
```
IMPORTANTE: em Postgres, `ALTER TYPE ... ADD VALUE` não pode ser usado na
mesma transação em que o valor novo é referenciado (ex.: num `INSERT` ou
`CHECK` que já usa `'type1'`). Se a migration falhar por causa disso,
colocar esses dois `ALTER TYPE` num arquivo de migration próprio, separado
das alterações da Parte 1.2 abaixo.

1.2 — Na tabela `quiz_responses`:
- `years_diagnosed` é hoje `NOT NULL` e não faz mais sentido ser
  obrigatório (a pergunta de tempo de diagnóstico saiu do formulário).
  Tornar nullable: `ALTER TABLE quiz_responses ALTER COLUMN years_diagnosed
  DROP NOT NULL;`
- Adicionar colunas novas:
  - `birth_date date`
  - `sex text` com `CHECK (sex IN ('homem', 'mulher'))`
  - `is_pregnant_or_breastfeeding boolean`
  - `renal_conditions text[] NOT NULL DEFAULT '{}'`
  - `hepatic_conditions text[] NOT NULL DEFAULT '{}'`
- A coluna `medications` já existe e continua sendo usada (lista de
  medicamentos, agora só informativa). As colunas `hba1c_range`,
  `fasting_glucose`, `symptoms`, `conditions_mild`, `conditions_serious`,
  `weight_status`, `exercise_freq`, `diet_quality`, `allergies`,
  `prior_treatment` ficam no banco (não apagar, são histórico de respostas
  antigas) mas deixam de ser preenchidas por qualquer fluxo novo — não
  precisam de migration, já são todas nullable.

============================================================
PARTE 2 — Módulo de regras clínicas (novo)
============================================================

Criar `src/lib/protocol/triage.ts`. Esse módulo concentra toda a lógica de
bloqueio/liberação de produto por segurança clínica, tanto pra quem entra
com carrinho vazio quanto com carrinho cheio.

2.1 — Tipos:
```ts
export type Sex = 'homem' | 'mulher'
export type RenalCondition = 'hemodialise' | 'insuficiencia_renal_aguda' | 'tfg_menor_30'
export type HepaticCondition = 'cirrose' | 'hepatite_ativa' | 'ictericia' | 'esteatose'
export type DiagnosisType = 'type1' | 'type2' | 'prediabetes' | 'lada_avancado' | 'undiagnosed'

export type TriageAnswers = {
  birth_date: string // ISO yyyy-mm-dd
  sex: Sex
  is_pregnant_or_breastfeeding: boolean // sempre false quando sex === 'homem'
  renal_conditions: RenalCondition[]
  hepatic_conditions: HepaticCondition[]
  diagnosis_type: DiagnosisType
  medications: string[] // informativo, não entra em nenhuma regra abaixo
}

export type ProductKey = 'berberina' | 'neuropatia' | 'omega3' | 'polivitaminico' | 'resistencia_insulina'
```

2.2 — Mapa de nome real do produto (tabela `products`, coluna `name`) por
`ProductKey` — usado pra cruzar com os itens do carrinho/protocolo:
```ts
export const PRODUCT_NAME_BY_KEY: Record<ProductKey, string> = {
  berberina: 'Berberina',
  neuropatia: 'Neuropatia',
  omega3: 'Ômega 3',
  polivitaminico: 'Polivitamínico',
  resistencia_insulina: 'Resistência à Insulina',
}
export const ALL_PRODUCT_KEYS: ProductKey[] = ['berberina', 'neuropatia', 'omega3', 'polivitaminico', 'resistencia_insulina']
```
(Casar por nome — mesmo padrão já usado em `recomendacoes/page.tsx` e
`supplements-content.ts`. Não hardcodar UUID de produto.)

2.3 — Função de idade:
```ts
export function calcAge(birthDateIso: string): number { ... }
```

2.4 — Função principal:
```ts
export type TriageResult =
  | { blocked: true; blockReason: string }
  | {
      blocked: false
      allowed: ProductKey[] // interseção de todos os gates acionados (catálogo completo se nenhum)
      triggeredReasons: string[] // motivo de cada gate acionado, pra exibir em recomendacoes
    }

export function computeTriage(answers: TriageAnswers): TriageResult
```

Regras, na ordem:
1. Se `calcAge(answers.birth_date) < 18` → `{ blocked: true, blockReason:
   'Vendemos apenas para maiores de 18 anos.' }`. Nenhuma outra regra roda.
2. Gestação/amamentação (`sex === 'mulher' && is_pregnant_or_breastfeeding`)
   → gate liberando `['omega3', 'polivitaminico']`, motivo: "Gravidez ou
   amamentação: por segurança, liberamos apenas Ômega 3 e Polivitamínico."
3. Doença renal (`renal_conditions.length > 0`) → gate liberando
   `['omega3']`, motivo: "Condição renal informada: por segurança,
   liberamos apenas Ômega 3."
4. Doença hepática — só conta se tiver **algo além de** `'esteatose'`
   (esteatose sozinha não restringe nada) → gate liberando `['omega3']`,
   motivo: "Condição hepática informada: por segurança, liberamos apenas
   Ômega 3."
5. Tipo de diabetes `'type1'` ou `'lada_avancado'` → gate liberando
   `['neuropatia', 'polivitaminico', 'omega3']`, motivo: "Para esse perfil,
   liberamos Neuropatia, Polivitamínico e Ômega 3." (`'type2'`,
   `'prediabetes'` e `'undiagnosed'` **não** acionam esse gate — catálogo
   completo pra eles, exceto se outro gate acima já tiver restringido.)

`allowed` final = interseção de todos os `ProductKey[]` dos gates
acionados. Se nenhum gate foi acionado, `allowed = ALL_PRODUCT_KEYS`.

2.5 — Função de sugestão automática pra carrinho vazio (usa o resultado de
`computeTriage`):
```ts
export function defaultSuggestion(allowed: ProductKey[]): ProductKey[]
```
Tabela de decisão (comparar o `allowed` calculado com estes 4 casos
possíveis, nessa ordem):
- `allowed` é o catálogo completo (nenhum gate acionado) → sugere só
  `['berberina']`.
- `allowed` é exatamente `['omega3']` → sugere `['omega3']`.
- `allowed` é exatamente `['omega3', 'polivitaminico']` (em qualquer ordem)
  → sugere `['omega3', 'polivitaminico']`.
- `allowed` é exatamente `['neuropatia', 'polivitaminico', 'omega3']` (em
  qualquer ordem) → sugere só `['neuropatia']` como base (Polivitamínico e
  Ômega 3 ficam disponíveis pra adicionar, mas não vêm pré-selecionados).
- Qualquer outro caso (não deveria acontecer dado as regras acima) →
  sugere o próprio `allowed` inteiro, como fallback de segurança.

Observação: a Resistência à Insulina não foi mencionada nas regras que o
Diogo passou — ela segue o mesmo tratamento do resto do catálogo (só entra
em `allowed` quando nenhum gate é acionado). Se isso estiver errado, ele
ajusta depois.

============================================================
PARTE 3 — Tela única de triagem (substitui `/quiz` e `/checkout/triagem`)
============================================================

3.1 — Apagar `src/app/(public)/checkout/triagem/page.tsx`.

3.2 — Reescrever `src/app/(public)/quiz/page.tsx` do zero como a nova
triagem clínica (mantém a mesma URL `/quiz`, é o único formulário agora).
Ler o carrinho atual com `useCart()` (igual já fazia a mini-triagem) — se
`items.length > 0`, essa é uma sessão "carrinho cheio"; se vazio, é
"carrinho vazio". A UI de perguntas é a mesma nos dois casos, só muda o que
acontece depois de responder (Parte 3.4).

Perguntas, nesta ordem:

**Dados básicos**
- Nome completo (texto)
- Data de nascimento (date picker)
- Sexo: Homem / Mulher
- Se Sexo = Mulher → "Está grávida ou amamentando?" Sim / Não (some
  completamente se Sexo = Homem, não pergunta, assume `false`)

**Doença renal** (multi-select, pode marcar mais de um ou nenhum)
- Faço hemodiálise
- Tenho Insuficiência Renal Aguda
- Minha Taxa de Filtração Glomerular (TFG) é menor que 30
- Nenhuma das anteriores

**Doença hepática** (multi-select)
- Cirrose
- Hepatite ativa
- Icterícia
- Esteatose
- Nenhuma das anteriores

**Tipo de diabetes** (escolha única)
- Diabetes Tipo 1 (autoimune da infância)
- Diabetes Tipo 2
- Pré-diabetes / Resistência à insulina
- Diabetes LADA avançado (já usa insulina lenta e insulina rápida)
- Nenhum dos anteriores

**Uso de medicamentos** (multi-select, sem nenhuma lógica de bloqueio —
guardar a resposta e seguir):
- Não utilizo nenhum medicamento.
- Insulina (Lantus®, Basaglar®, Toujeo®, Tresiba®, Humulin®, Novolin®,
  Fiasp®, NovoRapid®, Humalog®).
- Metformina (Glifage®, Dimefor®, Glucoformin®).
- Sulfonilureias (Diamicron®, Glicazida®, Amaryl®, Daonil®).
- Inibidores da SGLT-2 (Forxiga®, Jardiance®, Invokana®).
- Gliptinas (Januvia®, Galvus®, Onglyza®, Nesina®, Trayenta®).
- Pioglitazona (Actos®).
- Agonistas do GLP-1 (Ozempic®, Wegovy®, Mounjaro®, Trulicity®, Victoza®).
- Anticoagulantes e antiagregantes plaquetários (Marevan®, Xarelto®,
  Eliquis®, Pradaxa®, Plavix®, AAS®).
- Medicamentos para pressão arterial.
- Medicamentos para colesterol.

3.3 — Manter o mesmo estilo visual/UX de passos que já existe hoje em
`/quiz` (perguntas uma de cada vez, com avanço automático em escolha única,
como já está implementado — reaproveitar os componentes de opção que já
existem no arquivo atual antes de reescrever, não recriar do zero se já
tiver algo reutilizável).

3.4 — Ao terminar as perguntas, rodar `computeTriage(answers)`:

- Se `blocked: true` → **não deixa prosseguir**. Mostrar uma tela final
  informando que não é possível vender pra menor de 18 anos (usar o
  `blockReason`), sem nenhum botão de continuar pro checkout.

- Se `blocked: false`, montar a lista completa dos 5 produtos do catálogo
  (`ALL_PRODUCT_KEYS`) como `protocol_items`, um item por `ProductKey`,
  assim:
  - Buscar `id, name, price_monthly, price_quarterly, price_yearly` de
    todos os produtos ativos em `products` (mesma query que a mini-triagem
    antiga já fazia) e casar por nome com `PRODUCT_NAME_BY_KEY`.
  - Para cada `ProductKey` fora do `allowed`: item com `blocked: true`,
    `is_required: false`, `removed: true`, `activation_reason` = o motivo
    do gate que bloqueou (usar o primeiro motivo relevante de
    `triggeredReasons`, ou juntar todos se mais de um gate bloqueou o mesmo
    produto).
  - Para os `ProductKey` dentro do `allowed`:
    - Se veio do **carrinho cheio** (`useCart().items` tinha esse produto
      antes da triagem): `is_required: false`, `removed: false`,
      `activation_reason: 'Selecionado por você no carrinho'`.
    - Se veio de **carrinho vazio**: rodar `defaultSuggestion(allowed)` —
      os produtos retornados por ela entram com `removed: false` (o
      primeiro/base como `is_required: true`, os demais da sugestão como
      `is_required: false`); os produtos que estão em `allowed` mas fora da
      sugestão entram com `removed: true` e
      `activation_reason: 'Disponível — adicione se quiser'` (não
      bloqueado, só não pré-selecionado).
  - Se veio do carrinho cheio e algum produto que estava no carrinho **não
    está mais em `allowed`** (foi bloqueado pela triagem), esse é
    exatamente o caso do "removemos X do seu pedido" — o item entra com
    `blocked: true` como descrito acima, e a tela de `/recomendacoes` (Parte
    4) já vai exibir isso com o motivo e permitir adicionar os itens
    liberados no lugar.

- Salvar em `sessionStorage`:
  - `protocol_items` = a lista montada acima (mesmo formato que
    `/recomendacoes` já espera hoje).
  - `triagem_data` = os `TriageAnswers` completos + `full_name`, em uma
    chave só (substitui `quiz_data` e `mini_quiz_data`, que deixam de
    existir).
  - `checkout_source` = `'full_quiz'` se o carrinho estava vazio ao entrar,
    `'mini_quiz'` se estava cheio (mantém o valor só pra fins de
    analytics/telemetria — a lógica de dados agora é idêntica nos dois
    casos, ver Parte 5).
  - Limpar `cart_locked_plan`, `protocol_id` como já era feito antes.
- `router.push('/recomendacoes')`.

============================================================
PARTE 4 — `/recomendacoes`: exibir item bloqueado por segurança
============================================================

Em `src/app/(public)/recomendacoes/page.tsx`:

4.1 — `LocalProtocolItem` ganha `blocked?: boolean`.

4.2 — No card do item (por volta da linha 226-272 hoje), quando
`item.blocked` for `true`:
- Não mostrar o botão "Adicionar"/"Remover" (não pode ser destravado pelo
  cliente).
- Trocar a badge "Complementar" por algo como "Bloqueado por segurança"
  (cor de alerta, ex. âmbar/vermelho suave, mesmo padrão dos outros
  alertas do admin em `AlertCard`).
- `item.activation_reason` já carrega o motivo clínico — exibir normalmente
  no lugar de `activation_reason` atual (o texto já explica o "porque").
- Manter a opacidade reduzida (`opacity-40`) que já existe pra item
  removido, já que um item bloqueado nunca entra no total.

4.3 — Itens com `removed: true` e `blocked` ausente/false continuam
funcionando exatamente como hoje (toggle normal "Adicionar"/"Remover") —
esse é o caso de "disponível, mas não pré-selecionado", que cobre o "já
sugere o que a pessoa pode comprar, deixa adicionar direto".

Não precisa nenhuma tela nova separada — a `/recomendacoes` que já existe
cobre o "removemos X do seu pedido, porque Y, aqui está o que você pode
comprar" só com esse ajuste.

============================================================
PARTE 5 — Checkout: schema e persistência
============================================================

5.1 — `src/app/api/checkout/create/route.ts`: trocar o formato do campo
`quiz` dentro de `checkoutSchema` para:
```ts
quiz: z.object({
  full_name: z.string(),
  birth_date: z.string(),
  sex: z.enum(['homem', 'mulher']),
  is_pregnant_or_breastfeeding: z.boolean(),
  renal_conditions: z.array(z.string()),
  hepatic_conditions: z.array(z.string()),
  diagnosis_type: z.enum(['type1', 'type2', 'prediabetes', 'lada_avancado', 'undiagnosed']),
  medications: z.array(z.string()),
}),
```
Remover os campos antigos (`years_diagnosed`, `hba1c_range`,
`fasting_glucose`, `family_history`, `symptoms`, `conditions_mild`,
`conditions_serious`, `weight_status`, `exercise_freq`, `diet_quality`,
`allergies`, `prior_treatment`, `age`) desse schema.

5.2 — `src/lib/protocol/create-from-checkout.ts`: simplificar o bloco que
hoje distingue `source === 'mini_quiz'` pra tratar idade/nome (linhas
~80-90) — não precisa mais dessa distinção, os dois fluxos mandam o mesmo
formato agora. No insert em `quiz_responses` (~linha 92 em diante):
- `diagnosis_type: quiz.diagnosis_type`
- `birth_date: quiz.birth_date`
- `sex: quiz.sex`
- `is_pregnant_or_breastfeeding: quiz.is_pregnant_or_breastfeeding`
- `renal_conditions: quiz.renal_conditions`
- `hepatic_conditions: quiz.hepatic_conditions`
- `medications: quiz.medications`
- `years_diagnosed`: pode omitir agora que é nullable (Parte 1.2).
- Os demais campos antigos (`hba1c_range`, `symptoms`, etc.) — omitir, vão
  ficar `null`/`{}` por default.
- Atualizar também o trecho que grava `full_name` no perfil do usuário
  (~linha 82), já que agora `quiz.full_name` sempre existe (não só no
  `mini_quiz`).

5.3 — `src/app/(public)/checkout/page.tsx`:
- `buildQuizPayload()` (linha ~218) fica só
  `JSON.parse(sessionStorage.getItem('triagem_data') ?? '{}')`, sem mais
  branch por `source`.
- Remover as leituras/escritas de `quiz_data` e `mini_quiz_data` (linhas
  47-48, 155-174) — tudo lê de `triagem_data` agora.
- O tipo `CheckoutSource` e a variável `source` podem continuar existindo
  só pra rótulo/telemetria, sem mudar mais nenhum comportamento de payload.

5.4 — Anticoagulante no checkout: em algum ponto visível do checkout,
sempre que **Ômega 3** estiver entre `getActiveItems()`, mostrar um aviso
(banner/alerta, não bloqueante) com o texto: "Caso utilize medicamentos
anticoagulantes ou antiagregantes plaquetários, consulte o seu médico antes
de iniciar a suplementação." Critério do Cursor de onde exatamente encaixar
visualmente (ex.: perto do resumo do pedido), desde que apareça antes da
pessoa confirmar o pagamento.

============================================================
PARTE 6 — Aviso de anticoagulante na página de vendas do Ômega 3
============================================================

6.1 — Em `src/lib/supplements-content.ts`, adicionar campo opcional
`warningNote?: string` ao tipo `SupplementContent`, e preencher só pro
`slug: 'omega3'`:
```
warningNote: 'Caso utilize medicamentos anticoagulantes ou antiagregantes plaquetários, consulte o seu médico antes de iniciar a suplementação.'
```

6.2 — Em `src/app/suplementos/[slug]/page.tsx`, se `content.warningNote`
existir, renderizar um bloco de alerta (ícone de atenção + texto, estilo
consistente com o resto da página) próximo à descrição/composição do
produto.

============================================================
PARTE 7 — Limpeza
============================================================

7.1 — `src/components/CartDrawer.tsx`: trocar `router.push('/checkout/triagem')`
(linha ~41, dentro de `handleFinish`) para `router.push('/quiz')`.

7.2 — Apagar `src/lib/protocol/generator.ts` (função `generateProtocol`) —
não tem mais nenhum caller depois da Parte 3, foi substituída pela lógica
de `triage.ts` + `defaultSuggestion`.

7.3 — `src/lib/quiz/schema.ts` e `src/app/api/quiz/submit/route.ts` não têm
nenhum caller ativo hoje (confirmado por busca no repo) — não precisam ser
tocados nesta tarefa, deixar como estão.

============================================================
NOTAS
============================================================

- Testar os 4 caminhos principais: (1) carrinho vazio + sem nenhuma
  restrição → sugere Berberina; (2) carrinho cheio com item que vira
  bloqueado pela triagem (ex.: Berberina no carrinho + responde Tipo 1) →
  `/recomendacoes` mostra Berberina bloqueada com motivo, e
  Neuropatia/Polivitamínico/Ômega3 disponíveis pra adicionar; (3) menor de
  18 → tela de bloqueio, sem chegar no checkout; (4) duas restrições ao
  mesmo tempo (ex.: gestante + condição renal) → só Ômega 3 liberado.
- Farmácia/prescrição continuam só sendo criadas após confirmação de
  pagamento (regra que já existe, não muda nada aqui).
- Se o `ALTER TYPE ... ADD VALUE` da Parte 1.1 der problema de transação
  junto com a Parte 1.2 no mesmo arquivo, separar em duas migrations.
