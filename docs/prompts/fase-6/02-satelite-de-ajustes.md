# Prompt — Fase 6, satélite 2: ajustes (cupons e configuração)

> Referencie no Cursor com `@02-satelite-de-ajustes.md`.
> Branch: `reestrutura-suplementos`.
> Depende do satélite 1 estar no ar. Está: `/suplementos/admin/alertas`.

Duas telas saem do núcleo: **Cupons** e **Configuração**. Não viram dois
serviços — viram **um**, com duas abas. São a mesma coisa: tabela pequena, só
admin, zero dado clínico.

## O que muda em relação ao satélite 1

O de alertas **só lia**. Este **escreve**. Isso muda o cuidado, não o desenho.

Quem escreve cupom pode criar desconto de 100%. Então o alcance é apertado no
banco, não só no formulário:

```
discount_coupons   SELECT, INSERT, UPDATE     sem DELETE
system_config      SELECT, UPDATE             sem INSERT, sem DELETE
```

**`system_config` só aceita mudar chave que já existe.** Sem `INSERT`, ninguém
injeta configuração nova por ali — e as 27 chaves de hoje incluem o endereço de
quem despacha e as medidas das caixas. Mudar valor é operação normal; **criar
chave é mudar como o sistema funciona**, e isso não é trabalho de satélite.

Sem `DELETE` em lugar nenhum: cupom que não vale mais se desativa, não some.

## Parte 1 — extrair o que já existe

O satélite 1 verifica a sessão com código que vai se repetir aqui. **Segundo
uso é a hora de extrair, não a terceira.**

Crie **`satelites/comum/sessao.mjs`** com a função `verificarSessao(cookie)` e
o helper que lê o cookie do evento do ALB — movidos de
`satelites/alertas/handler.mjs`, sem reescrever a lógica.

Os dois satélites passam a importar de lá por caminho relativo
(`../comum/sessao.mjs`). Continua fora de `src/`: satélite não importa do Next.

**Não mude o comportamento na mudança de lugar.** A verificação já foi provada
contra o núcleo, inclusive o ataque de editar `role` para `admin`. Se você
"melhorar" alguma coisa aí, quebra uma prova que já custou trabalho.

## Parte 2 — o satélite

Pasta **`satelites/ajustes/`**, no mesmo formato do de alertas:

```
satelites/ajustes/
  handler.mjs      a função
  package.json     postgres + @aws-sdk/rds-signer  ← declare os DOIS
  LEIA-ME.md       o desenho em 10 linhas
```

> A dependência `@aws-sdk/rds-signer` foi esquecida no satélite 1 e a função
> subiu verde para morrer na primeira chamada. Declare.

Conexão idêntica à do satélite 1, trocando só o usuário: **`satelite_ajustes`**,
token IAM, banco `clinico`, ssl `require`.

### A ordem, igual à do satélite 1

1. Lê o cookie `sessao_satelite`.
2. Verifica. Sem cookie, inválido ou expirado → **302** para
   `/suplementos/login`. Papel ≠ `admin` → **404**.
3. **Só então** abre conexão.

Nunca consulte antes de verificar.

### Rotas

| caminho | o que faz |
|---|---|
| `GET /suplementos/admin/ajustes/cupons` | lista + formulário |
| `POST /suplementos/admin/ajustes/cupons` | cria ou atualiza cupom |
| `GET /suplementos/admin/ajustes/config` | lista as chaves + formulário |
| `POST /suplementos/admin/ajustes/config` | grava um valor |
| `GET /suplementos/admin/ajustes` | manda para `/cupons` |

HTML puro, formulários `POST` normais, CSS embutido. **Sem framework, sem
JavaScript no cliente.** Depois de gravar, responda **303** para a mesma tela —
assim atualizar a página não regrava.

O comportamento das telas de hoje é a referência: leia
`src/components/admin/CuponsClient.tsx` e `ConfigClient.tsx` e reproduza as
regras que estiverem lá (validações, campos, formatos). **Não invente regra de
negócio nova.** Se algo não estiver claro, pare e me pergunte.

### Escrita

- Valide tudo no servidor, mesmo o que o formulário já limita.
- `system_config`: só aceite chave que **já existe** — confira antes de gravar.
  Chave desconhecida → 400.
- Cupom: percentual entre 1 e 100, código sem espaço, data de validade no
  futuro quando informada.

## Parte 3 — o núcleo perde as duas telas

Apague, depois que o satélite estiver de pé:

```
src/app/suplementos/(admin)/admin/cupons/
src/app/suplementos/(admin)/admin/config/
src/app/api/admin/cupons/
src/app/api/admin/config/
src/components/admin/CuponsClient.tsx
src/components/admin/ConfigClient.tsx
```

Em `src/components/admin/AdminNav.tsx`, as abas **Cupons** e **Config**
continuam existindo — mudam de destino e ganham `externa: true`, como a de
Alertas:

```
{ label: 'Cupons', href: '/suplementos/admin/ajustes/cupons', externa: true },
{ label: 'Config', href: '/suplementos/admin/ajustes/config', externa: true },
```

Duas abas apontando para o mesmo serviço. **A pessoa vê o menu de sempre** — é
a regra da Fase 6b: a aparência é uniforme, o acesso é que não é.

## O que NÃO fazer

- **Não use `next/link`** para essas abas. A rota não é do Next; quem a conhece
  é o ALB.
- **Não apague nada do núcleo antes de o satélite existir.** Primeiro o novo de
  pé, depois o velho fora — na mesma entrega, mas nessa ordem.
- **Não crie `DELETE`** em cupom nem em configuração.
- **Não toque em `products`.** Catálogo não tem tela de admin hoje; criar uma
  seria funcionalidade nova, não mudança de lugar.
- **Não copie a verificação de sessão** para o novo handler — importe de
  `satelites/comum/`.
- **Não crie papel no banco, função, regra de ALB nem segredo.** Meu.
- **Não rode SQL, não faça deploy.**

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `satelites/ajustes/handler.mjs` não importa nada de `src/`, e importa a
   sessão de `../comum/sessao.mjs`.
3. `grep -rn "DELETE" satelites/` volta vazio.
4. `grep -rn "FROM\|INTO\|UPDATE" satelites/ajustes/handler.mjs` mostra só
   `discount_coupons` e `system_config`.
5. `grep -rn "admin/cupons\|admin/config" src/` mostra só o `AdminNav.tsx`, com
   os caminhos novos.
6. O satélite 1 continua funcionando depois da extração — a verificação de
   sessão não mudou de comportamento.
7. Sem cookie válido, nenhuma rota abre conexão com o banco.

Quando terminar, me chame antes de mexer em outra coisa. Eu crio o papel
`satelite_ajustes`, a função e as regras do ALB, e testo criando um cupom de
verdade e mudando uma chave de configuração.
