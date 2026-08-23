# Prompt — Fase 8, passo 4: o histórico de 12 meses

> Referencie no Cursor com `@04-backfill-de-12-meses.md`.
> Branch: `reestrutura-suplementos`.

O sync diário funciona, mas a janela dele é de **dois dias**. O histórico nunca
veio — e nem estava completo na Supabase:

```
Supabase   hotmart_sales  388 linhas, 15/05 a 22/08, UMA conta
           omie_movimentos 176 linhas, 25/02 a 05/08
RDS        23 · 0
```

Este passo puxa **12 meses da origem**, não da Supabase. A fonte tem a verdade;
a Supabase seria uma cópia parcial de segunda mão.

Doze meses é **margem de segurança**, não expectativa: se não houver venda tão
antiga, a API devolve menos e está certo.

## São duas contas Hotmart

Vendem **o mesmo guia**, com ids de produto diferentes:

| conta | segredos | produto |
|---|---|---|
| antiga | `HOTMART_*` | `7689853` |
| nova | `HOTMART2_*` | `7700976` — "O Primeiro Passo" |

Testei a credencial nova: funciona, e a **primeira página dos 12 meses já traz
500 vendas**, com mais páginas atrás. É provável que essa conta seja a maior, e
ela nunca foi sincronizada.

A coluna **`hotmart_sales.conta_product_id`** já existe no RDS, e as 23 linhas
atuais já estão marcadas como da conta antiga. Grave-a em toda venda.

## O que fazer com os scripts que existem

`scripts/hotmart-backfill.mjs` e `scripts/omie-backfill.mjs` já fazem quase
isso — paginam, fatiam em janelas, tratam limite de requisição. **Reaproveite a
lógica.** O que muda:

1. **Destino**: saem do `@supabase/supabase-js` e passam a gravar no RDS,
   usando `src/lib/conteudo/db.ts`. Se ele não servir para script avulso
   (Node fora do Next), adapte — mas **use o mesmo usuário `job_conteudo` e
   token IAM**, sem senha.
2. **Janela**: de ~6 meses para **12**.
3. **Hotmart roda duas vezes**, uma por conta, com o conjunto de segredos de
   cada uma. Um parâmetro na linha de comando resolve:
   `node scripts/hotmart-backfill.mjs --conta=2`.

## Rodar em pedaços tem que ser seguro

Isso não é conforto, é requisito: 12 meses de duas contas vão demorar, e a
chance de cair no meio é real.

As chaves únicas já existem — `transaction_code` no Hotmart, `codigo_titulo` e
`codigo` no Omie. **Todo gravação é `ON CONFLICT DO UPDATE`.** Rodar duas vezes
atualiza, não duplica.

Imprima o progresso por janela — *"fatia 3/24: 217 vendas, 217 gravadas"* — para
dar para retomar sabendo onde parou. Script silencioso que roda vinte minutos é
indistinguível de script travado.

## As armadilhas que já custaram caro

Mesmas do passo 3, e valem aqui porque o script grava direto:

- **`ON CONFLICT` precisa do índice** — use as chaves acima, não invente.
- **`numeric` volta como texto** e **`timestamptz` como `Date`**.
- **Array vazio não pode ser interpolado**: `${[]}` vira parâmetro onde o SQL
  espera cláusula, e dá `syntax error at or near "$3"`. **Se a janela vier
  vazia, não chame o banco.** Vai acontecer — 12 meses atrás pode não ter nada.

## O que NÃO fazer

- **Não mexa nos jobs diários do Inngest.** Eles já funcionam; o backfill é
  script avulso e roda à mão.
- **Não leia nada da Supabase.** A origem são as APIs.
- **Não apague linha nenhuma**, nem para "limpar antes". Se houver divergência,
  quero ver a divergência.
- **Não religue o YouTube.**
- **Não rode o script**, não faça deploy. Rodar é meu, e vou rodar olhando.

## Critério de pronto

1. `npx tsc --noEmit` e `npm run build` passam.
2. `grep -rn "supabase" scripts/` volta vazio.
3. `node scripts/hotmart-backfill.mjs --conta=2` usa `HOTMART2_*`; sem o
   parâmetro, usa `HOTMART_*`.
4. Toda venda gravada tem `conta_product_id`.
5. Janela vazia **não chama o banco** e não derruba o script.
6. O progresso aparece por janela, com quantos vieram e quantos foram gravados.

Quando terminar, me chame. Eu rodo os três — Hotmart nas duas contas e Omie —
acompanhando, e depois confiro o total por conta e o intervalo de datas antes
de a gente falar em desligar a Supabase.
