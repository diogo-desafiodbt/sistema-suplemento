# RESOLVIDO — era a integração Vercel, não o Inngest

**Diagnóstico fechado em 20/08/2026.** Este documento era um relato para o
suporte do Inngest. Não precisou: a causa era nossa.

## O que estava acontecendo

O app `desafio-diabetes` estava registrado no Inngest **como um app da Vercel**:

```
Platform            Vercel
Vercel project      sistema-suplemento
URL                 https://sistema-suplemento.vercel.app/api/inngest
Method              Serve
```

A integração Inngest ↔ Vercel continuava ligada depois do corte para a AWS. A
cada `git push` no repositório, a Vercel construía o projeto antigo, sincronizava
com o Inngest e registrava **a URL dela** — sobrescrevendo a nossa.

O Inngest então chamava a Vercel, não a AWS. Os 13 jobs paravam.

**Cada push quebrava a camada assíncrona.** Por isso não havia relação com deploy
na AWS: o gatilho era o push, não o deploy.

## O histórico de syncs mostrava a disputa

```
19/08 20:23  Success     ← nosso PUT
19/08 20:25  No change   ← a Vercel volta
20/08 14:50  Success     ← nossa ressincronização
20/08 15:30  Success
```

E o commit exibido no painel era o nosso, da branch `reestrutura-suplementos` —
a Vercel construindo código que já não roda em lugar nenhum.

## Por que as hipóteses anteriores falharam

**`serveOrigin` não ajudava.** Ele controla o que o NOSSO app reporta. A Vercel
registra a URL dela, do lado dela — nenhuma configuração nossa alcança isso.

**A regra do ALB não ajudava.** Ela garante que o Inngest, ao nos chamar, chegue
no núcleo. Mas o Inngest não estava nos chamando.

**Dois serviços com o mesmo app id não era o problema.** Era um serviço a mais
do que eu contava: o da Vercel, que eu achava desligado porque a memória do
projeto dizia "arquivado no painel do Inngest".

Arquivar o app não desliga a integração.

## A correção

Integração Vercel desconectada no Inngest e projeto apagado na Vercel, em
20/08/2026.

## O que fica

- **Ressincronização a cada 15 minutos** (`scripts/ligar-ressync-inngest.sh`):
  vira desnecessária, mas fica por enquanto — só removo depois de alguns pushes
  sem quebra.
- **A pergunta 6 do vigia** fica para sempre. Ela pegou a terceira ocorrência em
  49 minutos, contra três dias da primeira. E foi ela que forçou a investigação
  que chegou aqui.

## A lição

Eu passei horas procurando no lado errado porque a memória do projeto dizia que
a Vercel tinha sido "arquivada" e eu tratei isso como "desligada". Arquivar um
app não desconecta a integração que o alimenta.

Quando algo quebra sem relação com o que você mudou, a pergunta certa não é
"o que eu fiz?" — é "o que ainda está ligado que eu achei que tinha desligado?".
