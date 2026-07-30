# Prompt para o Cursor — Integração Farmácia + Transportadora (Envie Agora)

Estou implementando duas integrações no projeto SISTEMA-SUPLEMENTOS/desafio-diabetes:
(1) envio do pedido para a farmácia de manipulação (só formato de JSON, por e-mail),
(2) integração completa com a transportadora Envie Agora, incluindo cotação de frete
EM TEMPO REAL no momento da compra (checkout), cobrando o frete do cliente.

CONTEXTO IMPORTANTE:
- O frete é cotado no checkout, não depois. O cliente vê e escolhe entre 2 opções:
  a mais barata e a mais rápida (sem mostrar nome de transportadora), e o valor do
  frete escolhido é somado ao total cobrado no cartão.
- A farmácia só recebe um JSON (schema fixo definido por eles), por e-mail.
- Quem gera a etiqueta e rastreia é o nosso sistema direto na Envie Agora, não a
  farmácia. A farmácia tem SLA de 24h pra manipular; passado esse prazo, criamos
  a etiqueta automaticamente usando o serviço de frete JÁ escolhido no checkout
  (não cotamos de novo).
- As dimensões/peso do pacote dependem de quais produtos estão no protocolo do
  paciente, porque cada produto usa uma caixa diferente (ver Parte 1).

============================================================
PARTE 1 — MIGRATION (Supabase)
============================================================

Nova migration em supabase/migrations/ (timestamp atual):

1. Adicionar novo produto em `products`:
   - name: 'Polivitamínico'
   - pharmacy_sku_monthly: 'DD-POLI-STD-0X30'
   - pharmacy_sku_quarterly: 'DD-POLI-STD-0X90'
   - pharmacy_sku_yearly: 'DD-POLI-STD-0X360'
   - price_monthly: 29.90
   - price_quarterly: 76.25
   - price_yearly: 251.16
   - is_fixed: false
   - is_active: true
   - box_type: 'R80'
   - description: 'Fórmula polivitamínica para suporte nutricional geral.'
     (PLACEHOLDER — trocar pela descrição real da composição)
   - activation_rules: '{}'::jsonb
     (PLACEHOLDER — nenhuma regra automática de ativação por quiz definida
     ainda; hoje só entra manualmente no protocolo até definirmos o gatilho
     clínico)

2. Atualizar `pharmacy_code` (hoje nulo em todos os produtos) — código
   provisório sequencial a partir de 2000, até termos os códigos reais de
   catálogo da Miligrama:
   - Berberina → 2000
   - Berberina Homeopata → 2001
   - Neuropatia → 2002
   - Ômega 3 → 2003
   - Polivitamínico → 2004
   - Resistência à Insulina → 2005
   - Vitamina B12 → 2006

3. Adicionar em `products`:
   - `box_type text` (valores possíveis: 'R80' ou 'R110')
   Seed dos produtos ativos:
   - box_type = 'R80'  para: Berberina, Neuropatia, Ômega 3, Polivitamínico
   - box_type = 'R110' para: Resistência à Insulina
   (confira o nome exato na coluna `products.name` antes de rodar o UPDATE)

4. Adicionar em `orders`:
   - `shipping_request_id text unique` (id_requisicao retornado pela Envie Agora
     ao criar a etiqueta — usado pra casar os webhooks com o pedido)
   - `shipping_service_code text` (codigoServico já escolhido no checkout)
   - `shipping_quote_json jsonb` (a cotação completa escolhida: valor, prazoDias,
     tipo economica/expressa, codigoServico — guardado pra referência/auditoria)

5. Inserir em `system_config` (on conflict do nothing):
   - shipping_sender_nome        | 'Miligrama Farmácia de Manipulação' | Nome do remetente nas etiquetas (CONFIRMAR nome legal exato)
   - shipping_sender_cep         | '80220030'
   - shipping_sender_logradouro  | 'R. Des. Westphalen'
   - shipping_sender_numero      | '2201'
   - shipping_sender_complemento | ''
   - shipping_sender_bairro      | 'Rebouças'
   - shipping_sender_cidade      | 'Curitiba'
   - shipping_sender_uf          | 'PR'
   - shipping_box_r80_altura       | '8'
   - shipping_box_r80_largura      | '18'
   - shipping_box_r80_comprimento  | '14.5'
   - shipping_box_r80_peso         | '0.2'
   - shipping_box_r110_altura      | '7.2'
   - shipping_box_r110_largura     | '22.5'
   - shipping_box_r110_comprimento | '14.5'
   - shipping_box_r110_peso        | '0.4'

============================================================
PARTE 2 — CATÁLOGO DO POLIVITAMÍNICO NO SITE
============================================================

Em `src/lib/supplements-content.ts`, adicione uma entrada nova pro slug
"polivitaminico" seguindo o mesmo formato das outras (heroHorizontal,
heroVertical, gallery). Como ainda não temos fotos reais desse produto, copie
o arquivo `public/categorias/categoria-omega3.png` para
`public/categorias/categoria-polivitaminico.png` e use esse caminho como
PLACEHOLDER temporário em heroHorizontal/heroVertical/gallery — deixe um
comentário indicando que precisa ser substituído pela foto real do produto.

============================================================
PARTE 3 — TIPOS, CLIENTE DA ENVIE AGORA E CÁLCULO DE PACOTE
============================================================

Base URL: https://envieagora.com.br/api/v1
Auth: header `apitoken: <valor>` (não é Bearer)
Env vars novas (.env.local, depois Vercel):
  ENVIE_AGORA_API_TOKEN=0b8b84d3-d09a-48f1-b750-b4edfa5a912f.1f18b816-af87-6f7c-b0f0-8329e8d1608a
  ENVIE_AGORA_BASE_URL=https://envieagora.com.br/api/v1

3.1 — Crie `src/types/shipping.ts` com os tipos completos baseados no OpenAPI
oficial (arquivo em ~/Downloads/ENVIE AGORA API.yaml — use como fonte de verdade
pros nomes de campo exatos):
  - CotacaoRequest / CotacaoResponse (precosprazos[], incluindo pontoPickup
    opcional quando for Jadlog Pickup)
  - AdicionarEtiquetaRequest (objeto, remetente, destinatario, notafiscal
    opcional, chave_dce opcional) / AdicionarEtiquetaResponse
  - PdfEtiquetaRequest / PdfEtiquetaResponse
  - RastreamentoRequest / RastreamentoResponse (eventos[])
  - WebhookEtiquetaPayload (id_requisicao, numero_etiqueta, valor_cobrado,
    numero_plp, url_pdf)
  - WebhookRastreamentoPayload (eventos[], mesma shape do RastreamentoResponse)

3.2 — Crie `src/lib/shipping/package.ts`:

  export type PackageItem = { box_type: 'R80' | 'R110'; quantity: number }

  export async function computePackageDimensions(items: PackageItem[]):
    Promise<{ altura: number; largura: number; comprimento: number; peso: number }>

  Lógica:
  - agrupe os itens por box_type, somando as quantidades de cada grupo presente
  - busque as dimensões/peso de cada box_type em system_config
    (shipping_box_r80_* / shipping_box_r110_*)
  - altura final = soma de (altura_do_tipo × quantidade_do_tipo), por cada tipo
    presente (empilha)
  - peso final = soma de (peso_do_tipo × quantidade_do_tipo), por cada tipo
    presente
  - largura final = MAIOR largura entre os tipos presentes (não soma)
  - comprimento final = MAIOR comprimento entre os tipos presentes (não soma)
  - arredonde altura/largura/comprimento pra cima (Math.ceil), já que a Envie
    Agora exige integer nesses três campos

3.3 — Crie `src/lib/shipping/envie-agora/client.ts`: função privada
`envieAgoraFetch(path, body)` — POST com header apitoken + Content-Type json,
lança erro com o corpo da resposta se status != 2xx.

3.4 — Crie `src/lib/shipping/envie-agora/cotacao.ts`:
  `getCotacao(params: { cepdestino: string; valordeclarado: number; dimensions:
  { altura, largura, comprimento, peso } })` → POST /precosprazos, usando
  ceporigem = system_config.shipping_sender_cep, avisorecebimento e maopropria
  = "N", e as dimensões recebidas por parâmetro (já calculadas via
  computePackageDimensions pelo chamador).

3.5 — Crie `src/lib/shipping/envie-agora/etiqueta.ts`:
  `criarEtiqueta(params: { order; dimensions: {...}; codigoServico: string })`
  → POST /adicionaretiqueta. Remetente sempre vem de system_config
  shipping_sender_*. Destinatario vem do endereço do pedido. objeto usa as
  `dimensions` recebidas por parâmetro, valordeclarado = valor dos produtos
  (sem frete), codigoservico = params.codigoServico.
  `getPdfEtiqueta(id_requisicao, tipo_impressao?)` → POST /pdfetiqueta

3.6 — Crie `src/lib/shipping/envie-agora/rastreamento.ts`:
  `getRastreamento(id_requisicao)` → POST /rastreamento

3.7 — DELETE `src/lib/shipping/sender.ts` (stub antigo que só mandava e-mail —
substituído pela integração real acima).

============================================================
PARTE 4 — COTAÇÃO EM TEMPO REAL NO CHECKOUT
============================================================

4.1 — Crie `src/app/api/shipping/cotacao/route.ts` (rota pública, POST):
  - recebe `{ cepdestino: string, valordeclarado: number, protocol_items: {
    product_id: string, quantity: number }[] }`
  - busca o `box_type` de cada product_id na tabela `products`
  - chama `computePackageDimensions` (parte 3.2) pra obter as dimensões reais
    desse pedido específico
  - chama `getCotacao` (parte 3.4) com essas dimensões
  - a partir do array `precosprazos` retornado, calcule:
    * economica = item com menor `valor`
    * expressa = item com menor `prazoDias` (empate: o de menor valor)
  - se `economica.codigoServico === expressa.codigoServico`, retorne só UMA
    opção
  - retorne ao cliente APENAS: `{ tipo: 'economica' | 'expressa', valor,
    prazoDias, codigoServico }[]` — NUNCA inclua `transportadora` nem
    `nomeServico` na resposta
  - se a Envie Agora falhar, retorne 200 com array vazio + `erro: true` (não
    pode quebrar o checkout — ver fallback em 4.3)

4.2 — Em `src/app/(public)/checkout/page.tsx`:
  - logo após `handleCepBlur` resolver o endereço com sucesso, chame
    `/api/shipping/cotacao` com o CEP resolvido, o valor dos produtos do
    carrinho, e os protocol_items ativos (já existe via `getActiveItems()`)
  - mostre as opções retornadas como dois cards/radio (ou um só, se vierem
    iguais): "Entrega econômica" / "Entrega expressa", mostrando valor (R$) e
    prazo ("chega em até N dias úteis") — sem nome de transportadora
  - pré-selecione a econômica por padrão, permita trocar
  - some o valor do frete escolhido ao subtotal dos produtos pra exibir e
    cobrar o total final (ajuste `getTotal()` e o `total_amount` enviado em
    `/api/checkout/create`)
  - inclua no POST de `/api/checkout/create` um campo novo:
    `shipping: { tipo, valor, prazoDias, codigoServico }`

4.3 — Fallback: se a cotação falhar ou não carregar, o checkout segue sem
  bloquear a compra, enviando `shipping: { tipo: 'padrao', valor: 0,
  prazoDias: 0, codigoServico: '' }`. O job de criação de etiqueta (parte 5.3)
  faz uma cotação de segurança na hora nesse caso, escolhendo o mais barato.

4.4 — Em `src/app/api/checkout/create/route.ts`:
  - adicione `shipping` ao `checkoutSchema` (zod): objeto com tipo (enum
    'economica'|'expressa'|'padrao'), valor (number), prazoDias (number),
    codigoServico (string)
  - adicione o mesmo campo em `PendingCheckoutPayload`
    (src/lib/protocol/create-from-checkout.ts)
  - inclua `shipping: data.shipping` dentro do `pendingCheckout` salvo em
    `subscriptions.pending_checkout`

============================================================
PARTE 5 — CRIAÇÃO DA ETIQUETA (24h depois, usando o frete já escolhido)
============================================================

5.1 — Em `src/lib/inngest/functions/pharmacy-order.ts` (e/ou
`src/app/api/farmacia/enviar/route.ts`, onde o registro em `orders` é criado):
ao inserir o novo pedido, busque também `subscriptions.pending_checkout.shipping`
e grave em `orders.shipping_service_code` (= shipping.codigoServico) e
`orders.shipping_quote_json` (= o objeto shipping inteiro).

5.2 — Em `src/app/api/prescricao/assinar/route.ts`: REMOVA a chamada
`await sendToTransportadora(pendingOrder.pharmacy_json as PharmacyOrder)` e o
import correspondente. No lugar, dispare:

  await inngest.send({
    name: 'farmacia/pedido-enviado',
    data: { order_id: pendingOrder.id },
  })

5.3 — Crie `src/lib/inngest/functions/create-shipping-label.ts`:
  - trigger: evento `farmacia/pedido-enviado`
  - `step.sleep('aguardar-sla-farmacia', '24h')`
  - busca o pedido (orders + endereço do usuário + protocol_items ativos com
    seus products.box_type)
  - calcula `dimensions` via `computePackageDimensions` (sempre recalcula na
    hora de criar a etiqueta, usando os produtos reais do protocolo)
  - se `orders.shipping_service_code` estiver preenchido, usa ele direto
  - SE ESTIVER VAZIO (fallback do 4.3): chama `getCotacao` na hora com as
    `dimensions` calculadas, escolhe o mais barato, usa esse código
  - chama `criarEtiqueta` (parte 3.5) com esse código + as `dimensions`
  - salva `id_requisicao` em `orders.shipping_request_id` e a resposta em
    `orders.shipping_json`
  - se falhar, loga o erro sem derrubar a function (botão manual serve de
    fallback, parte 7)
  - registre a function no client do Inngest (mesmo lugar de
    pharmacy-order/avulso-renewal-reminder)

============================================================
PARTE 6 — WEBHOOKS DA ENVIE AGORA
============================================================

6.1 — Crie `src/app/api/webhooks/shipping/etiqueta/route.ts`:
  - recebe WebhookEtiquetaPayload (id_requisicao, numero_etiqueta,
    valor_cobrado, numero_plp, url_pdf)
  - insere em `webhook_logs` (source: 'shipping', event_type: 'etiqueta_gerada')
  - localiza o pedido por `shipping_request_id = id_requisicao`
  - atualiza `orders.tracking_code = numero_etiqueta`,
    `orders.status = 'dispatched'`, mescla o payload em `shipping_json`
  - marca o webhook_log como processed: true
  - sempre responde 200 (loga erro de negócio sem forçar retry da Envie Agora)

6.2 — Crie `src/app/api/webhooks/shipping/rastreamento/route.ts`:
  - recebe WebhookRastreamentoPayload (eventos[])
  - insere em `webhook_logs` (source: 'shipping', event_type:
    'rastreamento_atualizado')
  - localiza o pedido pelo `id_requisicao` de qualquer evento do array
  - mescla os novos eventos em `orders.shipping_json`
  - se algum evento tiver `finalizado === 1`, atualiza
    `orders.status = 'delivered'`
  - marca o webhook_log como processed: true

============================================================
PARTE 7 — ADMIN (fallback manual)
============================================================

7.1 — Em `src/app/(admin)/admin/pedidos/page.tsx`: botão "Gerar etiqueta agora"
nos pedidos com status `sent_to_pharmacy` e sem `shipping_request_id` — chama
nova rota `POST /api/admin/pedidos/[id]/gerar-etiqueta`, que roda a mesma
lógica da parte 5.3 (recalcula dimensions, usa shipping_service_code já salvo
com fallback de cotação se vazio) de forma síncrona.

7.2 — No mesmo `src/app/(admin)/admin/pedidos/page.tsx`, para pedidos que já
têm `shipping_request_id` preenchido, adicione mais dois botões manuais (não
dependem só do webhook):
  - "Atualizar rastreio agora" — chama nova rota
    `POST /api/admin/pedidos/[id]/atualizar-rastreio`, que usa
    `getRastreamento` (parte 3.6) com o `shipping_request_id` do pedido,
    mescla os eventos retornados em `orders.shipping_json` (mesma lógica de
    merge do webhook 6.2), e atualiza `status` para `delivered` se algum
    evento vier com `finalizado === 1`.
  - "Baixar PDF da etiqueta" — chama nova rota
    `POST /api/admin/pedidos/[id]/pdf-etiqueta`, que usa `getPdfEtiqueta`
    (parte 3.5) com o `shipping_request_id` do pedido e retorna a `url` pra
    abrir em nova aba. Trate o erro de forma visível (toast) caso a Envie
    Agora ainda não tenha liberado autorização especial pra PDF nessa conta
    (ver nota no final do prompt).

============================================================
PARTE 8 — REESTRUTURAR O JSON DA FARMÁCIA
============================================================

O JSON que a farmácia exige (exemplo fornecido por eles) tem este formato
exato — mantenha TODOS os campos:

{
  "ClienteCodigo": 38939, "ClienteTipoPessoa": "F", "ClienteDocumento": "09655938948",
  "ClienteIdentidade": "", "TransportadoraCodigo": 24, "ValorTotal": "56.73",
  "ValorFrete": "0.00", "ValorEncargos": "0.00", "ValorDesconto": "0.00",
  "ValorComissao": "0.00", "DataVenda": "2026-05-19", "DataPagamento": "2026-05-19",
  "Entrega": false, "EntregaNome": "Vitor Marcelino", "EntregaEmail": "...",
  "EntregaTelefone": "+5548996221683", "EntregaLogradouro": "Rua Joaquim Pedro Machado, 265",
  "EntregaLogradouroNumero": "S/N", "EntregaLogradouroComplemento": "...",
  "EntregaBairro": "", "EntregaMunicipioNome": "Paulo Lopes", "EntregaUnidadeFederativa": "SC",
  "EntregaCEP": "88490000", "CupomDescontoCodigo": "", "Origem": "S",
  "CupomDescontoValor": "0.00", "NumeroObjeto": "", "Observacoes": "https://...",
  "ObservacoesLoja": "Importado via API Manual", "CodigoStatus": 11,
  "OrigemPedido": "MANUAL", "OrigemExterno": "Manual", "CodigoPedidoExterno": "S-2xEL3SMNAz-8",
  "CodigoPedido": "", "Empresa": 2, "OrcamentoImpresso": false, "ValorTotalBruto": "472",
  "Orcamento": false, "TipoVenda": "V", "ClienteNome": "Vitor Marcelino",
  "HoraVenda": "10:55:32", "Cancelada": false, "Reservada": false,
  "VendaPagamentos": [{ "Valor": "56.73", "DataVencimento": "2026-05-19", "FormaPagamentoCodigo": 15 }],
  "Itens": [{ "Codigo": 0, "ProdutoReferencia": "BR-HLM-BIN-0X90", "ProdutoCodigo": 1700,
    "ItemNome": "Biotina 5mg x 90caps x 3M", "PrecoUnitarioVenda": "11.39",
    "PrecoUnitarioCusto": "0.00", "Quantidade": "1.00", "ItemDescontoPercentual": "0.00",
    "ItemDescontoValor": "0.00", "ItemDescontoValorTotal": "0.00", "ItemValorBruto": "11.39",
    "ItemValorLiquido": "11.39", "Servico": false, "Movimentacao": [] }],
  "PesoLiquido": "0.01", "Status": [], "ClienteTipoDesconto": "", "ClienteDesconto": "0.00",
  "FormaParcelamentoCodigo": 1, "Parcelas": [], "Obs1": "", "Obs2": "", "Obs3": "",
  "PrevisaoEntregaEmDias": 0, "FreteSimulado": "0.00", "TipoDeCalculoDeFrete": "",
  "ClienteExistente": true
}

8.1 — Reescreva `src/types/pharmacy.ts` com esse schema completo e fiel (strings
pra valores monetários, integer pra códigos, boolean pros flags).

8.2 — Reescreva `src/lib/pharmacy/json-builder.ts`. `buildPharmacyJson` monta o
JSON acima assim:
  - ClienteCodigo: extrair somente os dígitos de `users.client_code` (formato
    "DD-000001") e converter pra integer (parseInt) — ex: "DD-000001" → 1
  - ClienteTipoPessoa: sempre "F"
  - ClienteDocumento: users.cpf (somente dígitos)
  - ClienteIdentidade: sempre ""
  - TransportadoraCodigo: system_config.pharmacy_carrier_code (integer)
  - ValorFrete: orders.shipping_quote_json.valor formatado com 2 casas
    decimais como string
  - ValorTotal / ValorTotalBruto: valor dos produtos + ValorFrete, como string
    com 2 casas
  - ValorEncargos / ValorDesconto / ValorComissao: "0.00"
  - DataVenda / DataPagamento: data atual (YYYY-MM-DD)
  - Entrega: sempre false
  - EntregaNome/Email/Telefone: users.full_name / users.email / users.phone
  - EntregaLogradouro/LogradouroNumero/LogradouroComplemento/Bairro/
    MunicipioNome/UnidadeFederativa/CEP: endereço padrão em `addresses`
  - CupomDescontoCodigo/Valor: "" / "0.00"
  - Origem: sempre "S"
  - NumeroObjeto: sempre ""
  - Observacoes: protocols.prescription_pdf_url
  - ObservacoesLoja: sempre "Importado via API Desafio Diabetes"
  - CodigoStatus: sempre 11
  - OrigemPedido: sempre "DESAFIO_DIABETES"
  - OrigemExterno: sempre "Desafio Diabetes"
  - CodigoPedidoExterno: orders.id
  - CodigoPedido: sempre ""
  - Empresa: system_config.pharmacy_company_id (integer)
  - OrcamentoImpresso / Orcamento: sempre false
  - TipoVenda: sempre "V"
  - ClienteNome: users.full_name
  - HoraVenda: hora atual (HH:mm:ss)
  - Cancelada / Reservada: sempre false
  - VendaPagamentos: 1 item — Valor = ValorTotal, DataVencimento = DataVenda,
    FormaPagamentoCodigo = system_config.pharmacy_payment_code (integer)
  - Itens: um por protocol_item ativo — ProdutoReferencia = SKU do plano
    (getPharmacySkuKey já existente), ProdutoCodigo = products.pharmacy_code,
    ItemNome = products.name, PrecoUnitarioVenda = preço do plano
    (getUnitPriceFromProduct já existente), PrecoUnitarioCusto = "0.00",
    Quantidade = "1.00", campos de desconto = "0.00", ItemValorBruto =
    ItemValorLiquido = PrecoUnitarioVenda, Servico = false, Movimentacao = []
  - PesoLiquido: peso calculado via `computePackageDimensions` desse pedido
    (parte 3.2), formatado como string
  - Status: sempre []
  - ClienteTipoDesconto: sempre ""
  - ClienteDesconto: sempre "0.00"
  - FormaParcelamentoCodigo: sempre 1
  - Parcelas: sempre []
  - Obs1/Obs2/Obs3: sempre ""
  - PrevisaoEntregaEmDias: orders.shipping_quote_json.prazoDias (ou 0)
  - FreteSimulado: mesmo valor de ValorFrete
  - TipoDeCalculoDeFrete: sempre ""
  - ClienteExistente: true se já existir outro pedido deste user_id com
    pharmacy_sent_at preenchido, senão false

Remova as funções antigas `buildTransportadoraCodigo` e `buildFormaPagamentoCodigo`.

8.3 — Atualize `src/app/api/farmacia/enviar/route.ts` e
`src/lib/inngest/functions/pharmacy-order.ts` pra nova assinatura de
`buildPharmacyJson` (selects trazendo users.cpf, users.phone, orders.id,
subscriptions.pending_checkout, products.box_type, e os system_config novos).

8.4 — Em `src/lib/pharmacy/sender.ts`, em `sendPharmacyOrderEmail` e
`sendToPharmacyWithPdf`, adicione o JSON como anexo de arquivo além do corpo:
  attachments: [
    { filename: `pedido-${json.CodigoPedidoExterno}.json`,
      content: Buffer.from(JSON.stringify(json, null, 2)) },
    ...(anexos que já existem)
  ]

============================================================
NOTAS PARA MIM (follow-up humano, não é pro Cursor resolver):
============================================================
- Depois de subir em produção, preciso mandar as URLs de
  /api/webhooks/shipping/etiqueta e /api/webhooks/shipping/rastreamento pro
  SAC da Envie Agora pra eles cadastrarem (não é self-service).
- Preciso pedir autorização especial ao suporte da Envie Agora pra habilitar
  o PDF da etiqueta (/pdfetiqueta).
- Confirmar o nome legal exato da farmácia (usei "Miligrama Farmácia de
  Manipulação" como placeholder em shipping_sender_nome).
- Substituir os códigos provisórios de pharmacy_code (2000-2006) pelos
  códigos reais de catálogo assim que a Miligrama passar.
- Escrever a descrição real e trocar a foto placeholder do Polivitamínico.
- Definir a regra clínica de ativação automática do Polivitamínico no quiz.
