# Prompt — Fase 8, passo 6: o Omie no ritmo da API

> Referencie no Cursor com `@06-omie-no-ritmo-da-api.md`.
> Branch: `reestrutura-suplementos`.
> Mexe só em `src/lib/inngest/functions/omie-backfill.ts` e no cliente Omie.

O backfill do Hotmart trouxe **1.049 vendas das duas contas**, com buscadas e
gravadas batendo. O do Omie falhou **duas vezes**, com cinco minutos de
intervalo e sem nada nosso chamando a API no meio.

Não é a nossa lógica. É o ritmo.

## O que eu medi na API deles

Chamei `ListarMovimentos` quatro vezes, com os mesmos parâmetros:

```
1ª                    ok
2ª imediatamente      ok
3ª                    RECUSOU — "Consumo redundante. Aguarde 56 segundos"
4ª, 8 segundos depois RECUSOU — "Aguarde 48 segundos"
```

São **dois guardas diferentes**, e a gente esbarra nos dois:

| erro | o que é |
|---|---|
| `Já existe uma requisição desse método sendo executada` | duas chamadas ao mesmo tempo |
| `Consumo redundante detectado. Aguarde N segundos` | **a mesma consulta repetida** |

O segundo é o que mais machuca: quando o Inngest repete um passo que falhou,
ele manda **exatamente os mesmos parâmetros** — que é o gatilho do bloqueio. A
tentativa de recuperação vira a causa da próxima falha.

## As três correções

### 1. A Omie diz quanto esperar — obedeça

A mensagem traz o número: *"Aguarde 56 segundos"*. **Extraia e espere aquilo**,
com uma folga de 2 segundos. Não chute intervalo fixo, e não use recuo
exponencial: o número certo está escrito na resposta.

Se a mensagem vier sem número, espere 60 segundos.

### 2. Pausa entre chamadas

Espere **1,5 segundo entre páginas e entre fatias**. É o que evita o guarda de
simultaneidade, que dispara quando a chamada seguinte sai antes de a anterior
ter sido liberada do lado deles.

### 3. Não repita consulta idêntica

Quando repetir depois de uma recusa, **a consulta não pode ser byte a byte a
mesma** que foi bloqueada, ou cai no mesmo guarda.

Variar o tamanho da página resolve — pedir 50 registros em vez de 100 devolve o
mesmo conteúdo com uma consulta diferente. Documente essa linha, porque parece
arbitrária e não é.

## Onde tratar

No **cliente Omie**, não em cada chamada espalhada. Uma função que envolve o
`POST` e cuida de pausa, leitura do tempo pedido e repetição — assim o job
diário ganha a mesma proteção sem ser reescrito.

**Limite as tentativas** (três por chamada). Bloqueio que persiste depois de
três esperas é problema de verdade, e tem que falhar visível em vez de ficar em
laço.

## Como saber que trouxe tudo

Medi a janela inteira agora:

```
365 movimentos nos últimos 12 meses, em 8 páginas
```

A Supabase tem **176** — falta mais da metade, e não é dado velho: as datas são
de março a maio de 2026.

Ao terminar, o `payload` deve trazer o total buscado. **Se vier muito abaixo de
365, alguma fatia foi engolida** — e é para isso que o número está aqui.

> `nTotRegistros` vem em toda resposta. Compará-lo com o que você juntou é a
> forma barata de saber se faltou página.

## O que NÃO fazer

- **Não mexa no backfill do Hotmart.** Está feito e conferido.
- **Não reduza a janela** de 12 meses.
- **Não pule fatia** que falhou: ela tem que aparecer no resultado como falha,
  não sumir.
- **Não apague nada** para "começar limpo". `ON CONFLICT DO UPDATE` já cobre
  repetição.
- **Não rode nada, não faça deploy.**

## Critério de pronto

1. `npx tsc --noEmit` e `npm run build` passam.
2. O tempo de espera sai **da mensagem da Omie**, não de constante no código.
3. Existe pausa entre páginas e entre fatias.
4. A repetição não manda consulta idêntica à recusada.
5. Máximo de três tentativas por chamada; depois disso, falha visível.
6. O `payload` final traz o total buscado, comparável com os 365.

Quando terminar, me chame. Eu subo, disparo, e comparo o que chegou com o que a
API diz existir.
