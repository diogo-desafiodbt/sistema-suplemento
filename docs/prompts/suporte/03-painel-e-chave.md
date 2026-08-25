# Prompt — Suporte com IA, entrega 3: o painel e a chave

> Referencie no Cursor com `@03-painel-e-chave.md`.
> Branch: `reestrutura-suplementos`.
> Fonte: `CURSOR_PROMPT_SUPORTE_AGENTE_IA.md`, partes 11 e 12.
> Entregas 1 e 2 estão no ar e testadas (24/08/2026).

Esta entrega dá ao Pedro a tela para julgar, e cria a chave que um dia
liberará o envio automático. **A chave nasce em `off` e fica em `off`.**
Ligar é decisão do Diogo, com dado do modo `shadow` na mão — não é o fim
desta entrega.

Ao terminar cada parte, pare e avise.

---

## O que já existe (não refaça)

- `support_analyze` percorre triagem → investigação → decisão → verificação de
  saída → nove travas, e grava `decisao_ia`, `suggested_reply`, status
  `aguardando_revisao`, `enviado_automaticamente = false`.
- Dentro de `decisao_ia` já vão `travas_liberadas` (booleano) e
  `motivos_travas` (lista de textos, na ordem em que as travas falharam).
- `sendSupportEmail` tem **um único chamador**: a rota do botão do Pedro.
- Categoria `tecnico` responde com modelo fixo, para cliente identificado ou
  não — decisão do Diogo em 24/08.

---

## Parte A — a chave geral

`SUPORTE_ENVIO_AUTOMATICO`, três posições:

- `off` — nunca envia, sempre rascunho. **É o padrão e é onde ficamos.**
- `shadow` — decide e grava tudo, mas não envia. Serve para comparar, por
  semanas, o que a IA teria mandado com o que o humano mandou.
- `on` — envia de verdade quando passar nas nove travas.

Três regras de implementação, e nenhuma é detalhe:

**1. Variável ausente significa `off`.** Nunca `on`, nunca "assume o último
valor". Qualquer coisa diferente de `shadow` e `on` é `off`. É o mesmo padrão
do `isBearerOrQueryTokenAuthorized`, que faz `if (!expectedEnvValue) return
false` — falta de configuração vira negativa, não permissão.

**2. A chave é lida num lugar só**, numa função `modoDeEnvio()`. Não espalhe
`process.env.SUPORTE_ENVIO_AUTOMATICO` pelo código: com o tempo alguém lê num
lugar e esquece no outro, e aí metade do sistema acha que está desligado.

**3. A chave é a décima condição, não a primeira.** Ela não substitui as nove
travas — ela se soma. `on` com trava reprovada continua sendo rascunho.

Acrescente a variável em `db/aws/sistema-suplemento-taskdef.json`, que virou a
fonte da verdade do que o contêiner enxerga. Se esquecer, a verificação 6/6 do
`conferir-deploy.sh` acusa.

### Estado real depois da Parte A: `on` ainda não envia

Verificado em 24/08/2026. A chave existe, é lida num lugar só, e o resultado
(`liberado_para_envio`) é gravado no registro do job. Mas **nada consome esse
resultado**, porque não existe chamada de envio dentro do `support_analyze` —
o único `sendSupportEmail` do sistema continua sendo o botão do Pedro.

Ou seja: hoje, virar a chave para `on` **não faz nada acontecer**. Isso é o
estado mais seguro possível, e é de propósito. Mas está escrito aqui porque
uma chave que não faz o que o nome promete é a mesma armadilha do job que se
registra como concluído sem ter feito o trabalho.

**Quando o envio for ligado, ele entra em um lugar só, guardado por
`liberadoParaEnvio` e por nada mais.** Não acrescente uma segunda porta.

---

## Parte B — o painel do Pedro

Em `src/app/suplementos/(admin)/admin/suporte/page.tsx`, seguindo o padrão
visual da casca de admin que já existe.

### A regra que manda na tela

**O e-mail original do cliente vai em destaque, acima de tudo.** O resumo da
IA vem abaixo, e claramente marcado como interpretação.

O motivo, escrito pelo Diogo: se o Pedro julgar pelo resumo, uma IA confiante
e errada passa em trinta segundos. Ele precisa julgar pela fonte.

Na prática isso quer dizer: o e-mail do cliente em tamanho de leitura, não em
letra miúda; o bloco da IA visualmente subordinado, com um rótulo do tipo
"leitura da IA" — nunca apresentado como fato.

### O que cada conversa mostra

- o e-mail do cliente, inteiro, em primeiro lugar
- categoria, tom e urgência da triagem
- se a IA achou que resolvia sozinha, e o motivo do escalonamento
- **quais travas reprovaram**, uma a uma, em português — `motivos_travas` já
  vem em lista e na ordem em que falharam. Não mostre só "reprovado": mostrar
  a lista é o que ensina o Pedro a confiar ou desconfiar da máquina
- `dados_usados` — o que a IA diz que consultou
- o rascunho, editável, e o botão de enviar
- o botão de **encerrar**, que manda a mensagem padrão e fecha a conversa

### Abas

- **Na fila** — `nova`, `com_ia`, `aguardando_revisao`
- **Com o suporte** — `com_suporte`, já sob julgamento humano
- **Respondidas pela IA** — `enviado_automaticamente = true`. Hoje fica vazia,
  e é de propósito: ela existe para auditar as primeiras semanas depois que a
  chave virar
- **Encerradas**

---

## Parte C — o que o modo sombra precisa guardar

O `shadow` só vale se, no fim, existir um número. Sem isso a decisão de ligar
o `on` vira fé, que é exatamente o que ele deveria evitar.

**A pergunta que o modo sombra responde:** das conversas em que as nove travas
liberaram, quantas vezes o Pedro mandou o texto da IA praticamente sem mexer?

Para conseguir responder isso:

**Nunca sobrescreva `suggested_reply` com o texto editado pelo Pedro.** Se o
painel salvar a edição por cima do rascunho, a comparação morre e o modo
sombra não serve para nada. O que o Pedro enviou já fica em
`support_messages` com `direction = 'outbound'` — a comparação é entre os
dois. Guarde o rascunho intacto.

Se ajudar a consultar depois, promova `travas_liberadas` de dentro do
`decisao_ia` para coluna própria. É opcional, mas facilita a conta.

---

## Parte D — nada verde sem trabalho feito

Vale para esta entrega como valeu para a anterior. Toda saída antecipada
registra o motivo no payload do job; a regra 8 do vigia transforma isso em
alerta. **Nunca registre sucesso num caminho que não fez o trabalho.**

---

## O que NÃO fazer

- **Não ligue a chave.** Ela nasce em `off` e termina esta entrega em `off`.
- Não mostre o resumo da IA acima do e-mail do cliente.
- Não sobrescreva o rascunho da IA com a edição do Pedro.
- Não deixe a leitura da chave espalhada pelo código.
- Não crie serviço novo na AWS — custo novo precisa da aprovação do Diogo antes.

---

## Critério de pronto

1. `modoDeEnvio()` devolve `off` quando a variável não existe, quando está
   vazia e quando tem qualquer valor estranho. Prove com os três casos.
2. Com a chave em `on` **e** uma trava reprovada, a conversa continua em
   `aguardando_revisao` e nada sai.
3. O painel abre uma conversa real e mostra o e-mail do cliente acima do
   resumo, com os motivos das travas listados um a um.
4. O Pedro edita o rascunho, envia, e `suggested_reply` continua com o texto
   original da IA.
5. O botão de encerrar fecha a conversa; escrever depois abre conversa nova.
6. Todo chamador de `sendSupportEmail` está atrás de um **clique humano**.
   Corrigido em 25/08: o critério dizia "um único chamador", e isso estava
   errado — o botão Encerrar precisa enviar a mensagem padrão, então são dois:
   `responder` e `encerrar`. O que importa nunca foi a contagem, é que
   nenhum caminho automático chegue ao envio. Confira que os dois exigem
   sessão de admin e que nada em `src/lib/inngest/` chama o mailer:
   `grep -rn "sendSupportEmail" src/lib/inngest/` tem que voltar vazio.
7. `enviado_automaticamente` é `false` em todas as conversas ao fim dos testes.
