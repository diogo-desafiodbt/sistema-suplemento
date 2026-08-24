# Catálogo de perguntas de suporte — Desafio Diabetes

Documento de trabalho. **Não vai para o prompt da IA.** Serve para três
coisas:

1. Decidir quais ferramentas de consulta construir (por domínio, não por
   pergunta)
2. Ser o conjunto de teste — rodar contra a IA e contar acertos
3. Mapear o que o banco **não** responde, que é o trabalho humano que
   continua existindo

Cenário: operação madura (suplemento vendendo, assinaturas renovando,
pedidos rodando), não o estado atual.

**Legenda da coluna Quem resolve:**
- **IA** — dado está no banco, resposta objetiva, pode enviar sozinha
- **IA parcial** — a IA responde o que sabe e escala a ação
- **Pedro** — precisa de humano (ação externa, julgamento, ou dado que não existe)

---

## 1. Guia Digital (Hotmart) — 15 perguntas

| # | Pergunta do cliente | Fonte | Quem resolve |
|---|---|---|---|
| 1.1 | Comprei o guia e não recebi nada | `hotmart_sales` | IA |
| 1.2 | Perdi o acesso ao meu guia | `hotmart_sales` + área de membros | IA parcial |
| 1.3 | Não consigo entrar na plataforma do guia | `hotmart_sales` | IA parcial |
| 1.4 | Meu pagamento foi aprovado? | `hotmart_sales.status` | IA |
| 1.5 | Quando eu comprei o guia? | `hotmart_sales.order_date` | IA |
| 1.6 | Comprei com outro e-mail, consegue localizar? | `hotmart_sales.buyer_email` | IA |
| 1.7 | Paguei duas vezes sem querer | `hotmart_sales` (transações do e-mail) | IA parcial |
| 1.8 | Quanto eu paguei no guia? | `hotmart_sales.price_value` | IA |
| 1.9 | Paguei no boleto, já caiu? | `hotmart_sales.status` + `approved_date` | IA |
| 1.10 | Pedi reembolso, foi processado? | `hotmart_sales.status` | IA |
| 1.11 | Quero pedir reembolso do guia | — (ação na Hotmart) | Pedro |
| 1.12 | O guia é vitalício ou expira? | `products` / política | IA |
| 1.13 | Posso acessar pelo celular? | política | IA |
| 1.14 | Comprei o guia mas queria o suplemento | `hotmart_sales` + catálogo | IA parcial |
| 1.15 | O e-mail do acesso não chegou, nem no spam | `hotmart_sales` | Pedro (reenvio) |

**Nota:** 1.2, 1.3 e 1.15 são o mesmo caso em estágios diferentes. A IA
faz a orientação (confirma a compra, indica o e-mail correto, orienta
sobre spam); o reenvio efetivo é manual — a API da Hotmart não expõe isso.

---

## 2. Pedido e entrega do suplemento — 22 perguntas

| # | Pergunta do cliente | Fonte | Quem resolve |
|---|---|---|---|
| 2.1 | Cadê meu pedido? | `orders.status` | IA |
| 2.2 | Meu pedido já foi enviado? | `orders.pharmacy_sent_at` | IA |
| 2.3 | Qual o código de rastreio? | `orders.tracking_code` | IA |
| 2.4 | Quando chega? | `shipping_quote_json.prazoDias` + envio | IA |
| 2.5 | Está atrasado, o prazo já passou | `orders` + `shipping_json.eventos` | IA parcial |
| 2.6 | O rastreio não atualiza há dias | `shipping_json.eventos` | IA parcial |
| 2.7 | Tentaram entregar e não tinha ninguém | `shipping_json.eventos` | IA |
| 2.8 | Quantas vezes tentaram entregar? | `shipping_json.eventos` | IA |
| 2.9 | Foi entregue mas não recebi | `shipping_json.eventos` | Pedro |
| 2.10 | Consta como entregue no endereço errado | `shipping_json.eventos` | Pedro |
| 2.11 | Quero mudar o endereço de entrega | `addresses` (ação) | Pedro |
| 2.12 | Qual endereço está cadastrado? | `addresses` | IA (parcial: só cidade/UF) |
| 2.13 | O que veio no meu pedido? | `order_items` + `products` | IA |
| 2.14 | Veio faltando um produto | `order_items` | Pedro |
| 2.15 | Veio produto trocado | `order_items` | Pedro |
| 2.16 | Chegou danificado / vazando | — | Pedro |
| 2.17 | Qual transportadora está levando? | `shipping_quote_json.transportadora` | IA |
| 2.18 | De onde sai o envio? | `shipping_quote_json` + config | IA |
| 2.19 | Quanto foi o frete? | `shipping_quote_json.valor` | IA |
| 2.20 | Posso retirar no local? | política | IA |
| 2.21 | Meu pedido foi cancelado, por quê? | `orders.status` + `payments` | IA parcial |
| 2.22 | Já mandaram pra farmácia? | `orders.pharmacy_sent_at` | IA |

---

## 3. Financeiro e cobrança — 18 perguntas

| # | Pergunta do cliente | Fonte | Quem resolve |
|---|---|---|---|
| 3.1 | Fui cobrado? | `payments.status` | IA |
| 3.2 | Quanto foi cobrado? | `payments.amount` | IA |
| 3.3 | Quando foi a cobrança? | `payments.paid_at` | IA |
| 3.4 | Fui cobrado duas vezes | `payments` (do mesmo cliente) | IA parcial |
| 3.5 | Meu cartão foi recusado, e agora? | `payments.status` + `subscriptions.retry_count` | IA |
| 3.6 | Quantas vezes tentaram cobrar? | `subscriptions.retry_count` | IA |
| 3.7 | Quero trocar o cartão | — (ação) | Pedro |
| 3.8 | Paguei no Pix, já caiu? | `payments.status` | IA |
| 3.9 | Meu Pix não foi identificado | `payments` | Pedro |
| 3.10 | Não reconheço essa cobrança | `payments` + `subscriptions` | IA parcial |
| 3.11 | Qual o nome que aparece na fatura? | config (`statement_descriptor`) | IA |
| 3.12 | Quero a nota fiscal | — | Pedro |
| 3.13 | Quero cancelar e ser reembolsado | — (ação + política) | Pedro |
| 3.14 | Fui cobrado depois de cancelar | `payments` + `subscriptions` | IA parcial |
| 3.15 | Em quantas vezes posso parcelar? | catálogo / política | IA |
| 3.16 | Usei um cupom, foi aplicado? | `discount_coupons` + `payments` | IA |
| 3.17 | Meu cupom não funcionou | `discount_coupons` | IA |
| 3.18 | Qual o histórico das minhas cobranças? | `payments` | IA |

---

## 4. Assinatura — 16 perguntas

| # | Pergunta do cliente | Fonte | Quem resolve |
|---|---|---|---|
| 4.1 | Qual meu plano? | `subscriptions.plan_type` | IA |
| 4.2 | Minha assinatura está ativa? | `subscriptions.status` | IA |
| 4.3 | Quando renova? | `subscriptions.next_billing_at` | IA |
| 4.4 | Quando expira? | `subscriptions.expires_at` | IA |
| 4.5 | Desde quando sou assinante? | `subscriptions.started_at` | IA |
| 4.6 | Quero cancelar | — (ação) | Pedro |
| 4.7 | Já cancelei, confirma? | `subscriptions.status` | IA |
| 4.8 | Cancelei mas quero voltar | — (ação) | Pedro |
| 4.9 | Quero mudar de plano | — (ação) | Pedro |
| 4.10 | Qual a diferença entre os planos? | `products` (preços) | IA |
| 4.11 | Minha assinatura foi suspensa, por quê? | `subscriptions.status` + `payments` | IA parcial |
| 4.12 | O que é esse período de carência? | `subscriptions.grace_period_ends_at` | IA |
| 4.13 | Quantos meses já paguei? | `payments` (contagem) | IA |
| 4.14 | Posso pausar a assinatura? | política | Pedro |
| 4.15 | Renovou sem eu autorizar | `subscriptions` + `terms_acceptances` | IA parcial |
| 4.16 | Aceitei os termos? Qual versão? | `terms_acceptances` | IA |

---

## 5. Produto e catálogo — 12 perguntas

| # | Pergunta do cliente | Fonte | Quem resolve |
|---|---|---|---|
| 5.1 | Quais suplementos vocês vendem? | `products` | IA |
| 5.2 | Quanto custa o [produto]? | `products.price_*` | IA |
| 5.3 | O que tem na composição? | `products.description` | IA parcial |
| 5.4 | Quantas cápsulas vem no pote? | `products.description` | IA |
| 5.5 | Para quantos dias dura? | `products` | IA |
| 5.6 | Tem açúcar / é liberado pra diabético? | `products.description` | IA parcial |
| 5.7 | É aprovado pela ANVISA? | política | IA |
| 5.8 | Onde é fabricado? | config (farmácia) | IA |
| 5.9 | Tem glúten / lactose? | `products.description` | IA parcial |
| 5.10 | Qual a validade? | — | Pedro |
| 5.11 | Vocês têm [produto que não existe]? | `products` | IA |
| 5.12 | Vende avulso ou só assinatura? | `products` + planos | IA |

**Nota:** as "IA parcial" desta seção viram "IA" se `products.description`
for preenchido com a informação. Hoje está `null` na maioria — vale
preencher, é o jeito mais barato de ampliar cobertura.

---

## 6. Conta e acesso ao sistema — 12 perguntas

| # | Pergunta do cliente | Fonte | Quem resolve |
|---|---|---|---|
| 6.1 | Não consigo fazer login | `users` + `user_login_history` | IA parcial |
| 6.2 | Esqueci minha senha | fluxo do sistema | IA |
| 6.3 | Não recebi o e-mail de redefinição | `notification_logs` | IA parcial |
| 6.4 | Quero trocar meu e-mail de cadastro | — (ação) | Pedro |
| 6.5 | Quero trocar meu telefone | — (ação) | Pedro |
| 6.6 | Meu cadastro existe? | `users` | IA (só p/ remetente verificado) |
| 6.7 | Qual meu código de cliente? | `users.client_code` | IA |
| 6.8 | A que eu tenho acesso? | `user_entitlements` | IA |
| 6.9 | Meu acesso expirou? | `user_entitlements.expires_at` | IA |
| 6.10 | Desde quando sou cliente? | `users.created_at` | IA |
| 6.11 | Quero excluir minha conta e meus dados | — (LGPD) | Pedro |
| 6.12 | Quero uma cópia dos meus dados | — (LGPD) | Pedro |

---

## 7. Prescrição — 6 perguntas · **TODAS escalam**

Decisão do Diogo: **nenhuma informação de prescrição sai por e-mail** — nem
status, nem data, nem confirmação de existência. A IA não tem ferramenta
que toque em `protocols` ou `protocol_items`.

| # | Pergunta do cliente | Quem resolve |
|---|---|---|
| 7.1 | Minha receita já foi assinada? | Pedro |
| 7.2 | Cadê minha prescrição? | Pedro |
| 7.3 | Quero o PDF da receita | Pedro |
| 7.4 | Quem é o profissional que assinou? | Pedro |
| 7.5 | Quais suplementos foram prescritos pra mim? | Pedro |
| 7.6 | Por que tiraram [X] do meu protocolo? | Pedro |

---

## 8. Clínico — 10 perguntas · **NENHUMA é respondida — todas viram link**

**Correção do Diogo (13/08/2026):** a equipe, em hipótese alguma, responde
pergunta técnica. A orientação é única e exclusiva: **responder com um link.**
Isso vale para a IA e para o Pedro igualmente — não é regra da automação, é
política da empresa.

Consequência: estas perguntas **deixam de escalar**. Escalar não fazia sentido,
porque o humano daria a mesma resposta. A IA envia direto um **modelo fixo**:
saudação + título da aula + link. Ela **não redige texto** nessa categoria —
por isso não existe caminho para uma frase de orientação de saúde aparecer.

Se nenhum trecho das 91 aulas chegar perto o suficiente da pergunta, a resposta
aponta o canal em geral, sem escolher aula. Link mal escolhido é pior que
link nenhum.

| # | Pergunta do cliente | Quem resolve |
|---|---|---|
| 8.1 | Posso tomar junto com [medicamento]? | IA (link) |
| 8.2 | Estou sentindo [sintoma] depois de tomar | IA (link) ⚠️ |
| 8.3 | Posso tomar grávida / amamentando? | IA (link) |
| 8.4 | Tenho problema renal, posso tomar? | IA (link) |
| 8.5 | Qual a dosagem certa? | IA (link) |
| 8.6 | Posso dobrar a dose? | IA (link) |
| 8.7 | Substitui meu remédio de diabetes? | IA (link) |
| 8.8 | Minha glicemia não baixou | IA (link) ⚠️ |
| 8.9 | Meu médico pode ver a fórmula? | Pedro |
| 8.10 | Tem contraindicação? | IA (link) |

**8.9 fica com o Pedro** porque não é dúvida técnica — é pedido de documento.

### ⚠️ Duas linhas pendentes de decisão do Diogo

**8.2 e 8.8 não são dúvida técnica — são relato.** "Estou sentindo [sintoma]
depois de tomar" é relato de reação adversa; "minha glicemia não baixou" pode
ser alguém em quadro agudo. Responder com link de aula a quem está passando mal
é fraco, e reação adversa costuma ser algo que empresa de suplemento registra,
não apenas responde.

Ficam marcadas como `IA (link)` conforme a regra, e a alternativa proposta é:
uma categoria própria de **relato**, com frase fixa orientando procurar
atendimento médico — o que não é responder pergunta técnica nem dar orientação
de saúde — e registro interno do caso. Decisão do Diogo.

---

## 9. Institucional e política — 12 perguntas

| # | Pergunta do cliente | Fonte | Quem resolve |
|---|---|---|---|
| 9.1 | Vocês entregam em todo o Brasil? | política | IA |
| 9.2 | Entregam em Portugal / exterior? | política | IA |
| 9.3 | Qual o prazo de garantia? | política | IA |
| 9.4 | Como funciona o processo? | política | IA |
| 9.5 | Vocês têm loja física? | política | IA |
| 9.6 | Qual o CNPJ de vocês? | política | IA |
| 9.7 | Quero falar com o Dr. Turí | — | Pedro |
| 9.8 | Quero ser afiliado / revender | — | Pedro |
| 9.9 | Sou jornalista, quero uma entrevista | — | Pedro |
| 9.10 | Tenho uma reclamação / vou no Procon | — | Pedro |
| 9.11 | Vocês são confiáveis? É golpe? | — | Pedro |
| 9.12 | Obrigado, resolveu! | — | IA (encerra) |

---

## Consolidado

| Domínio | Perguntas | IA sozinha | IA parcial | Pedro |
|---|---:|---:|---:|---:|
| 1. Guia Digital | 15 | 9 | 4 | 2 |
| 2. Pedido e entrega | 22 | 12 | 4 | 6 |
| 3. Financeiro | 18 | 10 | 4 | 4 |
| 4. Assinatura | 16 | 9 | 3 | 4 |
| 5. Produto | 12 | 7 | 4 | 1 |
| 6. Conta e acesso | 12 | 6 | 3 | 3 |
| 7. Prescrição | 6 | 0 | 0 | 6 |
| 8. Clínico | 10 | 9 (link) | 0 | 1 |
| 9. Institucional | 12 | 7 | 0 | 5 |
| **Total** | **123** | **69** | **22** | **32** |

**Leitura:** a IA resolve **56%** sozinha, adianta e escala **18%**, e **26%**
sempre precisa do Pedro.

As 9 do domínio clínico entram como resolvidas pela IA num sentido específico:
ela não responde a pergunta, ela **entrega o link** — que é exatamente o que a
equipe faria. Não há perda de qualidade no atendimento, porque a resposta
humana seria idêntica.

O terço humano não é falha do desenho — é ação externa (Hotmart, trocar
cartão, mudar endereço), julgamento (reclamação, reembolso) ou risco
clínico. Nenhum sistema deveria automatizar isso.

---

## Domínios de ferramenta que este catálogo justifica

Ferramentas por **domínio**, não por pergunta:

| Ferramenta | Cobre | Perguntas atendidas |
|---|---|---|
| `consultar_compras_guia` | `hotmart_sales` do e-mail verificado | ~13 |
| `consultar_pedidos` | `orders` + `order_items` + `shipping_json` completo | ~18 |
| `consultar_financeiro` | `payments` + `discount_coupons` | ~16 |
| `consultar_assinatura` | `subscriptions` + `terms_acceptances` | ~14 |
| `consultar_catalogo` | `products` (sem filtro de cliente) | ~12 |
| `consultar_conta` | `users` (campos não sensíveis) + `user_entitlements` | ~10 |

Seis ferramentas cobrem ~83 das 123 perguntas. As outras 40 são as que
escalam — e para essas a IA não precisa de ferramenta nenhuma, precisa
saber reconhecer e passar adiante com o contexto que já tem.

**Sem ferramenta, deliberadamente:** `protocols`, `protocol_items`,
`quiz_responses`, `health_records`, CPF, data de nascimento, IP.

---

## Pendências que este levantamento revelou

1. **`products.description` está vazio** na maioria dos produtos. Preencher
   converte 4 perguntas de "IA parcial" para "IA" — é o ganho de cobertura
   mais barato que existe aqui.
2. **`addresses` está zerada** mas existe 1 pedido. Conferir onde o
   endereço realmente vive antes de construir a ferramenta de pedidos.
3. **Respostas de política** (seções 5, 9) não estão em lugar nenhum do
   banco. Precisam virar um texto de referência que a IA consulte — ou
   essas ~14 perguntas escalam sem necessidade.
