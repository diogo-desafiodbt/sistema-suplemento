# Prompt — Fase 10, entrega 1: a página da live e a captação de lead

> Referencie no Cursor com `@01-pagina-especial-e-captacao.md`.
> Escrito em 27/08/2026.
> **Este prompt atravessa dois repositórios.** A Parte 2 é no
> `SISTEMA-SUPLEMENTOS/desafio-diabetes`. A Parte 3 é no
> `SITE-DESAFIODIABETES`. Rode uma de cada vez, no repositório certo.

A primeira entrega do microserviço de marketing. Ela existe porque a live tem
data — 14/09/2026 — e a divulgação começa antes. Sem esta entrega você promove
a live sem ter onde guardar quem se inscreveu.

Nada de tela de admin aqui. O que precisa estar de pé é: página no ar, popup
funcionando, lead gravado na base com origem e consentimento.

## O desenho

```
navegador → CloudFront (regra padrão) → S3 → /especial/          [repo SITE]

popup POST → CloudFront (/api/*) → ALB → Lambda "captacao-lead"   [repo SISTEMA]
                                            → RDS, schema marketing
```

Três coisas já conferidas na infra real, para você não perder tempo:

A CloudFront tem quatro comportamentos e o teto do plano é cinco. `/api/*` já
existe, já aceita POST e já aponta para o ALB. A página estática entra pela
regra padrão, que vai para o S3. **Nenhuma regra nova de CloudFront é
necessária.**

O site é `output: "export"`. Não existe servidor nele. O formulário fala com o
backend por `fetch`, e como a página e o endpoint estão no mesmo domínio, não
há CORS envolvido.

A infraestrutura — schema, tabelas, papéis de banco, provisionamento da Lambda
e regra do ALB — **é minha**. Este prompt cobre o código.

---

## Parte 1 — o contrato de banco (já aplicado, não escreva)

Isto está no RDS desde 27/08/2026, em `db/marketing/`. Está aqui para você
conhecer o contrato.

**O papel `captacao_lead` não tem privilégio de tabela nenhum.** Ele não faz
`SELECT`, não faz `INSERT`, não enxerga o schema `public`. O que ele tem é
`EXECUTE` em uma função, e é por ela que a Lambda escreve:

```sql
marketing.captar_lead(
  p_email               TEXT,
  p_nome                TEXT,
  p_telefone            TEXT,
  p_origem              TEXT,
  p_origem_detalhe      TEXT,
  p_texto_consentimento TEXT,
  p_origem_coleta       TEXT
) RETURNS BIGINT
```

A função devolve o id do lead, ou `NULL` quando o e-mail é inválido, o
consentimento veio vazio, ou o endereço está na supressão. Nos três casos de
`NULL` a Lambda responde 200 igual.

Dentro dela já acontecem, testados: normalização do e-mail para minúsculas,
conferência da supressão, `ON CONFLICT` que **não** sobrescreve a origem nem
apaga o nome existente, e a inserção do consentimento como fato novo a cada
aceite.

Não replique essas regras no JavaScript. A função é a fonte da verdade.

As tabelas, para você conhecer as colunas:

```sql
CREATE SCHEMA marketing;

CREATE TABLE marketing.lead (
  id                BIGSERIAL PRIMARY KEY,
  uuid              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  email             TEXT NOT NULL,
  nome              TEXT,
  telefone          TEXT,
  origem            TEXT NOT NULL,
  origem_detalhe    TEXT,
  captado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  situacao          TEXT NOT NULL DEFAULT 'ativo',
  enviados          INT NOT NULL DEFAULT 0,
  abertos           INT NOT NULL DEFAULT 0,
  clicados          INT NOT NULL DEFAULT 0,
  ultimo_evento_em  TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_lead_email ON marketing.lead (LOWER(email));

CREATE TABLE marketing.consentimento (
  id             BIGSERIAL PRIMARY KEY,
  lead_id        BIGINT NOT NULL REFERENCES marketing.lead(id),
  texto          TEXT NOT NULL,
  origem_coleta  TEXT NOT NULL,
  aceito_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE marketing.supressao (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  motivo       TEXT NOT NULL,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_supressao_email ON marketing.supressao (LOWER(email));
```

Existe também `marketing.origem`, com a lista fechada de códigos válidos.
Origem fora dela é recusada pela chave estrangeira. Hoje há duas:
`newsletter` e `live-14-09`.

---

## Parte 2 — a Lambda de captação [repo SISTEMA]

Pasta nova na raiz: **`funcoes/captacao-lead/`**.

Fora de `satelites/`, de propósito. Tudo que está em `satelites/` exige cookie
de admin; esta função atende a internet aberta. Misturar as duas coisas na
mesma pasta apagaria essa diferença justamente onde ela importa.

```
funcoes/captacao-lead/
  handler.mjs
  package.json     → postgres, @aws-sdk/rds-signer
  LEIA-ME.md
```

Copie o padrão de conexão de `satelites/alertas/handler.mjs`: token IAM, sem
senha, `postgres` com timeout de consulta.

### O que o endpoint aceita

`POST /api/lead`, corpo JSON:

```json
{
  "nome": "Maria",
  "email": "maria@exemplo.com",
  "consentimento": true,
  "origem": "live-14-09",
  "origem_detalhe": "instagram-stories",
  "captcha": "<token>",
  "sobrenome": ""
}
```

O campo `sobrenome` é armadilha. Fica escondido no formulário e nenhuma pessoa
o preenche. Se vier com conteúdo, responda 200 e não grave nada.

### A ordem das validações

1. Método diferente de `POST` → 405.
2. Corpo acima de 4 KB → 413, sem tentar ler o JSON.
3. JSON inválido → 400.
4. `sobrenome` preenchido → 200 sem gravar.
5. `consentimento` diferente de `true` → 400.
6. E-mail que não bate com um formato razoável → 400.
7. Captcha inválido → 400.
8. Só então o banco.

Valide o captcha **antes** de abrir conexão com o RDS. Uma requisição de robô
não pode custar uma conexão de banco.

### A escrita

Uma chamada, e só ela:

```js
const [{ captar_lead: id }] = await sql`
  SELECT marketing.captar_lead(
    ${email}, ${nome}, ${origem}, ${origemDetalhe},
    ${TEXTO_CONSENTIMENTO}, ${'popup /especial'}
  )`
```

`TEXTO_CONSENTIMENTO` é uma constante no topo do arquivo, com o texto integral
que apareceu na tela — não um resumo, não `true`. Ele fica no servidor de
propósito: texto de consentimento enviado pelo navegador é texto que o
navegador pode trocar.

Se `id` vier `null`, responda 200 mesmo assim.

Normalização de e-mail, conferência de supressão e regra de conflito estão
dentro da função. Não repita nada disso aqui.

### A resposta

Sempre `200 {"ok": true}` quando a requisição é válida — cadastro novo,
cadastro repetido ou e-mail suprimido, tudo responde igual.

Responder diferente para e-mail já existente entrega uma forma de descobrir
quem está na base, uma consulta por vez.

### Os logs

Nenhum e-mail, nome ou token em log. Registre método, resultado e o motivo
quando houver recusa. Se precisar identificar uma linha depois, use o `id`
retornado.

---

## Parte 3 — a página `/especial` [repo SITE]

Rota nova: `src/app/especial/page.tsx`. **Fora do route group `(site)`**, pelo
mesmo motivo da página de obrigado — a página da live não usa o Header do site.
O Footer permanece.

Diferente da página de obrigado, esta é **indexável**. Ela recebe tráfego de
divulgação e não tem motivo para `noindex`.

Visual e tipografia seguem `docs/contexto-projeto.md`. O público é
majoritariamente idoso: corpo de texto grande, contraste alto, botão largo.

Reaproveite o `ContagemRegressiva.tsx` que já existe em `src/app/live/`.
Se precisar ajustá-lo, extraia para um componente compartilhado em vez de
duplicar.

### O popup

Componente cliente. Abre em três situações, e no máximo uma vez por pessoa:

- clique em qualquer botão de inscrição da página;
- quinze segundos na página;
- movimento do cursor em direção ao topo da janela, saindo.

Depois que a pessoa fecha ou se cadastra, grave uma marca em `localStorage` e
não abra de novo. Envolva a leitura e a escrita do `localStorage` em
`try/catch`: navegador em janela anônima lança exceção, e isso não pode
derrubar a página.

Fecha com `Esc` e com clique fora. Foco vai para o primeiro campo ao abrir e
volta para o botão de origem ao fechar.

### Os campos

Nome, e-mail, uma caixa de consentimento e o campo-armadilha `sobrenome`,
escondido com CSS e com `tabindex="-1"` e `autocomplete="off"`.

O texto da caixa de consentimento, exatamente assim:

> Aceito receber por e-mail conteúdos, avisos e ofertas do Desafio Diabetes
> sobre controle e reversão do diabetes.

Esse texto é o que vai gravado em `marketing.consentimento`. Ele menciona
diabetes de propósito: consentimento para dado ligado a saúde precisa dizer a
que se refere, e não pode ser genérico.

A caixa começa **desmarcada** e o botão fica desabilitado enquanto ela estiver
assim. Caixa pré-marcada não é consentimento.

### O envio

`fetch` para `/api/lead`, mesmo domínio, sem CORS.

Enquanto espera, o botão mostra estado de envio e não aceita segundo clique.
Sucesso troca o conteúdo do popup por uma confirmação curta. Falha mostra uma
mensagem pedindo para tentar de novo, mantendo o que a pessoa já digitou.

### O captcha

Cloudflare Turnstile, na versão gratuita. O script entra só na página
`/especial`, nunca no site inteiro.

A chave pública vai no código da página; a secreta vai na variável de ambiente
da Lambda, e é minha. Se a conta ainda não existir quando você chegar aqui,
deixe o componente pronto lendo a chave de variável e siga — a validação no
servidor já está escrita e passa a valer quando a chave existir.

---

## O que não fazer

Não crie regra de CloudFront. O teto é cinco e a rota necessária já existe.

Não coloque a função de captação em `satelites/`. Aquela pasta significa "exige
admin".

Não instale biblioteca de formulário, de validação ou de captcha além do script
do Turnstile. O formulário tem três campos.

Não escreva `INSERT` nem `SELECT` em tabela de `marketing`. O papel não tem
esse privilégio e a tentativa falha em produção mesmo que passe no seu teste
local.

Não reimplemente no JavaScript o que a função já faz: minúsculas, supressão,
conflito de origem.

Não aceite o texto do consentimento vindo do navegador.

Não retorne resposta diferente para e-mail já cadastrado.

Não escreva e-mail nem nome em log.

Não mexa no Header, no Footer nem no `globals.css` do site além do necessário
para a página nova.

## Como verifico

O comportamento do banco já está testado e passou: mesmo e-mail em caixas
diferentes vira um lead só, origem não é sobrescrita, cada aceite gera um
consentimento novo, e-mail suprimido e e-mail inválido devolvem `NULL`.

O que verifico aqui é a Lambda e a página.

Cadastro novo pelo popup aparece em `marketing.lead` com origem `live-14-09` e
uma linha em `marketing.consentimento` com o texto integral.

Requisição com `sobrenome` preenchido responde 200 e não grava.

Requisição sem captcha válido responde 400 sem abrir conexão com o banco.

A página abre em celular com o popup legível, fecha com `Esc`, e não reabre
depois de fechada.
