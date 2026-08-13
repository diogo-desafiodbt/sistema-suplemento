# Troca de credenciais dos webhooks — Miligrama e Envie Agora

Estado: **aplicadas em produção em 13/08/2026 e verificadas** — credencial atual
e nova aceitas, query string recusada. Falta os parceiros trocarem e as
variáveis `..._ANTERIOR` serem apagadas.

## O que mudou no sistema

1. Cada parceiro passa a ter uma credencial própria, só para autenticar as
   chamadas **deles para nós**.

   Antes, o webhook da Miligrama caía de volta no `FARMACIA_API_TOKEN` — o
   mesmo segredo que *nós* enviamos a *eles*. Um token servindo aos dois
   sentidos não pode ser girado sem quebrar o outro lado.

2. As três rotas passam a aceitar **apenas o header `Authorization`**. Token em
   query string (`?token=`) vaza para log de acesso, proxy e referrer.

3. Durante a troca, a credencial anterior continua aceita, via as variáveis
   `FARMACIA_WEBHOOK_TOKEN_ANTERIOR` e `SHIPPING_WEBHOOK_TOKEN_ANTERIOR`.
   Assim a virada não depende de sincronizar o minuto com o parceiro.

   **Apagar essas duas variáveis fecha a janela** — sem deploy de código. Fazer
   isso assim que cada parceiro confirmar. Deixá-las para sempre anula a
   rotação inteira.

## Ordem de execução

1. Gravar `FARMACIA_WEBHOOK_TOKEN` e `SHIPPING_WEBHOOK_TOKEN` (valores novos) e
   as duas `..._ANTERIOR` (valores atuais) no Secrets Manager.
2. Publicar o sistema.
3. Conferir que os webhooks seguem respondendo com a credencial **antiga** —
   é o que garante que nada parou.
4. Enviar as mensagens abaixo.
5. Ao confirmarem, apagar as `..._ANTERIOR` e publicar.
6. Conferir de novo, agora com a credencial nova.

## Sobre enviar o token

Os textos abaixo levam a credencial no corpo, por decisão do Diogo — é o que
faz o parceiro conseguir agir sem uma segunda troca de mensagens.

A contrapartida: e-mail fica arquivado nos dois lados por tempo indeterminado.
Se houver suspeita de vazamento, **girar a credencial é rápido**: gravar um
valor novo em `FARMACIA_WEBHOOK_TOKEN` / `SHIPPING_WEBHOOK_TOKEN`, mover o
atual para o `..._ANTERIOR` correspondente e publicar. O parceiro continua
funcionando enquanto atualiza.

---

## Mensagem — Miligrama

> Assunto: Atualização da credencial do webhook de despacho — Desafio Diabetes
>
> Olá, tudo bem?
>
> Estamos padronizando a autenticação das integrações e precisamos atualizar a
> credencial que vocês usam para nos notificar o despacho dos pedidos.
>
> **Endpoint (não muda):**
> `POST https://www.desafiodiabetes.com/api/webhooks/farmacia`
>
> **O que muda:** a credencial passa a ser exclusiva desse webhook — hoje ela é
> a mesma que usamos nas chamadas que fazemos à API de vocês. Separar as duas
> permite trocar uma sem afetar a outra.
>
> **Como enviar:** no header HTTP
>
> ```
> Authorization: Bearer ddbt_miligrama_thK0KGOW6DYqVvi2DvUoznFeNRrw53uz9dkKOgcIhho
> ```
>
> **Importante:** o envio do token pela query string (`?token=`) deixa de ser
> aceito. Se a integração de vocês estiver usando esse formato, é preciso mudar
> para o header acima.
>
> **Prazo:** não há urgência operacional — a credencial atual continua
> funcionando durante a transição, então nada para enquanto vocês fazem a
> troca. Assim que confirmarem, encerramos a credencial antiga.
>
> Qualquer dúvida, estamos à disposição.

---

## Mensagem — Envie Agora

> Assunto: Atualização da credencial dos webhooks — Desafio Diabetes
>
> Olá, tudo bem?
>
> Estamos padronizando a autenticação das integrações e precisamos atualizar a
> credencial dos webhooks que vocês nos enviam.
>
> **Endpoints (não mudam):**
> `POST https://www.desafiodiabetes.com/api/webhooks/shipping/etiqueta`
> `POST https://www.desafiodiabetes.com/api/webhooks/shipping/rastreamento`
>
> Os dois usam a mesma credencial.
>
> **Como enviar:** no header HTTP
>
> ```
> Authorization: Bearer ddbt_envieagora_q5bObtLFbrslW_92v471Uul1lSsi6aRQNffngv9IhDU
> ```
>
> **Importante:** o envio do token pela query string (`?token=`) deixa de ser
> aceito. Se a integração de vocês estiver usando esse formato, é preciso mudar
> para o header acima.
>
> **Prazo:** não há urgência operacional — a credencial atual continua
> funcionando durante a transição, então nenhum evento se perde enquanto vocês
> fazem a troca. Assim que confirmarem, encerramos a credencial antiga.
>
> Qualquer dúvida, estamos à disposição.

---

## Como conferir depois de cada etapa

```bash
# Sem credencial: precisa recusar
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://www.desafiodiabetes.com/api/webhooks/farmacia   # espera 401

# Query string: precisa recusar mesmo com o token certo
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://www.desafiodiabetes.com/api/webhooks/farmacia?token=TOKEN'  # espera 401

# Header: precisa passar da autenticação (não pode ser 401)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d '{}' \
  https://www.desafiodiabetes.com/api/webhooks/farmacia
```
