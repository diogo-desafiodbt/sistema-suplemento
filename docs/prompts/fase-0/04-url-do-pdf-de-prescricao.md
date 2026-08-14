# Prompt 4 — Fase 0: a URL do PDF de prescrição

> Referencie no Cursor com `@04-url-do-pdf-de-prescricao.md`.
> Branch: `reestrutura-suplementos`.

## Problema

`src/app/api/prescricao/assinar/route.ts:149` gera uma URL assinada do PDF com
**30 dias** de validade (`60 * 60 * 24 * 30`), grava em
`protocols.prescription_pdf_url` (linha 159) e essa URL:

- é embutida no `pharmacy_json` (`json-builder.ts:78`, campo `Observacoes`)
- é **armazenada** na tabela de pedidos (`pharmacy-order.ts:461`)
- é devolvida como está pela rota de pull (`api/farmacia/pedidos/json`)
- vira link na tela de admin (`admin/clientes/[id]/page.tsx:683`)

Quem obtiver esse JSON — log, encaminhamento de e-mail, backup de planilha, um
print — abre a prescrição por **um mês**, sem autenticação nenhuma.

## Por que não basta trocar o número

A farmácia puxa o pedido horas ou dias depois da assinatura, e recebe o
`pharmacy_json` **armazenado**. Se a URL for gerada na assinatura com prazo
curto, ela chega morta e a integração quebra.

**A URL tem que ser gerada no momento em que é entregue, não no momento em que
o PDF é criado.**

## O que fazer

### 1. Guardar o caminho, não a URL

Migração em `supabase/migrations/`: adicionar
`protocols.prescription_pdf_path text`.

Preencher para as linhas existentes extraindo o caminho da URL já gravada
(hoje é **1 linha**). **Não remova a coluna `prescription_pdf_url`** nesta
etapa — a limpeza vem depois de tudo verificado em produção.

### 2. Assinatura grava o caminho

Em `api/prescricao/assinar/route.ts`: depois do upload, gravar
`prescription_pdf_path` com o caminho do objeto. **Parar de gerar e gravar a URL
de 30 dias.**

A resposta da rota pode seguir devolvendo uma URL assinada curta, para o
profissional conferir o que assinou logo em seguida.

### 3. Um único lugar define o prazo

Crie uma constante exportada, com comentário explicando o compromisso:

```ts
/** Validade da URL assinada do PDF, em segundos. */
export const PDF_URL_TTL_SEGUNDOS = 2 * 60 * 60 // 2 horas
```

**Use 2 horas, não minutos.** Ainda não confirmamos com a Miligrama se eles
baixam o PDF na hora em que puxam o pedido ou em lote depois. Duas horas já é
uma redução de 360 vezes sobre os 30 dias e não corre risco de quebrar a
operação. Quando a confirmação vier, muda-se um número num lugar só.

### 4. A rota de pull assina na hora

`api/farmacia/pedidos/json/route.ts` devolve o `pharmacy_json` armazenado. Ele
passa a sair do banco **sem URL** no campo de observações; a rota gera a URL
assinada a partir de `prescription_pdf_path` e a injeta na resposta.

Ou seja: o que está gravado não serve para abrir o PDF. Só a resposta da
chamada autenticada serve, e por 2 horas.

Vale para `api/farmacia/pedidos/route.ts` também, se ele devolver o mesmo campo.

### 5. Admin assina na hora

`admin/clientes/[id]/page.tsx`: o link do PDF passa a ser gerado no render, a
partir do caminho, com a mesma constante.

## Não faça

- Não remova `prescription_pdf_url` ainda.
- Não mude o formato do `pharmacy_json` além do campo que carrega a URL — o
  contrato com a Miligrama é deles.
- Não mexa na geração do PDF nem no upload em si.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

**Não aplique a migração.** Eu aplico e verifico.

## Como será verificado

1. O `pharmacy_json` gravado no banco **não contém URL** que abra o PDF.
2. A rota de pull devolve uma URL que **funciona agora**.
3. Essa mesma URL, com o prazo vencido, deixa de funcionar.
4. A URL de 30 dias que existe hoje na única linha assinada **para de ser
   distribuída** — mesmo que a coluna antiga ainda a contenha.
