# Prompt — a aba de alertas como PRIMEIRO SATÉLITE (Zona 2)

> **Não rodar antes da Fase 6.** Decidido pelo Diogo em 19/08/2026.

## Por que este prompt está na Fase 6 e não na de observabilidade

Ele foi escrito para o núcleo, lendo `alertas` pelo `getSql()` com a credencial
`app_web` — a mesma que alcança prontuário. Isso contraria a regra de zonas:

> *"Essa tela precisa ler quiz, protocolo, prescrição, CPF ou endereço?"*
> Se não, é microserviço. **Todo serviço novo nasce na Zona 2.**

A aba lê **uma tabela**, `alertas`. Nenhum dado clínico, nenhum CPF, nenhum
endereço. **A resposta é não — ela é Zona 2.**

E é o melhor primeiro satélite que existe no sistema: lê zero dado clínico, não
escreve nada, e se der errado ninguém se machuca. Serve de ensaio barato do
padrão que a Fase 6 vai aplicar em coisas mais delicadas.

**A credencial já existe:** o papel `vigia` tem `SELECT` em `alertas` e em mais
nada de escrita. O satélite pode usar essa identidade — não precisa de
credencial nova nem de acesso ao núcleo.

**Regra de custo que vale aqui:** satélite não nasce em contêiner. Estático ou
função sob demanda; contêiner ligado 24h para uma tela consultada raramente é
US$ 7/mês de ociosidade.

## O que precisa ser decidido quando a Fase 6 começar

- Como o satélite autentica quem entra (a casca entrega sessão, nunca dado)
- Estático com dado embutido na build, ou função sob demanda consultando ao vivo
- Se entra na casca do admin como aba ou vive em endereço próprio

O corpo abaixo descreve o CONTEÚDO da tela, que continua válido. O que muda é
onde ela mora e com que credencial lê.

---

> Referencie no Cursor com `@01-alertas-primeiro-satelite.md`.
> Branch: `reestrutura-suplementos`.

Uma página nova e uma linha na navegação. Faz parte da **fase de
observabilidade**, criada em 19/08/2026 depois de a camada assíncrona inteira
ficar dias parada sem gerar um único erro.

## O que já existe (não precisa criar)

A tabela **`alertas`** está no banco `clinico` e já é alimentada de hora em hora
por uma tarefa agendada fora da aplicação. `app_web` tem **`SELECT`** nela.

```
id             uuid
digital        text         -- impressão digital: tipo + chave do problema
tipo           text         -- pagamento-sem-pedido, job-atrasado, ...
detalhe        jsonb        -- e-mail, valor, horas, nome do job...
visto_em       timestamptz  -- quando apareceu
ultima_vez_em  timestamptz  -- última execução que ainda viu o problema
notificado_em  timestamptz  -- quando virou e-mail (nulo = ainda não)
resolvido_em   timestamptz  -- nulo = aberto
```

Tipos possíveis hoje: `pagamento-sem-pedido`, `assinada-sem-despacho`,
`job-atrasado`, `job-falhou`, `suporte-sem-resposta`, `assinatura-vencida`.

**Não invente escrita.** A página é somente leitura: quem escreve é o vigia.
Se aparecer `INSERT`/`UPDATE`/`DELETE` em `alertas`, está errado.

## A página: `src/app/suplementos/(admin)/admin/alertas/page.tsx`

Siga o padrão das outras telas do admin (`clientes`, `suporte`): componente de
servidor, `getSql()`, sem client component desnecessário.

### Bloco 1 — quando o vigia rodou pela última vez

**Este é o bloco mais importante da página, e o menos óbvio.**

```sql
SELECT max(greatest(visto_em, ultima_vez_em)) AS ultima_passagem FROM alertas
```

Mostre a idade dessa data em destaque. Se passar de **90 minutos**, pinte como
problema e escreva algo como *"o vigia não passa por aqui há X horas"*.

Motivo: se o vigia morrer, a tela fica mostrando dado velho e parece saudável.
Uma tela de alertas que não sabe se está atualizada é pior que nenhuma — ela
transmite calma falsa. **Quem vigia o vigia é esta linha.**

### Bloco 2 — abertos

`WHERE resolvido_em IS NULL`, agrupados por `tipo`, mais antigo primeiro.

Para cada um: o tipo em linguagem de gente, o conteúdo relevante do `detalhe`,
e há quanto tempo está aberto (a partir de `visto_em`).

Distinga visualmente **notificado** de **ainda não notificado** — o segundo é
coisa que apareceu agora e ainda não te acordou.

Rótulos em português, não o slug:

| tipo | rótulo |
|---|---|
| `pagamento-sem-pedido` | Pagamento sem pedido |
| `assinada-sem-despacho` | Prescrição assinada sem despacho |
| `job-atrasado` | Rotina atrasada |
| `job-falhou` | Rotina falhou |
| `suporte-sem-resposta` | Cliente sem resposta |
| `assinatura-vencida` | Assinatura vencida |

### Bloco 3 — resolvidos nas últimas 48h

`WHERE resolvido_em > now() - interval '48 hours'`, discreto, no fim.

Não é enfeite: é a prova de que o vigia fecha o que conserta. Sem esse bloco,
alerta que some parece alerta que foi perdido.

### Estado vazio

Se não houver nada aberto, diga que está tudo certo **e mostre quando foi a
última passagem do vigia**. "Nenhum alerta" sozinho é ambíguo — pode significar
"tudo bem" ou "ninguém olhou".

## Navegação

`src/components/admin/AdminNav.tsx` tem uma lista de abas. Acrescente
**Alertas** — sugiro logo depois de `Visão Geral`, porque é o que se olha
primeiro num dia ruim.

Se der para mostrar a contagem de abertos junto do rótulo (tipo `Alertas 3`),
melhor; mas **não** faça isso custar uma consulta em toda navegação do admin —
se complicar, deixe só o rótulo.

## Sobre "tempo real"

O Diogo pediu tempo real. **O dado nasce de hora em hora**, então atualização
contínua mostraria a mesma coisa 3.600 vezes.

Se quiser, ponha `export const revalidate = 60` na página — atualiza a cada
minuto quando alguém está com ela aberta, e é honesto com a cadência real.
**Não** implemente polling, websocket nem streaming.

## O que NÃO fazer

- **Não escreva em `alertas`.** Leitura apenas.
- **Não rode SQL contra o banco**, não faça deploy, não mexa em task definition,
  Secrets Manager, EventBridge ou CloudWatch.
- **Não mexa no `db/vigia/`** — o SQL do vigia não é da aplicação.
- **Não crie botão de "resolver" ou "silenciar".** O vigia fecha sozinho quando
  a condição some; um botão manual criaria estado que o vigia não conhece e as
  duas verdades divergiriam.
- **Não crie `/nova-senha`** nem mexa na trava de assinatura concorrente.

## Critério de pronto

1. `npm run build` e `npx tsc --noEmit` passam.
2. `/suplementos/admin/alertas` existe e aparece na navegação.
3. A página mostra a idade da última passagem do vigia, com destaque acima de
   90 minutos.
4. `grep -n "alertas" src/app/suplementos/\(admin\)/admin/alertas/page.tsx`
   não mostra `INSERT`, `UPDATE` nem `DELETE`.
5. O estado vazio informa a última passagem do vigia.

Quando terminar, me chame para verificar antes de mexer em qualquer outra coisa
no editor.
