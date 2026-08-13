# Prompt 1 — Fase 0: autorização na leitura de protocolo

> Referencie este arquivo no Cursor com `@01-autorizacao-leitura-de-protocolo.md`.
> Branch: `reestrutura-suplementos`.

## Problema

Em `src/app/suplementos/(professional)/profissional/protocolo/[id]/page.tsx` a
página confere que o usuário tem papel `professional` ou `admin` e, em seguida,
busca o protocolo com `createAdminClient()` usando apenas `.eq('id', id)`.

Não existe nenhuma verificação de que **aquele** protocolo pode ser visto por
**aquele** profissional. Trocando o UUID na URL, qualquer profissional logado
abre o prontuário completo de qualquer paciente — inclusive protocolos já
assinados, de outros profissionais e de qualquer data.

A consulta traz idade, sexo, gravidez, condições renais e hepáticas, tipo de
diagnóstico, medicações e alergias.

## Correção

Um profissional só pode abrir um protocolo quando:

- `status = 'pending_signature'` — está na fila aberta; **ou**
- `signed_by = id do usuário logado` — foi ele quem assinou, é o histórico dele

O papel `admin` continua sem essa restrição.

**Aplique o filtro na própria consulta**, não depois de carregar. Dado clínico
não deve chegar à memória do processo se a pessoa não pode vê-lo.

Sem resultado → `notFound()` do `next/navigation`.

**As duas respostas precisam ser idênticas.** Não diferencie "não existe" de
"não pode ver", nem por mensagem, nem por código, nem por redirecionamento
diferente — a diferença vira um jeito de descobrir quais IDs existem.

## Também verifique

`src/app/suplementos/(professional)/profissional/assinados/page.tsx` — a lista
deve mostrar apenas protocolos com `signed_by` igual ao usuário logado; admin vê
todos. Se já estiver correto, não mexa.

## Não faça

- **Não crie migração.** Não adicione coluna de profissional designado: hoje
  existe 1 profissional, e atribuição de fila entra quando houver o segundo.
- Não altere `profissional/fila/page.tsx`.
- Não troque `createAdminClient()` por outro client agora — isso é a Fase 3.
- Não reformate arquivos além dos dois citados.

## Estilo

Siga o padrão dos arquivos vizinhos. Comente **por que** a regra de autorização
existe, não o que o código faz.

## Ao terminar

Rode e informe o resultado:

```bash
npx tsc --noEmit
npm run build
```

## Como será verificado

Subo o app local, entro como profissional e tento abrir um protocolo assinado
por outra pessoa. Precisa devolver 404 **idêntico** ao de um UUID inexistente.
