# Prompt — Fase 6, satélite 3: a lista de pedidos

> Referencie no Cursor com `@03-satelite-de-pedidos.md`.
> Branch: `reestrutura-suplementos`.
> Depende dos satélites 1 e 2 estarem no ar. Estão.

A aba **Pedidos** sai do núcleo. Só a **lista** — os três botões ficam onde estão,
e a próxima seção explica por quê.

## O que eu medi antes de escrever isto

A tela lê exatamente:

```
orders   id, status, created_at, tracking_code, total_amount, shipping_request_id
users    full_name, email, client_code
```

**Sem CPF, sem endereço, sem nada clínico.** Endereço só aparece na etiqueta,
que é botão, não lista.

Os três botões alcançam bem mais:

| ação | alcança |
|---|---|
| Atualizar rastreio | `orders`, a transportadora, e manda e-mail (nome + e-mail) |
| Gerar etiqueta | **`addresses`, CPF, `protocol_items`** |
| PDF da etiqueta | o arquivo na transportadora |

Por isso eles **continuam no núcleo**: é lá que o endereço e o CPF já moram, e
movê-los obrigaria o satélite a alcançar o que a lista não precisa ver.

Fica uma tela servida por um serviço com botões atendidos por outro. É feio no
diagrama e honesto na prática: cada pedaço é atendido por quem tem o alcance
mínimo para aquilo.

## Por que este satélite NÃO usa API de contrato

Ele lê três colunas de `users` — e `users` tem CPF na mesma tabela.

A ferramenta certa aqui não é contrato, é **privilégio por coluna**:

```sql
GRANT SELECT (id, full_name, email, client_code) ON users TO satelite_pedidos;
```

`cpf` e `birth_date` deixam de existir para ele. Não é que ele evita — o banco
recusa.

**Contrato vale quando a fronteira é uma linha inteira** (este pedido é seu,
aquele não), porque isso nenhum privilégio expressa. Aqui a fronteira é coluna,
e para coluna o Postgres já tem resposta. Uma peça a menos para manter.

A regra do papel é minha. Você não cria papel.

## O satélite

Pasta **`satelites/pedidos/`**, no formato dos outros dois. Importe a sessão de
`../comum/sessao.mjs` — **não copie**.

`package.json`: declare `postgres` **e** `@aws-sdk/rds-signer`.

Usuário do banco: **`satelite_pedidos`**, token IAM, `clinico`, ssl `require`.

### Ordem, como nos outros

1. Lê o cookie `sessao_satelite`.
2. Verifica. Sem cookie/inválido/expirado → **302** para `/suplementos/login`.
   Papel ≠ `admin` → **404**.
3. **Só então** abre conexão.

### Rota

```
GET /suplementos/admin/pedidos-lista
```

Nome diferente de `/suplementos/admin/pedidos` **de propósito**: aquele caminho
continua sendo do núcleo por enquanto, e trocar o dono de um caminho que já
existe é o tipo de coisa que quebra sem avisar. Eu ligo a troca depois, na
regra do ALB, quando a lista estiver provada.

### A consulta

A mesma de hoje, sem inventar campo:

```sql
SELECT o.id, o.status, o.created_at, o.tracking_code, o.total_amount,
       o.shipping_request_id, u.full_name, u.email, u.client_code
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id
 ORDER BY o.created_at DESC
 LIMIT 50
```

**Não selecione `u.*`.** Além de trazer o que não deve, o papel vai recusar — e
falhar em produção é pior do que não escrever.

### A tela

HTML puro, CSS embutido, paleta do satélite de alertas. Reproduza o que
`src/components/admin/PedidosActions.tsx` mostra hoje: colunas, rótulos de
estado em português, formatação de valor e data. **Não invente coluna nova.**

Estado vazio: diga que não há pedidos. Hoje a base está zerada, então **é esse
o estado que você vai ver ao testar** — e ele precisa ficar apresentável.

### Os botões

Cada linha mantém os três botões. Eles apontam para o núcleo, **caminho
absoluto e https**:

```
https://desafiodiabetes.com/api/admin/pedidos/<id>/atualizar-rastreio
https://desafiodiabetes.com/api/admin/pedidos/<id>/gerar-etiqueta
https://desafiodiabetes.com/api/admin/pedidos/<id>/pdf-etiqueta
```

Mesmo domínio, então o cookie do Supabase vai junto e o núcleo autentica como
sempre. **Não recrie essas rotas no satélite** e não mexa nelas no núcleo.

Podem ser formulários `POST` normais — sem JavaScript, como nos outros
satélites. Depois da ação, **303** de volta para a lista.

> Lembrete do satélite 2: `Location` precisa ser **absoluto e https**. Relativo
> faz alguma camada completar com o protocolo que ela recebeu, e a CloudFront
> fala http com o ALB — o navegador acaba mandado para `http://`.

Trate **`HEAD` como `GET`**, pelo mesmo motivo de lá: 404 em HEAD vira alarme
falso de monitor.

## O que NÃO fazer

- **Não apague** a página nem as rotas do núcleo. Nesta entrega o satélite
  **convive** com a tela atual — troco o caminho no ALB depois de provar, e aí
  sim a antiga sai. Foi assim que o portal atravessou sem susto.
- **Não toque em `addresses`, `protocol_items` nem em CPF.**
- **Não escreva nada.** A lista é leitura; quem grava são os botões, no núcleo.
- **Não copie** a verificação de sessão — importe de `satelites/comum/`.
- **Não mexa no `AdminNav.tsx`** ainda. A aba continua apontando para a tela
  velha até a troca.
- **Não crie papel, função, regra de ALB nem segredo.** Meu.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `satelites/pedidos/handler.mjs` importa `../comum/sessao.mjs` e nada de
   `src/`.
3. `grep -rniE "insert|update|delete" satelites/pedidos/` volta vazio.
4. `grep -oE "FROM [a-z_]+" satelites/pedidos/handler.mjs` mostra só `orders` e
   `users`, e **não existe `u.*` na consulta**.
5. Sem cookie válido, nenhuma rota abre conexão.
6. Os botões apontam para `https://desafiodiabetes.com/api/admin/pedidos/...`.
7. A tela do núcleo continua funcionando — nada foi apagado.

Quando terminar, me chame antes de mexer em outra coisa. Eu crio o papel com o
privilégio por coluna, a função e a regra, testo com sessão real — e só depois
troco o caminho da aba.
