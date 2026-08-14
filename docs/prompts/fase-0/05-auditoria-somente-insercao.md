# Prompt 5 — Fase 0: log de auditoria somente-inserção e verificação de integridade

> Referencie no Cursor com `@05-auditoria-somente-insercao.md`.
> Branch: `reestrutura-suplementos`.

## O que já existe (não refazer)

Melhor do que eu supunha ao escrever o plano. `api/prescricao/assinar/route.ts`
já grava em `prescription_audit_logs`: `pdf_hash` (vindo de
`generatePrescriptionPdf`), `payload_snapshot`, `professional_id`, `signed_at`,
IP e user-agent.

**Metade da camada de integridade já está de pé.** Faltam duas coisas.

## Problema 1 — o registro pode ser alterado ou apagado

Levantamento no banco:

```
dono da tabela: postgres
quem pode UPDATE/DELETE: postgres, service_role
```

`service_role` é a credencial que **todo o sistema usa hoje**, inclusive rotas
que respondem ao navegador. Um log de auditoria que o próprio sistema pode
reescrever não prova nada: quem conseguir executar código no núcleo apaga o
rastro do que fez.

Registro de auditoria só vale se for **somente-inserção**.

### O que fazer

Migração em `supabase/migrations/`:

```sql
REVOKE UPDATE, DELETE ON public.prescription_audit_logs FROM service_role;
```

Deixe `postgres` (dono) com a permissão — é o caminho de manutenção via
migração, e retirá-la do dono não funciona de qualquer forma.

Faça o mesmo raciocínio para `pharmacy_order_dispatch_logs` e
`webhook_logs`, **se** eles forem registros de fato e não fila de trabalho
(se alguma rotina atualiza status ali dentro, deixe como está e me diga qual).

## Problema 2 — não existe como verificar

O hash é gravado e nunca mais é olhado. Guardar impressão digital sem ter como
compará-la é teatro: descobre-se a adulteração no dia em que alguém pensar em
conferir à mão.

### O que fazer

Crie `src/lib/pdf/verificar-integridade.ts` com uma função que, dado um
`protocol_id`:

1. lê o `pdf_hash` mais recente em `prescription_audit_logs`
2. baixa o objeto atual do bucket a partir de `prescription_pdf_path`
3. recalcula o hash com o **mesmo algoritmo** de `generatePrescriptionPdf`
4. devolve um resultado com três estados distintos:
   `'integro'`, `'alterado'`, `'sem_registro'`

Não invente o algoritmo: leia como `generatePrescriptionPdf` calcula e use o
mesmo. Se divergirem, a função acusa adulteração em documento intacto — o que é
pior que não ter verificação, porque gera desconfiança em cima de nada.

Exponha também na tela de auditoria do admin
(`suplementos/(admin)/admin/auditoria/page.tsx`): uma coluna ou selo por
registro mostrando o estado. Sem botão de ação, sem correção automática — só
mostrar.

## Não faça

- Não remova `payload_snapshot`, mesmo sendo grande. É o que permite reconstruir
  o que foi assinado quando o PDF sumir.
- Não crie assinatura criptográfica com certificado agora. ICP-Brasil é decisão
  do Dr. Turí e do jurídico, e é outra fase.
- Não mexa na geração do PDF.
- Não apague nem altere registro nenhum de auditoria.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

**Não aplique a migração.** Eu aplico e verifico.

## Como será verificado

1. Com a chave `service_role`, tentar `UPDATE` num registro de auditoria →
   precisa ser recusado.
2. Com a chave `service_role`, tentar `DELETE` → precisa ser recusado.
3. Com a mesma chave, `INSERT` continua funcionando.
4. A função de verificação devolve `'integro'` para um PDF intacto.
5. Trocando o objeto no bucket por outro conteúdo, devolve `'alterado'`.
