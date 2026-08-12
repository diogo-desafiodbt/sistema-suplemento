# Prompt para o Cursor — URGENTE: API pull da farmácia retornando 500 em produção

**Impacto**: `/api/farmacia/pedidos` e `/api/farmacia/pedidos/json` estão
retornando **HTTP 500** em produção. É por onde a Miligrama puxa os pedidos
pra produzir. Última chamada bem-sucedida registrada em
`pharmacy_api_logs`: **07/08/2026**. Nenhum pedido puxado desde então.

============================================================
CAUSA (diagnosticada, não é suposição)
============================================================

A query devolve `PGRST201` do PostgREST:

```
Could not embed because more than one relationship was found
for 'subscriptions' and 'protocols'
```

Existem duas foreign keys entre as tabelas:

| FK | Direção | Cardinalidade |
|---|---|---|
| `subscriptions_protocol_id_fkey` | `subscriptions.protocol_id → protocols.id` | many-to-one |
| `protocols_creation_subscription_id_fkey` | `protocols.creation_subscription_id → subscriptions.id` | one-to-many |

A segunda foi criada pela migration
`20260804022527_protocols_creation_subscription_id.sql`, cujo próprio
comentário diz que serve pra *"crash recovery sem órfão cross-user"* — é
controle interno da criação do protocolo, **não** o vínculo canônico.

Como o embed `protocols!inner` não diz qual usar, o PostgREST recusa a
query inteira.

============================================================
CORREÇÃO
============================================================

Usar a FK canônica explicitamente — `subscriptions_protocol_id_fkey`, que é
o protocolo atual da assinatura (many-to-one, casa com o tipo `protocols:
{ status } | null` que o código já espera).

Em **dois** arquivos:

- `src/app/api/farmacia/pedidos/route.ts` (linha ~39)
- `src/app/api/farmacia/pedidos/json/route.ts` (linha ~41)

Trocar:

```ts
subscriptions!inner (
  protocols!inner (
    status
  )
)
```

por:

```ts
subscriptions!inner (
  protocols!subscriptions_protocol_id_fkey!inner (
    status
  )
)
```

O filtro `.eq('subscriptions.protocols.status', 'signed')` **não muda** —
testado ao vivo contra o banco: com o embed desambiguado, esse caminho de
filtro continua válido e a query retorna 200.

Não mexer em mais nada nesses arquivos.

============================================================
VERIFICAÇÃO
============================================================

Testado contra o banco de produção com as duas sintaxes desambiguadas — as
duas retornam 200 (hoje com resultado vazio, porque o único pedido atual
está `pending` e sem `subscription_id`, então o `!inner` exclui
corretamente). O que importa é que sai do 500.

Depois de aplicar, dá pra confirmar em produção com:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <FARMACIA_API_TOKEN>" \
  "https://sistema-suplemento-desaf.vercel.app/api/farmacia/pedidos?data=2026-08-11"
```

Esperado: **200** (hoje dá 500).

============================================================
NOTA PARA MIM (não é pro Cursor):
============================================================
- Provável gatilho: o PostgREST cacheia o schema e só recarrega em DDL. A
  FK ambígua existe desde 04/08, mas as chamadas de 04, 05 e 07/08
  funcionaram — as 3 migrations que apliquei em 12/08 (hotmart, omie,
  youtube) provavelmente forçaram o reload que expôs o problema.
- Avisar a Miligrama depois de corrigido, já que eles ficaram sem puxar
  desde 07/08. O canal de e-mail continua funcionando em paralelo.
- A checagem diária de reconciliação (`pharmacy-reconciliation`, 9h) devia
  ter mandado e-mail de pendência nesses dias — vale conferir se chegou em
  `diretorcomercialtk2@gmail.com`.
