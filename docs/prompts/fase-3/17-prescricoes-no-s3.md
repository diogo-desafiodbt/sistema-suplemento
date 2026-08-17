# Prompt 17 — Fase 3: os PDFs de prescrição saem da Supabase para o S3

> Referencie no Cursor com `@17-prescricoes-no-s3.md`.
> Branch: `reestrutura-suplementos`.

Último item de código da Fase 3. Três arquivos mudam de fato, quatro chamadores
perdem um parâmetro, e um módulo novo nasce.

## A infra já existe e já foi testada

Não precisa criar nada na AWS. O bucket está de pé:

```
desafiodiabetes-prescricoes   us-east-1
  acesso público bloqueado nos 4 eixos
  versionamento ligado
  cifra padrão AES256 (SSE-S3) · SSE-C bloqueado
  política que nega qualquer acesso sem TLS
```

E o papel `ecsTaskRoleSistema` já tem a política `PrescricoesNoS3`. Simulei
com `iam simulate-principal-policy`, com a política do bucket junto:

| Ação | Decisão |
|---|---|
| `s3:PutObject` | allowed |
| `s3:GetObject` | allowed |
| `s3:ListBucket` | **implicitDeny** |
| `s3:DeleteObject` | **implicitDeny** |
| `s3:GetObjectVersion` | **implicitDeny** |

**Não peça permissões novas.** Se algo no código precisar de `ListBucket` ou
`DeleteObject`, o código está errado, não a política.

## A armadilha que decide o desenho

`GetObject` **sem** `ListBucket` faz o S3 devolver **`AccessDenied` para objeto
que não existe** — ele não revela ausência a quem não pode listar. Não vem
`NoSuchKey`.

Isso é proposital (quem tomar o papel não consegue enumerar prescrições), e
significa que **"não achei" e "não pude ver" chegam com a mesma cara**. Guarde
isso: é a razão da Correção 2.

## Correção 1 — trocar Supabase Storage por S3

Três lugares tocam o storage hoje:

- `src/app/api/prescricao/assinar/route.ts` — `admin.storage.from('prescricoes').upload(...)`
- `src/lib/pdf/signed-url.ts` — `admin.storage.from('prescricoes').createSignedUrl(...)`
- `src/lib/pdf/verificar-integridade.ts` — `admin.storage.from('prescricoes').download(...)`

### Dependências

Adicione `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner`. O
`@aws-sdk/rds-signer` já está no `package.json` — use a mesma faixa de versão.

### Módulo novo: `src/lib/s3/prescricoes.ts`

Concentre o acesso ao bucket num módulo só. Nenhuma rota deve instanciar
`S3Client` por conta própria.

Ele expõe três coisas:

- `enviarPdf(chave: string, corpo: Buffer): Promise<void>`
- `baixarPdf(chave: string): Promise<Buffer | null>` — **`null` quando não deu
  para ler, por qualquer motivo.** Não deixe o erro do SDK vazar.
- `urlAssinadaPdf(chave: string, segundos: number): Promise<string | null>`

Região: siga a convenção que já existe em `src/lib/db/index.ts`:

```ts
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
if (!region) throw new Error('AWS_REGION ... precisa estar definida')
```

Bucket: `process.env.S3_BUCKET_PRESCRICOES`, e **lança se ausente** — mesmo
padrão do `createAdminClient`. Não embuta o nome no código. Eu cadastro o
segredo `sistema/S3_BUCKET_PRESCRICOES` antes do deploy.

Credencial: **não passe chave de acesso.** O SDK pega sozinho do papel da
tarefa, exatamente como o `rds-signer` já faz. Se aparecer
`accessKeyId` em algum lugar, está errado.

Instancie o `S3Client` **uma vez** no módulo, não por chamada.

### O que muda nas assinaturas

`createPrescriptionPdfSignedUrl` e `verificarIntegridadePdf` recebem hoje um
`admin: SupabaseClient` como primeiro parâmetro. **Depois do S3 elas não
precisam mais dele** — tire o parâmetro e ajuste os quatro chamadores:

- `src/app/api/prescricao/assinar/route.ts`
- `src/app/api/farmacia/pedidos/json/route.ts`
- `src/app/suplementos/(admin)/admin/auditoria/page.tsx`
- `src/app/suplementos/(admin)/admin/clientes/[id]/page.tsx`

Nesses quatro, o `createAdminClient()` provavelmente fica sem uso — **remova a
chamada e o import quando for o caso.** Confira arquivo por arquivo; não
remova no escuro.

`PDF_URL_TTL_SEGUNDOS` continua 2 horas. A farmácia não guarda link: ela lê
`/api/farmacia/pedidos/json` e a URL é gerada na hora da leitura.

O nome do objeto continua `${protocol_id}.pdf`, e `prescription_pdf_path`
continua guardando esse mesmo valor. **Não invente prefixo de pasta** — mudaria
o significado das linhas que já existem no banco.

## Correção 2 — `indisponivel` precisa existir de verdade

`src/lib/pdf/verificar-integridade.ts` abre com este comentário:

> *"`alterado` é acusação: significa que o documento foi baixado e não confere
> com o que foi assinado. Não pode ser usado para 'não deu pra conferir' —
> caminho ausente, objeto sumido ou falha de rede viram `indisponivel`."*

**O código faz o contrário do que o comentário manda.** Retorna `'alterado'`
quando o caminho está ausente e quando o download falha. `'indisponivel'` nunca
é retornado por lugar nenhum — é código morto, apesar de ter tratamento pronto
na tela (`'Não verificável'`, âmbar).

Corrija para o contrato que o próprio arquivo declara:

| Situação | Hoje | Deve ser |
|---|---|---|
| Sem `pdf_hash` no log | `sem_registro` | `sem_registro` (não muda) |
| `prescription_pdf_path` nulo | `alterado` | **`indisponivel`** |
| Download falhou / objeto sumido | `alterado` | **`indisponivel`** |
| Baixou e o hash bate | `integro` | `integro` (não muda) |
| Baixou e o hash **não** bate | `alterado` | `alterado` (não muda) |

`alterado` passa a sair **só** no caminho em que o PDF foi realmente lido e o
sha256 divergiu. É o único caso em que a palavra é honesta.

**Isso não é faxina — é pré-requisito da Correção 1.** Com `GetObject` sem
`ListBucket`, PDF inexistente chega como negação de acesso. Sem essa correção,
todo PDF ausente viraria acusação de fraude na tela de auditoria. E já existe
uma prescrição assinada com `prescription_pdf_path` nulo no banco: ela cairia
nesse caminho hoje.

Por isso `baixarPdf` devolve `null` em vez de lançar — quem chama não deve
precisar distinguir tipo de erro do SDK para não caluniar ninguém.

## Correção 3 — parar de persistir a URL assinada

Em `assinar`, o `INSERT` em `prescription_audit_logs` grava a URL assinada na
coluna `pdf_url`. Isso é link temporário guardado para sempre num log que, por
projeto, não pode ser apagado nem alterado.

O item da Fase 0 dizia: *"URL do PDF: 30 dias para minutos, **e não
persistida**"*. A primeira metade foi feita (o TTL é 2 h). A segunda não.

**Grave `null` em `pdf_url`.** Não remova a coluna — a auditoria é
somente-inserção por `GRANT`, e migração de esquema em tabela de auditoria é
assunto separado. Só pare de alimentá-la.

O `pdf_hash` continua sendo gravado normalmente: é ele que dá a prova, e é
dele que a Correção 2 depende.

A resposta da rota (`{ ok: true, pdf_url }`) continua devolvendo a URL viva
para quem acabou de assinar. O que sai é só a persistência.

## O que NÃO fazer

- **Não rode SQL contra o banco.** A verificação é minha, pela tarefa ECS.
- **Não faça deploy**, e não mexa em task definition nem em Secrets Manager.
  Eu cadastro `sistema/S3_BUCKET_PRESCRICOES` e reviso a task definition depois.
- **Não mexa nos 3 sincronismos de conteúdo** (`youtube-analytics-sync`,
  `hotmart-sales-sync`, `omie-financeiro-sync`). Eles continuam com
  `supabase-js` de propósito — gravam no banco `conteudo`.
- **Não apague `src/lib/supabase/admin.ts`.** Ele continua sendo usado pelos
  três de cima.
- **Não mexa na trava de assinatura concorrente** (o `UPDATE protocols` sem
  `AND status = 'pending_signature'`). É defeito conhecido e real, mas está
  fora do plano desta fase e entra em prompt próprio.
- **Não migre arquivo nenhum.** Conferi no banco: `prescription_pdf_path` é
  `NULL` em todos os protocolos. Não há PDF na Supabase para mover.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `grep -rn "storage" src/` não devolve nenhuma linha de Supabase Storage.
3. `grep -rln "createAdminClient" src/` devolve **exatamente 4 arquivos**:
   `src/lib/supabase/admin.ts` e os três sincronismos de conteúdo. Se aparecer
   um quinto, sobrou chamada.
4. `indisponivel` aparece como valor de retorno em `verificar-integridade.ts`.
5. Nenhuma credencial de AWS em texto no código.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor.
