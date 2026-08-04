# API de Pedidos — Desafio Diabetes × Miligrama

Este documento explica como o sistema da Miligrama pode buscar ("puxar") os
pedidos do Desafio Diabetes diretamente da nossa API. O e-mail com o pedido
continua sendo enviado normalmente — a API é um canal adicional, mais
confiável para importação automática.

## URL base (produção)

```
https://sistema-suplemento-desaf.vercel.app
```

## Autenticação

Toda chamada precisa do cabeçalho `Authorization` com o token configurado
em `FARMACIA_API_TOKEN` (variável de ambiente no servidor — **nunca**
commitar o valor real):

```
Authorization: Bearer <FARMACIA_API_TOKEN>
```

Sem esse cabeçalho (ou com token errado), a API responde `401 Não autorizado`.

## Endpoints disponíveis

### 1. Listagem de pedidos (leve)

```
GET /api/farmacia/pedidos
```

Retorna só o número, a data e o status de cada pedido. Útil para conferência
rápida, sem baixar o JSON completo.

**Exemplo de chamada (curl):**

```bash
curl -H "Authorization: Bearer <FARMACIA_API_TOKEN>" \
  "https://sistema-suplemento-desaf.vercel.app/api/farmacia/pedidos?data=2026-07-30"
```

**Exemplo de resposta:**

```json
[
  {
    "numero_pedido": "8f4a1c2e-1234-4b5c-9d6e-abcdef012345",
    "data_compra": "2026-07-30T14:22:10.000Z",
    "status": "sent_to_pharmacy"
  },
  {
    "numero_pedido": "3b7d9e0f-5678-4a1b-8c2d-fedcba987654",
    "data_compra": "2026-07-30T18:05:44.000Z",
    "status": "pending"
  }
]
```

### 2. Pedidos completos para importação (JSON)

```
GET /api/farmacia/pedidos/json
```

Retorna os mesmos pedidos, mas cada um acompanhado do campo `pedido`, que é o
JSON completo no formato de importação da Miligrama (o mesmo JSON que já vai
anexado nos e-mails). **Só aparecem aqui os pedidos que já têm o JSON pronto.**

**Exemplo de chamada (curl):**

```bash
curl -H "Authorization: Bearer <FARMACIA_API_TOKEN>" \
  "https://sistema-suplemento-desaf.vercel.app/api/farmacia/pedidos/json?data=2026-07-30"
```

**Exemplo de resposta:**

```json
[
  {
    "numero_pedido": "8f4a1c2e-1234-4b5c-9d6e-abcdef012345",
    "data_compra": "2026-07-30T14:22:10.000Z",
    "status": "sent_to_pharmacy",
    "pedido": {
      "ClienteCodigo": 10023,
      "ClienteTipoPessoa": "F",
      "ClienteDocumento": "12345678900",
      "ClienteNome": "Maria da Silva",
      "ValorTotal": "189.90",
      "ValorFrete": "22.50",
      "DataVenda": "2026-07-30",
      "CodigoPedidoExterno": "8f4a1c2e-1234-4b5c-9d6e-abcdef012345",
      "Itens": [
        {
          "ProdutoReferencia": "DD-BERB-STD-0X30",
          "ProdutoCodigo": 2000,
          "ItemNome": "Berberina",
          "PrecoUnitarioVenda": "167.40",
          "Quantidade": "1.00"
        }
      ]
    }
  }
]
```

(O JSON real do campo `pedido` tem todos os campos do layout de importação —
o exemplo acima está resumido só para leitura.)

## Filtros de data

Os dois endpoints aceitam os mesmos parâmetros, sempre no formato
`YYYY-MM-DD` (ano-mês-dia), interpretados no horário de Brasília:

| Parâmetro | O que faz | Exemplo |
|-----------|-----------|---------|
| `data` | Pedidos de um dia específico | `?data=2026-07-30` |
| `desde` | Pedidos a partir de um dia (inclusive) | `?desde=2026-07-01` |
| `ate` | Pedidos até um dia (inclusive) | `?ate=2026-07-31` |
| `desde` + `ate` | Intervalo fechado | `?desde=2026-07-01&ate=2026-07-31` |

**Sem nenhum parâmetro, a resposta traz o histórico completo de pedidos.**

## Recomendação de uso

Chamar uma vez por dia, de manhã, buscando os pedidos do dia anterior:

```bash
curl -H "Authorization: Bearer <FARMACIA_API_TOKEN>" \
  "https://sistema-suplemento-desaf.vercel.app/api/farmacia/pedidos/json?data=<data-de-ontem>"
```

Substituindo `<data-de-ontem>` pela data do dia anterior (ex.: `2026-07-30`).

## Importante — conferência diária

Cada chamada feita à API fica registrada do nosso lado (data/hora, filtros
usados e pedidos retornados). Todos os dias fazemos uma conferência automática
para garantir que todos os pedidos do dia anterior foram puxados pela
Miligrama. Se algum pedido não tiver sido buscado (ou se não houver nenhuma
chamada no dia), um alerta é enviado por e-mail para regularizarmos juntos.

## Dúvidas

Qualquer dúvida técnica, falar com o time do Desafio Diabetes.
