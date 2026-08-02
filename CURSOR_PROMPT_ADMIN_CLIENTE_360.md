# Prompt para o Cursor — Busca de cliente + página 360° no admin

Criar uma forma de buscar um cliente no admin e ver TUDO relacionado a ele
numa página só: cadastro, endereço, assinatura, pedidos, rastreio de
entrega, protocolo/prescrição, respostas de saúde, comunicações, e o hash de
aceite dos termos de uso.

============================================================
PARTE 1 — Busca
============================================================

1.1 — Nova página `src/app/(admin)/admin/clientes/page.tsx`:
  - campo de busca (nome, e-mail, CPF ou client_code — usar `ilike` nos
    campos de texto de `users`)
  - lista os resultados (nome, e-mail, client_code, tier RFM se houver) com
    link pra `/admin/clientes/[id]`
  - sem busca digitada, lista os cadastros mais recentes (paginado)

1.2 — Em `src/app/(admin)/admin/usuarios/page.tsx`, cada linha da tabela já
  existente ganha um link/botão "Ver detalhes" apontando pra
  `/admin/clientes/[id]` (reaproveitar a lista que já existe, só linkar).

============================================================
PARTE 2 — Página de detalhe do cliente
============================================================

Criar `src/app/(admin)/admin/clientes/[id]/page.tsx`, organizada em seções
(cards ou abas, seguir o padrão visual já usado nas outras telas do admin):

**2.1 — Cabeçalho**
Nome, e-mail, telefone, CPF, client_code, role, data de cadastro, tier RFM
atual (de `user_rfm_scores`, se existir) com badge colorido.

**2.2 — Endereço**
Dados de `addresses` (endereço padrão e demais, se houver mais de um).

**2.3 — Assinatura**
De `subscriptions`: plano, status, iniciado em, expira em, próxima cobrança,
`pagarme_sub_id`, quantas tentativas de cobrança (`retry_count`). Se houver
mais de uma assinatura no histórico, listar todas, mais recente primeiro.

**2.4 — Pedidos e entrega**
De `orders` (todos os pedidos do usuário, mais recente primeiro), cada um
mostrando: status, valor total, data, código de rastreio
(`tracking_code`), origem do frete usada (deduzir pelo `shipping_quote_json`
se disponível), e — se houver `shipping_json` com eventos de rastreamento
— a lista desses eventos (data/hora + descrição) em ordem cronológica, tipo
uma linha do tempo simples. Indicar visualmente se o pedido já foi enviado
à farmácia (`pharmacy_sent_at`).

**2.5 — Pagamentos**
De `payments` vinculados às assinaturas do cliente: valor, status, data,
`pagarme_charge_id`.

**2.6 — Protocolo e prescrição**
De `protocols` + `protocol_items` + `products`: itens prescritos (nome,
obrigatório ou não, removido pelo paciente ou não, motivo de ativação),
status do protocolo (`pending_signature`/`signed`/`rejected`), quando foi
assinado e por qual profissional (join com `professionals` + `users`), link
pro PDF da prescrição (`prescription_pdf_url`).

**2.7 — Saúde**
Respostas do quiz (`quiz_responses`) e registros de saúde (`health_records`,
se houver) — resumidos de forma legível (não precisa ser bonito, só
completo).

**2.8 — Comunicações e acesso**
`notification_logs` (tipo, canal, status, data) e `user_login_history`
(data, IP, user agent) — mais recentes primeiro, limitar a exibir os
últimos 20 de cada pra não poluir a tela.

**2.9 — Conformidade**
`terms_acceptances`: versão aceita, hash (mostrar truncado com opção de
copiar o hash completo), IP, data do aceite. Se houver mais de um aceite
(ex: em compras diferentes), listar todos.

============================================================
NOTAS TÉCNICAS
============================================================

- Usar `createAdminClient()` (service role) pra todas as queries, já que é
  tela administrativa — igual o padrão já usado em `/admin/pedidos` e
  `/admin/usuarios`.
- Proteger a rota com a mesma checagem de role admin já usada nas outras
  páginas do grupo `(admin)`.
- Não precisa de nenhuma ação de escrita nessa tela por enquanto — é só
  visualização. Ações (reenviar etiqueta, etc.) continuam nas telas que já
  existem (`/admin/pedidos`).
