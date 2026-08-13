# Prompt 2 — Fase 0: tirar o dado clínico do token de triagem

> Referencie no Cursor com `@02-token-de-triagem-sem-dado-clinico.md`.
> Branch: `reestrutura-suplementos`. Arquivo: `src/lib/quiz/triage-session.ts`.

## Problema

O token de triagem é `base64url(JSON) + "." + HMAC`. **O corpo não é
criptografado** — é apenas codificado. Ele carrega:

`age`, `sex`, `is_pregnant_or_breastfeeding`, `renal_conditions`,
`hepatic_conditions`, `diagnosis_type`

Esse token fica no `sessionStorage` do navegador e é enviado no corpo do
checkout. Qualquer pessoa que o veja — extensão, log, print, suporte pedindo
"me manda o que aparece aí" — decodifica o quadro clínico sem chave nenhuma.

Segundo problema, em `getSecret()` (linha 18): quando `TRIAGE_SESSION_SECRET`
não existe, o segredo do HMAC **cai para `SUPABASE_SERVICE_ROLE_KEY`** — a chave
do banco vira chave de assinatura. Girar uma quebra a outra.

## A saída: impressão digital, não criptografia

Levantamento feito: **nenhum consumidor lê os campos clínicos do payload.** Os
únicos usos são `quizMatchesTriageSession` (comparação) e `triageSession.allowed`
(`checkout/create/route.ts:735`).

Como os campos só existem para serem comparados, **substitua os seis por um
único campo `fp`** — HMAC-SHA256 das respostas clínicas normalizadas.

Vantagem sobre criptografar: não há chave de decifragem para gerenciar, e o dado
clínico **deixa de existir no cliente em qualquer forma**, nem cifrado.

## O que fazer

1. `TriageSessionPayload` vira: `v: 2`, `exp`, `nonce`, `allowed`, `fp: string`.
   Remova os seis campos clínicos.

2. Crie uma função de normalização usada **pelos dois lados**, para garantir que
   geram exatamente a mesma string: arrays ordenados, booleanos coeridos,
   separador que não possa aparecer nos valores. Uma divergência silenciosa aqui
   rejeita todo checkout legítimo.

3. `createTriageSessionToken` calcula `fp` a partir das respostas.

4. `quizMatchesTriageSession` recalcula o `fp` a partir do quiz recebido e
   compara com `timingSafeEqual`. Mantenha a assinatura pública da função — o
   chamador em `checkout/create/route.ts:686` não deve mudar.

5. `getSecret()` passa a **exigir `TRIAGE_SESSION_SECRET`**. Sem fallback. Se
   faltar, erro claro dizendo qual variável falta.

6. Tokens `v: 1` passam a ser rejeitados (`return null`). Não implemente
   compatibilidade: o portão de pré-lançamento está fechado, ninguém está no
   meio de um checkout, e manter o formato antigo válido manteria o vazamento.

## Não faça

- Não crie tabela nem migração. Guardar a triagem no servidor é melhor a longo
  prazo, mas é Fase 3 — aqui a regra é fechar o furo sem criar peça nova.
- Não mexa em `checkout/create/route.ts` nem em `api/quiz/triage-session/route.ts`.
- Não altere `computeTriage` nem `assertTriageNotBlocked`.

## Estilo

Comente **por que** o token não carrega mais o quadro clínico. Siga o padrão do
arquivo.

## Ao terminar

```bash
npx tsc --noEmit
npm run build
```

## Como será verificado

1. Decodifico um token gerado e confirmo que **não há nenhum campo clínico**.
2. Gero token com um conjunto de respostas e valido contra o mesmo conjunto →
   precisa aceitar.
3. Valido contra um conjunto com **uma única condição renal a mais** → precisa
   recusar.
4. Removo `TRIAGE_SESSION_SECRET` do ambiente → precisa falhar com erro claro,
   e **não** cair na chave do banco.

## Dependência que eu resolvo antes do deploy

`TRIAGE_SESSION_SECRET` ainda não existe em produção. Eu gero e cadastro no
Secrets Manager e na definição de tarefa **antes** de publicar — se subir o
código sem a variável, o quiz para de emitir token.
