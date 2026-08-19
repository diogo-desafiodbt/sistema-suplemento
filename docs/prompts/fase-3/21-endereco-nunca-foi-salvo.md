# Prompt 21 — o endereço do cliente nunca foi salvo

> Referencie no Cursor com `@21-endereco-nunca-foi-salvo.md`.
> Branch: `reestrutura-suplementos`.

Um arquivo de código e uma migração. Defeito achado em 19/08, no segundo teste
de checkout.

## O sintoma

"Finalizar a compra" devolve **"Erro interno"**. No CloudWatch:

```
Checkout error: there is no unique or exclusion constraint
                matching the ON CONFLICT specification
```

Código Postgres **42P10**.

## A causa

`src/app/api/checkout/create/route.ts`, por volta da linha 784:

```ts
await sql`
  INSERT INTO addresses ${sql({ user_id, zip_code, street, ... })}
  ON CONFLICT (user_id) DO UPDATE SET ...
`
```

**`addresses` não tem restrição única em `user_id`.** Conferi: existe só a chave
primária em `id` e um índice **não único** `idx_addresses_user_id`. `ON CONFLICT`
exige uma restrição ou índice único que case exatamente com as colunas — índice
comum não serve.

Conferi também na Supabase: **lá também não existe.** Ou seja, isto nunca
funcionou em lugar nenhum. Não é regressão do corte para o RDS.

A prova está no dado: **a tabela `addresses` tem zero linhas.** Nenhuma compra
jamais salvou endereço, porque nenhuma compra jamais passou desta linha.

Mesma família do 42P10 que já apareceu no recálculo de RFM: o código assume uma
unicidade que ninguém pediu ao banco.

## Correção 1 — a migração

Crie `supabase/migrations/<timestamp>_addresses_user_id_unico.sql` (siga o padrão
de nomes que já existe na pasta):

```sql
-- O checkout faz upsert de endereço por user_id, mas a unicidade nunca existiu:
-- ON CONFLICT (user_id) falhava com 42P10 e a tabela ficou vazia desde sempre.
-- Decisão do Diogo em 19/08/2026: um endereço por cliente. A cada compra, o
-- endereço é sobrescrito.
CREATE UNIQUE INDEX IF NOT EXISTS addresses_user_id_uidx
  ON public.addresses (user_id);
```

A tabela está vazia, então não há risco de o índice falhar por dado duplicado.

**Não aplique a migração.** Eu aplico no RDS pela tarefa ECS e confiro. Você só
escreve o arquivo.

## Correção 2 — o código

Com o índice existindo, o `ON CONFLICT (user_id)` do checkout passa a funcionar
**sem nenhuma mudança**. Confira que ele está correto e **não mexa nele**.

O que precisa mudar é outra coisa, no mesmo trecho: hoje esse `INSERT` está
**fora** de qualquer tratamento de erro próprio — ele estoura e cai no `catch`
geral da rota, que devolve o genérico "Erro interno". Foi por isso que o defeito
chegou até mim como três palavras sem informação nenhuma.

Envolva o `INSERT` em `try/catch` com `console.error` identificando a etapa, no
mesmo espírito do que já existe em `terms_acceptances insert error` algumas
linhas acima. Mantenha o comportamento: se falhar, a compra não deve seguir.

## Sobre a coluna `is_default`

A tabela tem `is_default`, que só faria sentido com vários endereços por
cliente. **Não a remova** — remover coluna é migração destrutiva e ela não
atrapalha. Com um endereço por cliente ela fica sempre `true`.

Se um dia o produto precisar de "entregar em outro endereço", o caminho é trocar
o índice por um parcial (`UNIQUE (user_id) WHERE is_default`) e ajustar o
`ON CONFLICT` para repetir a mesma condição. **Não faça isso agora** — foi
decidido o caminho simples de propósito.

## O que NÃO fazer

- **Não aplique a migração** nem rode SQL contra o banco.
- **Não faça deploy**, não mexa em task definition nem em Secrets Manager.
- **Não remova `is_default`** nem mude o `ON CONFLICT` para parcial.
- **Não crie `/nova-senha`**, não mexa na trava de assinatura concorrente, não
  toque nos três sincronismos de conteúdo.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. A migração existe, cria `addresses_user_id_uidx` e usa `IF NOT EXISTS`.
3. O `INSERT INTO addresses` está dentro de `try/catch` com `console.error`
   próprio, e a falha continua interrompendo a compra.
4. O `ON CONFLICT (user_id)` continua igual.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor.
