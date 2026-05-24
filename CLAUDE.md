# CLAUDE.md — Desafio Diabetes
> Documento de contexto completo para o Cursor. Leia integralmente antes de escrever qualquer código.

---

## 1. Visão geral do produto

O Desafio Diabetes é uma plataforma healthtech de intermediação médica que vende tratamentos para diabetes tipo 2 e pré-diabetes por assinatura. O modelo de negócio combina um questionário clínico que gera um protocolo personalizado de suplementos, prescrição assinada digitalmente por um profissional habilitado, e entrega mensal dos produtos via farmácia parceira.

**Referência visual**: Manual.com.br — mesma experiência de questionário pré-compra, checkout transparente, e área do paciente com histórico clínico. A identidade visual será do Desafio Diabetes, não da Manual.

**Produtos vendidos:**
- Berberina convencional (produto âncora, sempre incluído)
- Berberina Homeopata (substituta em casos de condição séria)
- Vitamina B12 (variável, ativada por critérios clínicos)
- Ômega 3 (variável, ativado por critérios clínicos)

**Planos de assinatura:** 1 mês, 3 meses, 1 ano — cobrado em cartão de crédito via Pagar.me, renovação automática mensal.

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 com App Router e TypeScript |
| Estilização | Tailwind CSS + shadcn/ui |
| Notificações | sonner (não usar o toast do shadcn) |
| Banco de dados | Supabase PostgreSQL com RLS |
| Autenticação | Supabase Auth |
| Pagamentos | Pagar.me (checkout transparente) |
| Background jobs | Inngest v4 (2 argumentos com triggers dentro do primeiro objeto) |
| Deploy | Vercel |
| CDN | Cloudflare |
| Repositório | Monólito — backend e frontend no mesmo projeto Next.js via API Routes |

**Nunca use:**
- Prisma (o Supabase SDK já é o ORM)
- Next Auth (o Supabase Auth já cuida disso)
- Redux (use Zustand ou Context API quando necessário)
- Qualquer biblioteca de pagamento que não seja o SDK do Pagar.me
- toast do shadcn (use sonner)

---

## 3. Banco de dados — Supabase

**Projeto:** `desafio-diabetes-prod`
**URL:** `https://ylkrbezjxmoxmwcrziru.supabase.co`
**Região:** West US (North California) — us-west-1

O schema está 100% criado no Supabase. Nunca recrie tabelas — sempre consulte o schema existente antes de qualquer migração.

### 3.1 ENUMs criados

```sql
user_role: patient | professional | support | admin
plan_type: 1mes | 3meses | 1ano
subscription_status: active | past_due | canceled | expired | grace_period
payment_status: pending | paid | failed | refunded
entitlement_product: treatment | diet | guide | consultation
entitlement_status: active | expired | canceled
order_status: pending | sent_to_pharmacy | dispatched | delivered | failed
webhook_source: pagarme | pharmacy | shipping
notification_type: welcome | prescription_ready | weekly_tip | nps | renewal_reminder | payment_failed | tier_change | sunday_dispatch | tracking_update
notification_channel: email | whatsapp | sms
notification_status: sent | delivered | failed | bounced
record_type: glucose | hba1c | weight | blood_pressure | medication | exam_upload
protocol_status: pending_signature | signed | rejected
job_type: rfm_recalc | sunday_dispatch | pharmacy_json | pdf_generation | payment_retry
job_status: pending | running | completed | failed
audit_action: viewed | signed | rejected
diagnosis_type: type2 | prediabetes | undiagnosed
rfm_tier: 1_campiao | 2_dedicado | 3_promissor | 4_estavel | 5_em_risco | 6_hibernando | 7_perdido
coupon_type: percentage | fixed
content_key_type: diet | guide
```

### 3.2 Tabelas — 25 no total

**Domínio 1 — Auth**
- `users` — id, email, full_name, phone, cpf, birth_date, role, client_code, rfm_recalc_queued_at
- `professionals` — user_id, crm, crm_state, specialty, signature_data, pdf_template, is_active
- `addresses` — user_id, zip_code, street, number, complement, neighborhood, city, state, is_default

**Domínio 2 — Quiz e protocolo**
- `quiz_responses` — user_id + 13 campos clínicos em arrays e enums
- `products` — name, pharmacy_sku_monthly/quarterly/yearly, is_fixed, price x3, activation_rules (JSONB)
- `protocols` — user_id, quiz_response_id, status, signed_at, signed_by (FK professionals), prescription_pdf_url
- `protocol_items` — protocol_id, product_id, is_required, removed_by_patient, activation_reason, quantity

**Domínio 3 — Pagamentos**
- `subscriptions` — user_id, protocol_id, plan_type, status, expires_at, pagarme_sub_id, retry_count, grace_period_ends_at
- `payments` — subscription_id, amount, status, pagarme_charge_id, paid_at, webhook_payload (JSONB)
- `user_entitlements` — user_id, product_key, status, expires_at, is_permanent, source_payment_id
- `discount_coupons` — code, type, value, expires_at, max_uses, used_count, is_active

**Domínio 4 — Pedidos**
- `orders` — user_id, subscription_id, status, total_amount, pharmacy_json (JSONB), shipping_json (JSONB), pharmacy_sent_at, tracking_code
- `order_items` — order_id, product_id, pharmacy_sku, quantity, unit_price
- `webhook_logs` — source, event_type, payload (JSONB), processed, error_message
- `system_config` — key, value, description (valores fixos configuráveis sem redeploy)

**Domínio 5 — Área do paciente**
- `health_records` — user_id, record_type, value_numeric, value_text, unit, exam_file_url, recorded_at, notes
- `content_access` — user_id, content_key, first_accessed_at, last_accessed_at

**Domínio 6 — CX e engajamento**
- `notification_logs` — user_id, type, channel, status, sent_at
- `nps_responses` — user_id, score (0-10), comment, triggered_at
- `quiz_sessions` — email, progress (JSONB), last_step, converted (captura pré-compra)
- `user_login_history` — user_id, logged_at, ip_address, user_agent
- `user_rfm_scores` — user_id, recency_score, frequency_score, monetary_score, final_score, tier, previous_tier, calculated_at
- `sunday_dispatch_logs` — user_id, tier_at_dispatch, template_sent, sent_at, channel

**Domínio 7 — Jobs e auditoria**
- `background_jobs` — job_type, status, started_at, completed_at, error_message, affected_rows, payload
- `prescription_audit_logs` — protocol_id, professional_id, action, signed_at, ip_address, user_agent, pdf_url, pdf_hash (SHA-256), payload_snapshot

### 3.3 Regras críticas de RLS

- Todas as tabelas com `user_id` têm RLS ativo — o usuário só lê e escreve os próprios dados.
- `products` e `system_config` têm policy de SELECT público (qualquer autenticado lê).
- `prescription_audit_logs` tem policy somente INSERT — nunca UPDATE ou DELETE. É imutável por design legal.
- O painel admin e profissional precisam de policy especial usando `auth.uid() IN (SELECT id FROM users WHERE role = 'admin')`.
- Sempre adicionar GRANT para o role `authenticated` ao criar novas tabelas — sem GRANT o RLS não alcança a tabela.

---

## 4. Lógica clínica — Questionário e protocolo

### 4.1 As 13 perguntas

**Bloco 1 — Diagnóstico:**
1. Diagnóstico: type2 / prediabetes / undiagnosed
2. Tempo de diagnóstico: <1ano / 1-5anos / 5-10anos / >10anos → **>5 anos ativa B12**
3. HbA1c: <7% / 7-9% / >9% / não sei
4. Glicemia em jejum: <100 / 100-125 / 126-199 / >200 / não sei
5. Medicamentos (múltipla): metformina / insulina / outro / nenhum → **metformina ativa B12**
6. Histórico familiar (múltipla): pai_mae / avos / irmaos / nao / nao_sei — apenas engajamento

**Bloco 2 — Saúde hoje:**
7. Sintomas (múltipla): formigamento / fadiga / visao_embacada / cicatrizacao / sede → **qualquer um ativa Ômega 3**
8. Condições (múltipla separada em dois grupos):
   - Leves (mantém Berberina convencional): hipertensao / colesterol / figado_gorduroso
   - Sérias (troca para Homeopata): doenca_renal_cronica / doenca_cardiaca / cirrose
9. Peso: saudavel / sobrepeso / obesidade / abaixo — apenas perfil
10. Frequência de exercícios — apenas perfil
11. Qualidade alimentar — apenas perfil
12. Alergias: sim (campo livre) / não / não sei → remove suplemento correspondente
13. Tratamento anterior — apenas engajamento

### 4.2 Lógica de geração do protocolo

```typescript
function gerarProtocolo(quiz: QuizResponse): ProtocolItem[] {
  const items: ProtocolItem[] = []
  const temCondicaoSeria = quiz.conditions_serious.length > 0

  // Berberina — sempre incluída, não removível
  if (temCondicaoSeria) {
    items.push({ product: 'berberina-homeopata', is_required: true })
  } else {
    items.push({ product: 'berberina-convencional', is_required: true })
  }

  // Vitamina B12 — variável, removível
  const ativaB12 = quiz.years_diagnosed === '5-10anos' ||
                   quiz.years_diagnosed === '>10anos' ||
                   quiz.medications.includes('metformina')
  if (ativaB12) {
    items.push({ product: 'vitamina-b12', is_required: false })
  }

  // Ômega 3 — variável, removível
  const ativaOmega3 = quiz.symptoms.length > 0 &&
                      !quiz.symptoms.includes('nenhum')
  if (ativaOmega3) {
    items.push({ product: 'omega3', is_required: false })
  }

  // Remover por alergia declarada
  if (quiz.allergies) {
    return items.filter(item => !alergiaCobre(quiz.allergies, item.product))
  }

  return items
}
```

Protocolo mínimo: 1 produto. Máximo: 3 produtos.

---

## 5. SKUs dos produtos

| Produto | Mensal | Trimestral | Anual |
|---|---|---|---|
| Berberina convencional | DD-BERB-STD-0X30 | DD-BERB-STD-0X90 | DD-BERB-STD-0X360 |
| Berberina Homeopata | DD-BERB-HOM-0X30 | DD-BERB-HOM-0X90 | DD-BERB-HOM-0X360 |
| Vitamina B12 | DD-VTB12-STD-0X30 | DD-VTB12-STD-0X90 | DD-VTB12-STD-0X360 |
| Ômega 3 | DD-OMG3-STD-0X30 | DD-OMG3-STD-0X90 | DD-OMG3-STD-0X360 |

O SKU correto é selecionado em tempo de execução com base no `plan_type` da assinatura.

---

## 6. JSON da farmácia

Gerado automaticamente após confirmação de pagamento via webhook do Pagar.me.

### 6.1 Campos com lógica própria

**ClienteCodigo**
Código sequencial gerado no cadastro, formato `DD-000001`. Armazenado em `users.client_code`.

**TransportadoraCodigo**
Gerado dinamicamente por pedido:
```typescript
const cep3 = address.zip_code.replace('-', '').substring(0, 3)
const nome3 = user.full_name.slice(-3).toLowerCase()
const transportadoraCodigo = `${cep3}${nome3}DD`
// Exemplo: CEP 88490-000, Nome "Vitor Marcelino" → "884inoDD"
```

**FormaPagamentoCodigo**
Combina plano + mês de compra em português abreviado:
```typescript
const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']
const mes = meses[new Date().getMonth()]
const formaPagamento = `${subscription.plan_type}${mes}`
// Exemplos: "1mesMAI", "3mesesMAI", "1anoMAI"
```

**NumeroObjeto**
Vem vazio no envio. A farmácia retorna via webhook após despacho. Atualiza `orders.tracking_code`.

### 6.2 Valores fixos (em system_config)

```
pharmacy_carrier_code   → código da transportadora
pharmacy_payment_code   → código do cartão de crédito
pharmacy_company_id     → código do Desafio Diabetes na farmácia
```

---

## 7. Sistema RFM — 7 tiers

Score = R (40%) + F (30%) + M (30%), recalculado assincronamente via Inngest a cada hora.

O login do usuário apenas atualiza `users.rfm_recalc_queued_at = NOW()`. O job Inngest `rfm-recalc` roda a cada hora e processa todos os usuários com `rfm_recalc_queued_at > last_run`.

| Tier | Nome | Score | Recência | Frequência | Monetização | Ação domingo |
|---|---|---|---|---|---|---|
| 1 | Campeão | 86-100 | ≤7 dias | >12 logins/90d | plano anual | Conteúdo exclusivo + referral |
| 2 | Dedicado | 71-85 | ≤14 dias | 8-12 logins/90d | plano 3 meses | Dica de evolução + registro de exames |
| 3 | Promissor | 57-70 | ≤21 dias | 4-7 logins/90d | plano mensal | Educação sobre plano anual |
| 4 | Estável | 43-56 | ≤30 dias | 2-3 logins/90d | 1+ pagamento | Lembrete de uso da plataforma |
| 5 | Em risco | 29-42 | 31-45 dias | 1 login/90d | plano ativo | Reativação com tom de cuidado |
| 6 | Hibernando | 15-28 | 46-60 dias | 0 logins/90d | histórico | Mensagem pessoal do Dr. Turí |
| 7 | Perdido | 0-14 | >60 dias | zero recente | cancelado/expirado | Campanha de reativação agressiva |

O campo `previous_tier` em `user_rfm_scores` permite detectar mudanças de tier e personalizar a mensagem de domingo.

---

## 8. Controle de acesso — Entitlements

A tabela `user_entitlements` é a fonte de verdade para o que o usuário pode acessar. O frontend SEMPRE consulta esta tabela antes de renderizar conteúdo protegido.

```typescript
// product_key possíveis
type EntitlementProduct = 'treatment' | 'diet' | 'guide' | 'consultation'

// Regras de acesso
// treatment → plano ativo (qualquer)
// diet      → plano anual OU compra avulsa da Dieta
// guide     → qualquer compra do Guia Digital (is_permanent = true, nunca expira)
// consultation → compra avulsa da consulta
```

**Regra crítica:** O acesso só é liberado após confirmação do webhook do Pagar.me, NUNCA pela resposta síncrona do checkout. Toda lógica de liberação fica no handler `POST /api/webhooks/pagarme`.

---

## 9. Prescrição e auditoria médica

### Fluxo de assinatura:
1. Paciente completa checkout → pagamento confirmado via webhook
2. Sistema cria protocolo com status `pending_signature`
3. Profissional vê na fila `/profissional/fila`
4. Profissional abre o protocolo, revisa o perfil clínico, clica em "Assinar"
5. Sistema:
   - Gera PDF da prescrição server-side (Inngest job `pdf-generation`)
   - Salva PDF no Supabase Storage
   - Atualiza `protocols.status = 'signed'`
   - Insere em `prescription_audit_logs` (SOMENTE INSERT, imutável)
   - Envia email para paciente com PDF em anexo

### Log de auditoria — campos obrigatórios:
```typescript
await supabase.from('prescription_audit_logs').insert({
  protocol_id: protocol.id,
  professional_id: user.id,
  action: 'signed',
  signed_at: new Date().toISOString(),
  ip_address: request.headers.get('x-forwarded-for'),
  user_agent: request.headers.get('user-agent'),
  pdf_url: pdfUrl,
  pdf_hash: sha256(pdfBuffer), // SHA-256 do arquivo
  payload_snapshot: protocol   // snapshot completo do protocolo
})
```

---

## 10. Régua de cobrança e inadimplência

Vendemos apenas no cartão de crédito. Quando uma cobrança falha:

```
D+0  → cobrança falha → email "problema com pagamento"
D+2  → primeira retentativa
D+5  → segunda retentativa + email mais urgente
D+9  → terceira retentativa + email final
D+10 → sem pagamento → status = 'past_due' → grace_period_ends_at = D+10
D+10 → expirado grace period → status = 'canceled' → entitlements revogados
```

Campos em `subscriptions`: `retry_count` e `grace_period_ends_at`.
O job Inngest `payment-retry` gerencia esse fluxo.

---

## 11. Fluxo do usuário — DECISÃO CRÍTICA

O quiz é público — não exige login. A conta é criada durante o checkout.

```
/ (landing) → /quiz (sem login) → /recomendacoes (sem login) →
/checkout (cria conta no passo 2) → /obrigado → /dashboard
```

### Detalhamento do fluxo:

**1. Quiz sem login**
- As respostas do quiz são salvas em `sessionStorage` no browser
- Nenhuma chamada ao banco durante o quiz
- Ao final do quiz, o protocolo é gerado localmente (via `generateProtocol()`) e salvo em `sessionStorage`
- Redireciona para `/recomendacoes` com os dados em `sessionStorage`

**2. Tela de recomendações sem login**
- Lê o protocolo de `sessionStorage`
- Exibe produtos, permite remover variáveis, selecionar plano
- Botão "Continuar" redireciona para `/checkout`

**3. Checkout cria a conta (passo 2 de 4)**
- Passo 1: confirmação do tratamento
- Passo 2: criação de conta (email + senha) — chama Supabase Auth
- Passo 3: endereço de entrega
- Passo 4: pagamento
- Após criar conta no passo 2, salva quiz_responses + protocols + protocol_items no banco
- O `protocol_id` gerado é usado no resto do checkout

**4. Usuário já logado**
- Se já tem sessão ativa, pula o passo de criação de conta
- O quiz ainda pode ser refeito a qualquer momento

---

## 12. Rotas da aplicação

### Páginas públicas (sem login)
| Rota | Fase | Descrição |
|---|---|---|
| `/` | B | Landing page |
| `/quiz` | A | Questionário clínico — sem login obrigatório |
| `/recomendacoes` | A | Protocolo personalizado — sem login obrigatório |
| `/checkout` | A | 4 etapas — conta criada no passo 2 |
| `/obrigado` | A | Confirmação de compra |
| `/login` | A | Autenticação para quem já tem conta |
| `/recuperar-senha` | A | Recuperação de senha |

### Área do paciente (autenticado)
| Rota | Fase | Descrição |
|---|---|---|
| `/dashboard` | A | Visão geral |
| `/dashboard/protocolo` | A | Protocolo ativo + PDF |
| `/dashboard/pedidos` | A | Pedidos + rastreio |
| `/dashboard/dieta` | A | Dieta de Reversão (bloqueada sem entitlement) |
| `/dashboard/guia` | A | Guia Digital (acesso permanente) |
| `/dashboard/evolucao` | B | Registros de saúde + gráficos |
| `/dashboard/assinatura` | B | Gestão de plano |
| `/dashboard/perfil` | B | Dados pessoais |

### Painel do profissional
| Rota | Fase | Descrição |
|---|---|---|
| `/profissional/fila` | A | Protocolos pendentes de assinatura |
| `/profissional/protocolo/[id]` | A | Perfil clínico + assinatura digital |

### Painel administrativo
| Rota | Fase | Descrição |
|---|---|---|
| `/admin/usuarios` | A | Lista de pacientes |
| `/admin/pedidos` | A | Gestão de pedidos |
| `/admin` | B | Dashboard de métricas |
| `/admin/cupons` | B | Cupons de desconto |
| `/admin/config` | B | Configurações do sistema |
| `/admin/auditoria` | B | Logs de prescrição |

### APIs obrigatórias — Fase A
| Endpoint | Método | Descrição |
|---|---|---|
| `/api/quiz/submit` | POST | Salva quiz + cria protocolo no banco (chamado no checkout após criar conta) |
| `/api/checkout/create` | POST | Cria assinatura no Pagar.me |
| `/api/webhooks/pagarme` | POST | Confirma pagamento → libera entitlements |
| `/api/webhooks/farmacia` | POST | Recebe tracking_code da farmácia |
| `/api/prescricao/assinar` | POST | Assina protocolo → gera PDF + audit log |
| `/api/farmacia/enviar` | POST | Envia JSON para farmácia |
| `/api/entitlements` | GET | Retorna entitlements ativos do usuário |
| `/api/auth/login-event` | POST | Registra login → atualiza fila RFM |

### Jobs Inngest
| Job | Frequência | Descrição |
|---|---|---|
| `rfm-recalc` | A cada hora | Recalcula score RFM de usuários na fila |
| `sunday-dispatch` | Todo domingo | Disparo de email por tier |
| `pdf-generation` | Sob demanda | Gera PDF da prescrição após assinatura |
| `pharmacy-order` | Sob demanda | Envia pedido para farmácia pós-pagamento |
| `payment-retry` | Sob demanda | Retenta cobrança em D+2, D+5, D+9 |

---

## 13. Fases de desenvolvimento

### Fase A — MVP para validação com sócio
Visual simples com shadcn/ui sem customização. Objetivo: fluxo completo funcionando.

### Fase B — Frontend com identidade visual
Componentes visuais inspirados na Manual.com.br com identidade do Desafio Diabetes.

---

## 14. Convenções de código

### Estrutura de pastas (Next.js App Router)
```
src/
  app/
    (public)/           → rotas sem autenticação
      quiz/
      recomendacoes/
      checkout/
    (patient)/          → autenticado como patient
      dashboard/
    (professional)/     → autenticado como professional
      profissional/
    (admin)/            → autenticado como admin
      admin/
    api/
      quiz/
      checkout/
      webhooks/
        pagarme/
        farmacia/
      prescricao/
      farmacia/
      entitlements/
      auth/
  lib/
    supabase/
      client.ts
      server.ts
      admin.ts
    inngest/
      client.ts
      functions/
    protocol/
      generator.ts
    pharmacy/
      json-builder.ts
      sender.ts
    quiz/
      schema.ts
  types/
    protocol.ts
    pharmacy.ts
```

### Padrões obrigatórios

**Server Components por padrão.** Só adicionar `'use client'` quando necessário.

**Acesso ao banco sempre via Server Actions ou Route Handlers.**

**Validação com Zod** em todos os inputs e webhooks.

**params em route handlers do Next.js 16 devem ser awaited:**
```typescript
// CORRETO no Next.js 16
export async function GET(req, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
```

**sessionStorage para dados pré-login:**
- Respostas do quiz: `sessionStorage.setItem('quiz_data', JSON.stringify(data))`
- Protocolo gerado: `sessionStorage.setItem('protocol_data', JSON.stringify(protocol))`
- Limpar após salvar no banco no checkout

**Variáveis de ambiente:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PAGARME_API_KEY
PAGARME_WEBHOOK_SECRET
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
NEXT_PUBLIC_APP_URL
```

**Webhooks sempre retornam 200** — erros são logados em `webhook_logs`.

---

## 15. Fluxo completo — do quiz ao pedido

```
1. Usuário acessa /quiz (sem login)
   → Responde 13 perguntas
   → Respostas salvas em sessionStorage
   → Protocolo gerado localmente via generateProtocol()
   → Redireciona para /recomendacoes

2. Tela /recomendacoes (sem login)
   → Lê protocolo de sessionStorage
   → Usuário ajusta produtos e seleciona plano
   → Clica "Continuar" → vai para /checkout

3. Checkout (4 passos)
   → Passo 1: confirma tratamento
   → Passo 2: cria conta (email + senha via Supabase Auth)
              após criar conta: POST /api/quiz/submit (salva quiz + protocolo no banco)
   → Passo 3: endereço de entrega
   → Passo 4: pagamento via Pagar.me

4. Pagamento confirmado via webhook
   → POST /api/webhooks/pagarme (event: charge.paid)
   → INSERT payments (status: paid)
   → UPDATE subscriptions (status: active)
   → INSERT user_entitlements (product_key: treatment)
   → Inngest: pharmacy-order + pdf-generation
   → Redireciona para /obrigado

5. Profissional assina prescrição
   → /profissional/fila → assina → PDF gerado → audit log imutável

6. Farmácia recebe e despacha
   → JSON enviado → webhook retorna tracking_code

7. Renovação mensal automática via Pagar.me
```

---

## 16. Decisões de arquitetura — não questione sem perguntar

1. **Monólito Next.js** — não separar backend e frontend.
2. **Supabase como única fonte de verdade.**
3. **Liberar acesso só via webhook** — nunca pela resposta síncrona do Pagar.me.
4. **prescription_audit_logs é imutável** — só INSERT, nunca UPDATE ou DELETE.
5. **RFM recalculado via Inngest** — login só enfileira, nunca calcula.
6. **Transportadora: código único em system_config** — sem regras por CEP.
7. **FormaPagamentoCodigo dinâmico** — plan_type + mês atual.
8. **Fase A com visual cru (shadcn/ui padrão).**
9. **PWA no MVP** — React Native é futuro.
10. **Supabase free até o lançamento.**
11. **Quiz sem login** — conta criada no passo 2 do checkout. Não exigir autenticação antes do checkout.
12. **sessionStorage para dados pré-login** — nunca localStorage para dados sensíveis de saúde.

---

## 17. Integração com a farmácia — pendências

O sistema de shipping ainda não foi implementado — empresa de frete não contratada. Campo `orders.shipping_json` reservado.

O campo `NumeroObjeto` chega vazio no envio. A farmácia retorna via webhook após despacho.

---

*Última atualização: maio de 2026*
*Contexto gerado a partir de sessão de planejamento completa com o fundador.*
