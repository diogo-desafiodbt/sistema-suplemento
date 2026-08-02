# Prompt para o Cursor — Área do cliente: pedidos com máximo de informação

Enriquecer a área do cliente (`/dashboard/pedidos`) com foto de produto,
linha do tempo de rastreio, prazo estimado de entrega e uma página de
detalhe por pedido. Só leitura — nenhum dado novo no banco, tudo já existe.

============================================================
PARTE 1 — Lista de pedidos com foto do produto
============================================================

Em `src/app/(patient)/dashboard/pedidos/page.tsx`:

1.1 — Para cada item do pedido, buscar a foto do produto: os produtos vêm
  de `order_items.products.name`; usar o mesmo padrão de casamento por nome
  já usado em `CategoryCarousel.tsx` (`matchProduct` ou equivalente) contra
  as entradas de `src/lib/supplements-content.ts`, pegando `gallery[0]`
  como imagem. Se não achar correspondência, usar um ícone/placeholder
  neutro (não quebrar a tela).

1.2 — Cada card do pedido passa a ser um link pra
  `/dashboard/pedidos/[id]`.

1.3 — Trocar a lógica de status atual (`getPatientOrderStatus`) por algo
  mais informativo, reaproveitando a função existente em
  `src/lib/order-status.ts` como base, mas adicionar um estado
  intermediário quando `pharmacy_sent_at` estiver preenchido e o pedido
  ainda não tiver `tracking_code` (hoje isso cai em "Pedido confirmado",
  igual a um pedido recém-criado — perde a informação de que já está com a
  farmácia). Sugestão de rótulos: "Pedido confirmado" → "Em preparação na
  farmácia" (quando `pharmacy_sent_at` preenchido) → "Em trânsito" (quando
  `tracking_code` preenchido) → "Entregue".

============================================================
PARTE 2 — Nova página de detalhe do pedido
============================================================

Criar `src/app/(patient)/dashboard/pedidos/[id]/page.tsx`. Autenticar o
usuário normalmente (`createClient()` + `getUser()`), e ao buscar o pedido
**filtrar por `user_id = user.id` além do `id`** — é a área do próprio
cliente, um usuário não pode ver pedido de outro usuário pela URL.

Buscar de `orders`: `id, status, created_at, total_amount, tracking_code,
pharmacy_sent_at, shipping_quote_json, shipping_json, pharmacy_json,
order_items(quantity, unit_price, products(name))`.

**2.1 — Produtos do pedido**
Nome, foto (mesmo casamento por nome da Parte 1.1), quantidade, preço
unitário.

**2.2 — Linha do tempo de rastreio**
Ler `orders.shipping_json` (array de eventos com `descricao`/`datahora`/
`finalizado`, vindo dos webhooks da Envie Agora) e renderizar em ordem
cronológica (mais antigo primeiro), com um indicador visual simples (ponto
+ linha conectando os eventos). Se não houver nenhum evento ainda, mostrar
"Aguardando atualização de rastreio" no lugar da timeline.

**2.3 — Prazo estimado de entrega**
Ler `shipping_quote_json.prazoDias` (o prazo puro salvo na compra) e
calcular a data estimada usando `estimateCustomerDeliveryDays` (já existe
em `src/lib/shipping/estimate.ts`) somada a partir de `orders.created_at`.
Exibir como "Previsão de entrega: até [data]" — só mostrar enquanto o
pedido não estiver `delivered` (depois de entregue, essa previsão perde o
sentido, mostrar só a data real de entrega, se tiver algum evento com
`finalizado = 1` no `shipping_json` contendo a data).

**2.4 — Endereço de entrega**
IMPORTANTE: usar o endereço salvo em `orders.pharmacy_json`
(`EntregaLogradouro`, `EntregaLogradouroNumero`, `EntregaLogradouroComplemento`,
`EntregaBairro`, `EntregaMunicipioNome`, `EntregaUnidadeFederativa`,
`EntregaCEP`) — **não** buscar da tabela `addresses` atual do usuário, pois
o endereço pode ter mudado desde a compra; o `pharmacy_json` é o retrato
fiel do endereço usado *naquele* pedido específico.

**2.5 — Pagamento**
Valor total do pedido, valor do frete (também de `shipping_quote_json`, se
presente), e forma de pagamento — inspecionar `payments.webhook_payload`
(buscar o payment vinculado à mesma subscription do pedido, se existir) pra
extrair se foi cartão ou Pix; se não for possível determinar com clareza,
omitir esse dado em vez de mostrar informação errada.

**2.6 — Código de rastreio**
Mostrar com botão de copiar (reaproveitar o `CopyButton` já criado pro
admin, em `src/components/admin/CopyButton.tsx` — mover pra um local
compartilhado tipo `src/components/CopyButton.tsx` se fizer sentido, ou
duplicar o componente pro lado do paciente, critério do Cursor).

============================================================
NOTAS
============================================================

- Seguir o layout visual já usado nas páginas do paciente (mesmo
  `DashboardNav`, mesma paleta).
- Essa página é só leitura.
